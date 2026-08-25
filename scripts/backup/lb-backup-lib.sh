#!/usr/bin/env bash
# Shared helpers for Locator Beast backups.
#
# ── WHERE BACKUPS GO ────────────────────────────────────────────────────────
# LB_BACKUP_DIR defaults to a vault OUTSIDE this repository. That is deliberate:
# a dump of the production database contains renter PII (income, credit score,
# eviction and criminal history), so it must be impossible to `git add` by
# accident. Nothing under this path is ever inside the working tree.
#
# ── ENCRYPTION ──────────────────────────────────────────────────────────────
# AES-256-CBC via openssl with PBKDF2 (600k iterations) and a random salt. The
# passphrase comes from a key FILE, never from a command-line argument, so it
# cannot leak through `ps` or shell history.
#
# openssl enc gives confidentiality but NOT authentication, so every artifact is
# paired with a SHA-256 of its plaintext recorded in the manifest. Restore
# verifies that checksum and refuses a mismatch — that is the integrity check
# openssl enc does not provide on its own.
#
# `age` would be the better primitive (authenticated, simpler) but is not
# installed on this machine, and installing it is a change this checkpoint has
# not been approved to make. openssl is already present.
set -euo pipefail

LB_BACKUP_DIR="${LB_BACKUP_DIR:-$HOME/LocatorBeastBackups}"
LB_KEYFILE="${LB_KEYFILE:-$HOME/.config/locatorbeast/backup.key}"
LB_PROJECT_REF="${LB_PROJECT_REF:-onwrrajmklxtnabekzcy}"

lb_require_key() {
  if [ ! -f "$LB_KEYFILE" ]; then
    echo "ERROR: no backup key at $LB_KEYFILE" >&2
    echo "Create one ONCE with:" >&2
    echo "  mkdir -p \"\$(dirname \"$LB_KEYFILE\")\" && openssl rand -base64 48 > \"$LB_KEYFILE\" && chmod 600 \"$LB_KEYFILE\"" >&2
    echo "Then store a copy in your password manager. Losing it makes every backup unreadable." >&2
    return 1
  fi
  # A key readable by other accounts is not a key.
  local perms; perms=$(stat -f %Lp "$LB_KEYFILE")
  [ "$perms" = "600" ] || { echo "ERROR: $LB_KEYFILE must be chmod 600 (currently $perms)" >&2; return 1; }
}

# lb_encrypt <plaintext-file> <output.enc>  — plaintext is shredded afterwards.
lb_encrypt() {
  local src="$1" out="$2"
  openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt \
    -in "$src" -out "$out" -pass "file:$LB_KEYFILE"
  chmod 600 "$out"
  # Overwrite before unlinking so the plaintext is not recoverable from free space.
  dd if=/dev/urandom of="$src" bs=1m count=1 conv=notrunc 2>/dev/null || true
  rm -f "$src"
}

# lb_decrypt <input.enc> <plaintext-out>
lb_decrypt() {
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
    -in "$1" -out "$2" -pass "file:$LB_KEYFILE"
}

lb_sha256() { shasum -a 256 "$1" | awk '{print $1}'; }
lb_stamp()  { date -u +%Y%m%dT%H%M%SZ; }
