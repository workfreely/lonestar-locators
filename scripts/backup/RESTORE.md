# Locator Beast — Restore Procedures

Project ref `onwrrajmklxtnabekzcy` · org `Locator Beast` (Pro) · region `us-east-2`

## What protection actually exists

| layer | status | window | granularity |
|---|---|---|---|
| Supabase daily backups | **active** (Pro) | 7 days (2026-08-18 →) | full-project only |
| PITR | **not enabled** | — | would be minute-level, $100/mo |
| Logical dumps | **script ready, blocked on tooling** | per-migration | table / row level |
| Storage backup | **script ready** | per-run | single object |

Two properties drive every procedure below:

1. **A Supabase restore is full-project.** Restoring to undo one customer's
   mistake rolls back *every* customer. Selective recovery must come from a
   logical dump, never from the daily backup.
2. **Supabase backups never include Storage.** A database restore returns rows
   whose `profile_photo_url` points at objects that may no longer exist.
   Database and Storage must be restored together or images break.

---

## 1. Accidental migration or bad DELETE

**First: stop writes.** Every minute of live traffic widens the gap between the
recovery point and now.

**If a pre-migration checkpoint exists (preferred):**
```bash
source scripts/backup/lb-backup-lib.sh
cd ~/LocatorBeastBackups/db/<stamp>
cat manifest.json                        # confirm git_sha matches the deploy you are undoing
lb_decrypt data.sql.enc /tmp/data.sql
shasum -a 256 /tmp/data.sql              # MUST equal plaintext_sha256 in manifest.json
```
Restore into a **scratch Supabase project first**, never straight into
production. Verify row counts, then copy back only the affected tables.

**If no checkpoint exists:** the Supabase daily backup is the only option —
Dashboard → Database → Backups → Restore. Full-project, up to ~24h of loss.
Everything written since the last nightly snapshot is gone.

## 2. Deleted Storage object

The exact path is the restore key: `branding/<user-uuid>/<filename>`. Storage RLS
scopes writes to `(storage.foldername(name))[1] = auth.uid()`, and the public URL
embeds the same path — so restoring to the identical path makes existing
database URLs work again **with no row edits**.

```bash
# find it in the most recent Storage backup
jq '.objects[] | select(.path | contains("<filename>"))' \
   ~/LocatorBeastBackups/storage/<stamp>/manifest.json
```
Re-upload to the identical `bucket/path`, then verify `sha256` against the
manifest entry. If — and only if — the object must come back under a *different*
name, the manifest's `referenced_by` tells you exactly which row and column to
repair (`profiles.profile_photo_url`, `profiles.business_logo_url`,
`workspaces.logo_url`).

## 3. Single user or workspace recovery

**Do not use the daily backup for this.** It would overwrite every other tenant.

1. Restore the relevant logical dump into a **scratch project**.
2. Extract only that tenant's rows, following the isolation key
   `workspace_members.workspace_id` → `leads.workspace_id` and the other
   `workspace_id`-scoped tables (`lead_next_actions`, `lead_favorites`,
   `lead_timeline`, `lead_properties`).
3. Re-insert into production inside a transaction, preserving original UUIDs so
   foreign keys and public URLs continue to resolve.
4. Restore that user's Storage objects (procedure 2) — their avatar lives under
   their own UUID folder.

## 4. Restore test (do this before real customers)

An untested backup is a hypothesis. Once per quarter, and once before launch:
create a scratch project, restore the newest checkpoint into it, confirm row
counts and that a Smart Form page renders with its avatar. Record the date.

---

## Encryption

AES-256-CBC, PBKDF2, 600,000 iterations, random salt, via `openssl`. The
passphrase is read from a **key file** (`~/.config/locatorbeast/backup.key`,
mode 600) and never passed as an argument, so it cannot leak via `ps` or shell
history. Plaintext is overwritten with random bytes and unlinked immediately
after encryption.

`openssl enc` provides confidentiality but **not authentication**, so every
artifact carries a SHA-256 of its plaintext in `manifest.json`. Restore verifies
that checksum and refuses a mismatch — that is the integrity guarantee.

**Losing the key file makes every backup permanently unreadable.** Store a copy
in a password manager the moment it is created.

`age` would be the better primitive (authenticated, simpler). It is not
installed on this machine; adopting it is a one-line swap in `lb-backup-lib.sh`.
