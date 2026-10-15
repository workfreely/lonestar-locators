#!/usr/bin/env bash
# Wrapper: prove the revision triggers from the LIVE catalog, then run the manifest writer.
set -euo pipefail
cd "$(dirname "$0")/../.."
PROOF="$(mktemp -t trigproof)"
psql "$(cat supabase/.temp/pooler-url)" -At -c "
  select coalesce(json_agg(json_build_object('table', c.relname, 'tgname', t.tgname, 'enabled', t.tgenabled)), '[]')
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal and n.nspname = 'public'
    and t.tgfoid = 'public.social_capture_revision'::regproc;" > "$PROOF"
echo "trigger proof: $(cat "$PROOF" | head -c 200)…"
TRIGGER_PROOF="$PROOF" npx tsx scripts/social/applyGeoManifest.ts "$@"
rm -f "$PROOF"
