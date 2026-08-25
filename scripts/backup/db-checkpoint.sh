#!/usr/bin/env bash
# Pre-migration logical checkpoint for the Locator Beast production database.
#
# RUN BEFORE EVERY `supabase db push` OR ANY DESTRUCTIVE CHANGE.
#
# Supabase Pro daily backups are a floor, not a substitute: they are FULL-PROJECT
# only and up to ~24h stale, so restoring one to undo a bad migration rolls every
# other customer back too. A logical dump is what makes selective, single-
# workspace recovery possible — see RESTORE.md.
#
# ── CONNECTION ──────────────────────────────────────────────────────────────
# Uses the PostgreSQL 17 client directly. NOT `supabase db dump`, which requires
# Docker; and not the system pg_dump, which is 16.x and refuses to dump a 17.x
# server ("server version mismatch").
#
# Target is the POOLER on port 5432 — session mode. Port 6543 is transaction
# mode and cannot serve pg_dump. The direct host db.<ref>.supabase.co is
# IPv6-only and does not resolve on this machine.
#
# ── CREDENTIALS ─────────────────────────────────────────────────────────────
# The password is read by libpq from ~/.pgpass (mode 600). It is never passed as
# an argument, never placed in an environment variable, and never echoed — so it
# cannot leak through `ps`, shell history, or CI logs.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/backup/lb-backup-lib.sh

PG_BIN="${LB_PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
PGHOST="${LB_PGHOST:-aws-0-us-east-2.pooler.supabase.com}"
PGPORT="${LB_PGPORT:-5432}"
PGUSER="${LB_PGUSER:-postgres.onwrrajmklxtnabekzcy}"
PGDATABASE="${LB_PGDATABASE:-postgres}"
SCHEMAS="${LB_DUMP_SCHEMAS:-public}"
MODE="${1:-full}"                       # full | schema-only
export PGHOST PGPORT PGUSER PGDATABASE PGSSLMODE=require

lb_require_key
[ -x "$PG_BIN/pg_dump" ] || { echo "ERROR: pg_dump 17 not found at $PG_BIN" >&2; exit 1; }
case "$("$PG_BIN/pg_dump" --version)" in *" 17."*) ;; *) echo "ERROR: pg_dump must be 17.x" >&2; exit 1;; esac
if [ ! -f "$HOME/.pgpass" ]; then
  echo "ERROR: no ~/.pgpass — see scripts/backup/RESTORE.md for the one-time setup command." >&2
  exit 1
fi
[ "$(stat -f %Lp "$HOME/.pgpass")" = "600" ] || { echo "ERROR: ~/.pgpass must be chmod 600" >&2; exit 1; }

STAMP="$(lb_stamp)"
GIT_SHA="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
OUT="$LB_BACKUP_DIR/db/$STAMP"
mkdir -p "$OUT"; chmod 700 "$LB_BACKUP_DIR" "$LB_BACKUP_DIR/db" "$OUT"

echo "→ checkpoint $STAMP  git=$GIT_SHA  mode=$MODE  schemas=$SCHEMAS"
echo "→ $PGUSER@$PGHOST:$PGPORT/$PGDATABASE  →  $OUT"

declare -a NAMES=() SHAS=() SIZES=()
schema_args=(); IFS=',' read -ra S <<< "$SCHEMAS"; for s in "${S[@]}"; do schema_args+=(--schema="$s"); done

dump_part() {                       # dump_part <name> <extra pg_dump args...>
  local name="$1"; shift
  local tmp="$OUT/$name.sql"
  echo "  · $name"
  "$PG_BIN/pg_dump" --no-owner --no-privileges "${schema_args[@]}" "$@" -f "$tmp"
  local sha size
  sha="$(lb_sha256 "$tmp")"; size="$(wc -c < "$tmp" | tr -d ' ')"
  [ "$size" -gt 0 ] || { echo "    ERROR: $name dumped 0 bytes — refusing to record an empty checkpoint" >&2; exit 1; }
  lb_encrypt "$tmp" "$OUT/$name.sql.enc"
  NAMES+=("$name"); SHAS+=("$sha"); SIZES+=("$size")
  echo "    ${size} bytes  sha256=${sha:0:16}…  → $name.sql.enc"
}

dump_part schema --schema-only
if [ "$MODE" = "full" ]; then
  # --disable-triggers is REQUIRED, not optional: pg_dump reports circular
  # foreign-key constraints on `leads`, so a plain data-only dump cannot be
  # restored in dependency order. Without this the dump looks fine and only
  # fails at the moment you actually need it.
  dump_part data --data-only --disable-triggers
else
  echo "  · skipping data (schema-only — no customer data written to disk)"
fi

{
  echo "{"
  echo "  \"stamp\": \"$STAMP\","
  echo "  \"project_ref\": \"$LB_PROJECT_REF\","
  echo "  \"git_sha\": \"$GIT_SHA\","
  echo "  \"mode\": \"$MODE\","
  echo "  \"schemas\": \"$SCHEMAS\","
  echo "  \"pg_dump\": \"$("$PG_BIN/pg_dump" --version | tr -d '\n')\","
  echo "  \"encryption\": \"aes-256-cbc pbkdf2 600000 salted (openssl)\","
  echo "  \"artifacts\": ["
  for i in "${!NAMES[@]}"; do
    printf '    {"name": "%s.sql.enc", "plaintext_bytes": %s, "plaintext_sha256": "%s"}' \
      "${NAMES[$i]}" "${SIZES[$i]}" "${SHAS[$i]}"
    [ "$i" -lt $(( ${#NAMES[@]} - 1 )) ] && echo "," || echo ""
  done
  echo "  ]"
  echo "}"
} > "$OUT/manifest.json"
chmod 600 "$OUT/manifest.json"
echo "✓ checkpoint complete → $OUT"
