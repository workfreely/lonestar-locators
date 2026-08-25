# Locator Beast — Restore Procedures

Project ref `onwrrajmklxtnabekzcy` · org `Locator Beast` (Pro) · region `us-east-2`

## What protection actually exists

| layer | status | window | granularity |
|---|---|---|---|
| Supabase daily backups | **active** (Pro) | 7 days (2026-08-18 →) | full-project only |
| PITR | **not enabled** | — | would be minute-level, $100/mo |
| Logical dumps | **validated** (PG17 client) | per-migration | table / row level |
| Storage backup | **validated** | per-run | single object |

### ⚠️ Circular foreign keys — why restore order matters

`pg_dump` reports circular foreign-key constraints in this database:

```
pg_dump: warning: there are circular foreign-key constraints on this table:
pg_dump: detail: leads
pg_dump: detail: companion_refresh_tokens
pg_dump: warning: there are circular foreign-key constraints among these tables:
pg_dump: detail: leads
pg_dump: detail: lead_favorites
```

`leads` and `lead_favorites` reference each other. Verified against the schema
dump:

```
leads_top_pick_favorite_id_fkey  FOREIGN KEY (top_pick_favorite_id) REFERENCES public.lead_favorites(id)
lead_favorites_lead_id_fkey      FOREIGN KEY (lead_id)              REFERENCES public.leads(id)
```

There is therefore **no ordering of plain `INSERT`/`COPY` statements that
satisfies both constraints**: whichever table loads first contains rows pointing
at rows that do not exist yet. `lead_next_actions.property_id` and
`lead_tours.property_id` also reference `lead_favorites`, widening the cycle.

**This is why `db-checkpoint.sh` passes `--disable-triggers` to the data dump,
and why the resulting `data.sql` contains `DISABLE TRIGGER` statements — 32 of
them, one per `COPY` block. They are intentional. They are not corruption, and
they must not be stripped.**

The statements are interleaved per table throughout the file (first `DISABLE` at
line 28, last `ENABLE` at line 726 in the validated dump) — not grouped at the
file edges. Each `COPY` is wrapped like this:

```sql
ALTER TABLE public.leads DISABLE TRIGGER ALL;
COPY public.leads (...) FROM stdin;
...
ALTER TABLE public.leads ENABLE TRIGGER ALL;
```

Disabling triggers suspends foreign-key enforcement for the duration of the
load, so the circular pair can be inserted in any order and the constraints are
re-checked only once everything is present.

Two consequences to plan for:

* **`ALTER TABLE ... DISABLE TRIGGER ALL` requires superuser or table
  ownership.** Restore as the `postgres` role. Restoring as a lesser role fails
  with `permission denied`, and the dump will look broken when the problem is
  actually the connecting role.
* **A data dump taken WITHOUT `--disable-triggers` looks perfectly healthy on
  disk and only fails at the moment you need it.** It decrypts, its checksum
  matches, it contains all the rows — and then the restore aborts on a foreign
  key violation. If you ever hand-roll a dump, include the flag.

---

Two further properties drive every procedure below:

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

**Safe restore order is schema → data → verification.** Do not vary it: the data
dump carries no `CREATE TABLE`, so loading it into an empty database fails on
the first `COPY`; and verification before the triggers are re-enabled would pass
against unvalidated constraints.

**Step 1 — decrypt and verify both artifacts.**
```bash
source scripts/backup/lb-backup-lib.sh
cd ~/LocatorBeastBackups/db/<stamp>
cat manifest.json                        # confirm git_sha matches the deploy you are undoing

lb_decrypt schema.sql.enc /tmp/schema.sql
lb_decrypt data.sql.enc   /tmp/data.sql
shasum -a 256 /tmp/schema.sql /tmp/data.sql   # BOTH must equal plaintext_sha256 in manifest.json
```
A checksum mismatch means the artifact is damaged. Stop — do not restore it.

**Step 2 — schema first, into a scratch project.** Never straight into
production.
```bash
PG=/opt/homebrew/opt/postgresql@17/bin
"$PG/psql" -v ON_ERROR_STOP=1 -f /tmp/schema.sql "<scratch-connection-string>"
```
`ON_ERROR_STOP=1` matters: without it `psql` reports success after skipping
failed statements, leaving a half-built schema that looks fine.

**Step 3 — data second, as the `postgres` role.**
```bash
"$PG/psql" -v ON_ERROR_STOP=1 -f /tmp/data.sql "<scratch-connection-string>"
```
The `DISABLE TRIGGER` / `ENABLE TRIGGER` pairs run as part of this file. If you
see `permission denied: ALTER TABLE`, you are not connected as `postgres` — fix
the role rather than editing the dump.

**Step 4 — verify before trusting it.**
```sql
select relname, n_live_tup from pg_stat_user_tables order by n_live_tup desc limit 15;
-- every trigger must be back ON: this MUST return zero rows
select tgrelid::regclass, tgname from pg_trigger where tgenabled = 'D';
-- the circular pair must resolve
select count(*) from leads l join lead_favorites f on f.lead_id = l.id;
```
Only then copy back the affected tables into production.

**Step 5 — shred the plaintext.** `/tmp/schema.sql` and `/tmp/data.sql` contain
renter PII. Overwrite and delete them when finished.

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
