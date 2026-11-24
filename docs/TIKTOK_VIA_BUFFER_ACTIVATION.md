# TikTok automatic publishing through Buffer — the activation runbook

Prepared 2026-11-23. **Steps 1, 2, 3 and the grant hardening are applied. Nothing is deployed and
nothing is armed** — both TikTok destinations now carry a Buffer route, but no Buffer code has
shipped, both arm switches are unset, and automatic posting is still `paused`. Every step is
written so it can be executed, checked and undone independently.

The goal is narrow: Jay's two TikTok accounts publish automatically at 07:30 and 19:30 Central,
through Buffer, without touching his Instagram and without touching Lisette's setup.

---

## The confirmed channel mapping

| Social Beast connection | handle | Buffer channel id | paused today |
|---|---|---|---|
| `ebf475cf-cb0c-4c6b-8af2-99e89c84bc65` | `@realestatepro_tx` — TX Apartment Locator | `6b021ecdece6dfde5f4c40bf` | no |
| `1b5e4878-06b7-47ea-b9e2-73a11aa44e83` | `@locator.beast` — Dallas Locator | `6b02190aece6dfde5f4c0fd6` | **yes** |

Confirmed by the operator on 2026-11-23, by reading each handle against its account. It cannot be
re-derived from the database: a TikTok `open_id` is scoped to the application that issued it, so our
`external_account_id` and Buffer's `serviceId` for the same account are different strings by design.

**The mapping is by id, never by name.** The display name on the Dallas Instagram and Dallas TikTok
was changed to `Jay | Dallas Apt Locator` on 2026-11-23; the accounts did not change. Nothing
between an approved row and Buffer's API reads a name — the route predicate is
`buffer_account_id` + `buffer_channel_id` and nothing else. `social_connections.username` still holds
the name as it was at connect time (`Jay Morris | Dallas Locator`), and it is deliberately not
refreshed: it is a UI label, read by nothing that routes or publishes, and the only way to re-read it
from TikTok is a reconnect. `scripts/social/bufferPublish.test.ts` §14 asserts this rather than
leaving it as a claim.

---

## What exists, and what state it is in

| Piece | State |
|---|---|
| `lib/social/buffer.ts`, `bufferRoute.ts`, `bufferServer.ts`, `bufferGate.ts` | written, uncommitted |
| `app/api/cron/social-buffer-publish/route.ts` | written, uncommitted |
| `vercel.json` cron entry | added, uncommitted |
| `scripts/store-buffer-key.mjs` | written, uncommitted, **run once 2026-11-23** |
| `supabase/prepared/20261122000000_buffer_publish_route.sql` | **APPLIED 2026-11-23** — see the record below |
| `supabase/prepared/20261122000002_jay_tiktok_via_buffer.sql` | **APPLIED 2026-11-23** — see the record below |
| `supabase/prepared/20261123000002_buffer_accounts_grant_hardening.sql` | **APPLIED 2026-11-23** — see the record below |
| `supabase/prepared/20261104000000_tiktok_publish_settings.sql` | prepared, **not applied** |
| `SOCIAL_BUFFER_AUTOPUBLISH_ENABLED` | unset |
| `SOCIAL_BUFFER_TIKTOK_ENABLED` | unset |
| `social_settings.auto_posting` | `paused` |

---

## The order, and why it is this order

Each step is useless without the one before it, and each is reversible until step 8.

**1. Apply `20261122000000_buffer_publish_route.sql`.** ✅ **DONE 2026-11-23.**
Creates `social_buffer_accounts`, the two columns on `social_connections`, and the two RPCs. Writes
no existing row. Harmless on its own: with no row carrying both columns, `isBufferRouted()` is false
everywhere and all three workers behave exactly as today.

> **Applied record.** Run against `onwrrajmklxtnabekzcy` (Locator Beast, East US Ohio) through the
> session-mode pooler, in one transaction, after a full dry run that ended in `rollback` and left
> the catalog untouched. Verified after commit:
>
> - `social_connections.buffer_account_id` (uuid, nullable, no default) and `buffer_channel_id`
>   (text, nullable, no default) exist.
> - `social_buffer_accounts` exists with 7 columns, **0 rows**, RLS **enabled** and **0 policies**.
> - All three indexes exist; the FK `social_connections_buffer_account_id_fkey` has delete rule
>   **RESTRICT**.
> - Both functions are `SECURITY DEFINER`, executable by `service_role` only — `authenticated` and
>   `anon` both false. `sa_set_buffer_api_key` carries the corrected 5-argument signature.
> - All four existing connections: **every tracked field byte-identical** before and after
>   (`status`, `posting_paused`, `posts_per_day`, `stagger_offset_minutes`, `market_restriction`,
>   `token_expires_at`, `external_account_id`, `agent_user_id`, `scopes`, `updated_at`), both new
>   columns NULL on all four, and both Instagram tokens still resolve through
>   `sa_get_instagram_token_by_connection`. `social_settings.auto_posting` still `paused`.
> - `sa_get_buffer_destination` returns **no row** for all four destinations — the route-scoping
>   guard works, so nothing is Buffer-routed.
> - The deploy-order hazard below is **closed**: both native workers' selects now succeed.
>
> **Ledger note.** This file lives in `supabase/prepared/`, not `supabase/migrations/`, so
> `supabase_migrations` has no record of it — consistent with the existing `supabase/manual/`
> convention and with the ledger already being unreliable here. The live catalog is the source of
> truth. Deciding whether to promote this file into `supabase/migrations/` is deliberately left
> open: `supabase db push` would also pick up the unapproved
> `20261121000000_account_deletion_removes_social_beast.sql` sitting there.

**2. Store the Buffer API key.** ✅ **DONE 2026-11-23.**
```
node scripts/store-buffer-key.mjs --label Jay --org 6b01f357d307eb797108b033 --file ~/.buffer/api-key
```
Reads the key from the 0600 file, refuses if the file is group- or world-readable, passes it as a
bind parameter, and prints only the account id. The key never reaches SQL, a log, argv or the
terminal. It is a different key from Lisette's and lands in a different account row — that
separation is what makes it impossible for one account's channels to publish with the other's
credential.

> **Applied record.** `social_buffer_accounts.id = 9d74a2cd-8bfe-4101-b0cc-3320d4ac0dd6`,
> label `Jay`, organization `6b01f357d307eb797108b033`, owner `c567c077…`. One row in the table;
> **none labelled Lisette** — hers was never stored, so there was nothing of hers to overwrite, and
> `vault.secrets` named `social:buffer:%` went 0 → 1 while the 4 Instagram and 2 TikTok secrets were
> untouched (total 53 → 54).
>
> Verified without the key appearing anywhere:
>
> - **Vault holds exactly the file's key.** SHA-256 of `~/.buffer/api-key` and of the decrypted
>   stored secret are equal (both 43 chars, fingerprint `40c2c686`). Lisette's file fingerprints
>   `5fd69519` — a different credential.
> - **The stored key opens Jay's Buffer account, asked with the stored key itself**:
>   `locatorbeast@gmail.com`, organizations = `6b01f357d307eb797108b033` only. Lisette's org
>   `6b02f92207e3daab800671f4` is **not** reachable with it.
> - **It reaches exactly the two confirmed channels** — `@realestatepro_tx` and `@locator.beast`,
>   both TikTok, neither disconnected nor locked — and **no Instagram channel**, so Jay's Instagram
>   stays native by construction.
> - **Not reachable by anyone else.** As `anon`: 0 rows from `social_buffer_accounts` (RLS, no
>   policies), `sa_get_buffer_destination` refused with 42501, `sa_set_buffer_api_key` not exposed
>   at all, `vault.decrypted_secrets` 404 over REST.
> - All four connections: **all 17 tracked fields byte-identical**, both Buffer columns still NULL
>   on every row, `auto_posting` still `paused`, both Instagram tokens still resolving. Nothing is
>   Buffer-routed — the key is stored and nothing uses it.
>
> **One hardening worth doing, not a failure.** `social_buffer_accounts` still carries Supabase's
> default table-level `SELECT` grant to `anon` and `authenticated`. It is fully neutralised by RLS
> with zero policies — proven empirically above — and the column at risk would only ever be
> `key_secret_id`, a pointer, never the key itself. But the migration's own comment says
> "service-role only", and relying on RLS alone means a future permissive policy added for some
> admin screen would open the pointer immediately. Making the intent explicit is one statement:
>
> ```sql
> revoke all on public.social_buffer_accounts from anon, authenticated;
> ```

**3. Apply `20261122000002_jay_tiktok_via_buffer.sql`.**
Two columns on two rows. It raises rather than no-ops if step 2 was skipped, refuses a half-applied
mapping, and refuses two destinations sharing one channel. Rollback beside it.

**4. Apply `20261104000000_tiktok_publish_settings.sql`.**
Not optional for TikTok. `social_posts.tiktok_disclosure` does not exist, and the Buffer worker
requires a saved disclosure before it will send. Without this the route refuses every TikTok post.

**5. Approve content.** See *The approvable inventory* below. This is the step that produces posts;
everything before it only makes publishing possible.

**6. Commit, push, deploy.** The cron entry only takes effect on deploy. Until then the worker has
no caller.

> ### ⚠ Step 1 must happen before step 6. This ordering is not a preference.
>
> Both native workers now ask `isBufferRouted()` about the row before they publish it, and to do
> that they select the two new columns:
>
> ```ts
> // app/api/cron/social-instagram-publish/route.ts
> .select("buffer_account_id, buffer_channel_id")
> ```
>
> **PostgREST fails the whole query when a select names a column that does not exist.** Deployed
> against an un-migrated database, that read errors for every row, and both workers fail closed:
>
> | Worker | Behaviour on the error |
> |---|---|
> | `social-instagram-publish` | returns `kind: "unreadable"` → the post is left untouched and still due |
> | `social-tiktok-publish` | returns `ok: false` → same |
>
> Failing closed is the right behaviour and was chosen deliberately — nothing is published on an
> unknown route, and nothing is marked failed. But the effect of deploying first is that **native
> Instagram publishing stops** until the migration is applied. It stops silently: no post is
> failed, the queue simply stops draining.
>
> Today that would cost nothing — there are zero approved, rendered, unpublished Instagram posts —
> but it is the kind of quiet stall that is hard to spot later. Apply step 1 first and the window
> never exists.


**7. Verify the mapping with nothing armed.**
```
node scripts/verify-buffer-mapping.mjs
```
Read-only. For each Buffer-routed destination it resolves the credential and asks Buffer which
**handle** sits behind the channel id we mapped, then prints the two side by side. This is the only
check that can catch an inverted mapping, and it is the last moment at which catching it is free.

Expect exactly:

```
Jay | TX Apartment Locator   tiktok   6b021ecdece6dfde5f4c40bf   @realestatepro_tx
Jay Morris | Dallas Locator  tiktok   6b02190aece6dfde5f4c0fd6   @locator.beast
```

The left column is the display name as it was at connect time and is **expected to be stale** —
`Jay Morris | Dallas Locator` is the account now called `Jay | Dallas Apt Locator`. The right column
is what Buffer will actually post to. It is the right column that must be correct.

Then call the worker by hand with the `CRON_SECRET`. With `SOCIAL_BUFFER_AUTOPUBLISH_ENABLED` unset
it must report the gate and claim no row — proving the deploy is wired without putting a post at
risk. Once armed, every run also reports `resolvedChannels`, the handle each destination resolved
to, so the mapping stays visible in the worker's own output.

**8. Arm, in this order, pausing after each:**
   1. `SOCIAL_BUFFER_AUTOPUBLISH_ENABLED=true` — the worker starts reading rows.
   2. `SOCIAL_BUFFER_TIKTOK_ENABLED=true` — the TikTok surface is cleared for this route.
   3. Unpause **one** destination — `1b5e4878` (Dallas Locator), which is already paused and
      therefore the safe one to go first.
   4. Lift `social_settings.auto_posting` from `paused`.

   The first post to land is the test. Confirm in the TikTok app that it appeared on the account you
   expected, then unpause the second destination. If the mapping were inverted you find out on one
   post, on an account you were watching, instead of on a schedule.

---

## Applied record — step 3, the channel mapping, 2026-11-23

Approved as "Step 3 only". Re-verified against Buffer immediately before applying, with the key in
Vault — not the key on disk:

| Our destination | Our connection id | Buffer channel | Buffer says | Checks |
|---|---|---|---|---|
| `Jay Morris \| Dallas Locator` | `1b5e4878…` | `6b02190aece6dfde5f4c0fd6` | **@locator.beast** | handle ✓ tiktok ✓ connected ✓ unlocked ✓ Jay's org ✓ |
| `Jay \| TX Apartment Locator` | `ebf475cf…` | `6b021ecdece6dfde5f4c40bf` | **@realestatepro_tx** | handle ✓ tiktok ✓ connected ✓ unlocked ✓ Jay's org ✓ |

The stored `username` on the Dallas row still reads "Jay Morris | Dallas Locator", the name from
connect time, not the current "Jay | Dallas Apt Locator". That is deliberate and documented in the
migration: the route reads ids, so refreshing the name would buy nothing and risk a write to a row
we are trying not to disturb.

**What cannot be machine-verified.** TikTok's `open_id` is app-scoped, so our `external_account_id`
and Buffer's `serviceId` for the same account are different strings by design:

| Account | ours | Buffer's |
|---|---|---|
| Dallas | `-000BKmSSP-Uug1zXBp0VZhVtq296kPs9WLi` | `_000HoI8ScnEL8UmrjfwEXGUUOf-WCDQA16j` |
| TX | `-000z8dZ0pfVnU8ufMBcmrJhzWJgCg5shzp1` | `_000QkQguyf_fu7QkeWNpRx_Is_lE4dL-4H1` |

So "@locator.beast is the Dallas account" rests on the operator's statement, confirmed twice. What
*is* machine-verified is that each mapped channel id resolves at Buffer to the handle named above.

Applied: dry run with `commit` → `rollback` reported `UPDATE 2` and passed all three guards; then
applied with `ON_ERROR_STOP=1` — `UPDATE 2`, `COMMIT`.

### The exact changes

Two rows, three columns. Nothing else.

| id | provider | buffer_account_id | buffer_channel_id | updated_at |
|---|---|---|---|---|
| `5ea0e810` | instagram | NULL | NULL | 2026-10-23 (untouched) |
| `671b758b` | instagram | NULL | NULL | 2026-11-19 (untouched) |
| `1b5e4878` | tiktok | `9d74a2cd…` | `6b02190aece6dfde5f4c0fd6` | 2026-11-23 21:59:58 |
| `ebf475cf` | tiktok | `9d74a2cd…` | `6b021ecdece6dfde5f4c40bf` | 2026-11-23 21:59:58 |

### Verified afterwards

| Check | Result |
|---|---|
| invariant fingerprint over every other tracked field, all four rows | `f5067a0ece557c41dfb1008beb256cba` — **unchanged** |
| `posting_paused` | `1b5e4878` still **true**, `ebf475cf` still **false** |
| `posts_per_day` | NULL on both — the full 07:30 / 19:30 baseline |
| `stagger_offset_minutes` | 0 on both |
| `market_restriction` | NULL on both (unrestricted) |
| Instagram rows | both Buffer columns NULL; tokens resolve at 165 and 160 chars; `updated_at` unchanged |
| `sa_get_buffer_destination` | resolves both destinations, account label "Jay", 43-char key |
| end-to-end (`scripts/verify-buffer-mapping.mjs`) | Dallas → @locator.beast, TX → @realestatepro_tx |
| routed rows | exactly 2, both tiktok, both Jay's; 0 duplicate channel ids |
| Lisette | 0 Buffer accounts, 0 routed destinations |

### Why nothing can publish as a result

Five independent reasons, any one of which is sufficient:

1. `social_settings.auto_posting` is **`paused`** — the owner-wide gate.
2. Both arm switches are **unset**, and each must equal the literal string `"true"`.
3. The Buffer worker is **untracked by git** — it is in no commit, so it is not deployed. Committed
   `vercel.json` has 11 crons and no Buffer entry; the 12th exists only in the working tree.
4. **Zero** TikTok posts are approved — 10 exist, 0 have an `approved_at`.
5. **Zero** posts are addressed to either destination: all 10 TikTok posts have `connection_id = NULL`.

Reason 3 is the strongest: the deployed code does not read the two Buffer columns at all, so in
production this mapping is inert. The deployed native TikTok worker still treats both rows as native
destinations, exactly as before, and its tokens expired 2026-11-20 — unchanged by this step.

Reason 5 also sets up the next step: approving a video is **not** sufficient on its own. A post needs
a `connection_id` before any worker can route it.

Rollback: `ROLLBACK_20261122000002_jay_tiktok_via_buffer.sql` clears both columns on the two rows.

---

## Applied record — the grant hardening, 2026-11-23

Approved separately, after step 2, as a permission change only.

`20261122000000` created `social_buffer_accounts` and its own comments called the table service-role
only. That was true in **effect** and false in **grants**. `CREATE TABLE` inherited Supabase's
default privileges, so `anon` and `authenticated` each held all seven — SELECT, INSERT, UPDATE,
DELETE, TRUNCATE, REFERENCES, TRIGGER — on a row holding a pointer to a Vault secret.

Nothing was exposed by it. RLS was on with zero policies and neither role has `BYPASSRLS`, so every
one of those privileges resolved to zero rows; the measured `anon` SELECT returned `200 []`. The
exposure was **conditional**: the first permissive policy written for a future admin screen would
have made `key_secret_id` readable in the same commit, because the grants were already there. A
policy is a deliberate act; those grants were an accident of defaults.

Applied: `revoke all on public.social_buffer_accounts from anon, authenticated;` in one transaction,
guarded by a `do $$` block that raises and rolls back unless the two browser roles end at zero
privileges **and** `service_role` still holds all seven. Dry-run first with `commit` replaced by
`rollback`, which confirmed the statement succeeds and the rollback restores the grants exactly.

Why the publishing route is unaffected: **no application code selects from this table** — not one
route, component or script; every mention in the tree is a comment or a log line. The only readers
are `sa_get_buffer_destination` and `sa_set_buffer_api_key`, both `SECURITY DEFINER` owned by
`postgres`, which execute with the owner's privileges and never consult the caller's. The worker
holds the service role and reaches the table only through that RPC. `service_role` is also not a
member of `anon` or `authenticated` — membership runs the other way — so the revoke cannot strip it
by descent.

Verified afterwards:

| Check | Result |
|---|---|
| grants on the table | `postgres` 7, `service_role` 7, **`anon` and `authenticated` absent entirely** |
| `has_table_privilege` for anon/authenticated | false on SELECT, INSERT, UPDATE, DELETE, TRUNCATE |
| anon over REST, `SELECT` | `401` / `42501 permission denied for table` — was `200 []` before |
| anon over REST, `INSERT` | `401` / `42501 permission denied for table` |
| anon over REST, `rpc sa_get_buffer_destination` | `401` / `42501 permission denied for function` |
| anon over REST, `vault.decrypted_secrets` | `404` — not exposed in the schema cache |
| `authenticated`, live `SET ROLE` in a transaction | SELECT refused, RPC refused |
| `service_role`, live `SET ROLE` in a transaction | reads the row; RPC runs, returns 0 rows (correct — nothing routed) |
| both definer functions | still `SECURITY DEFINER`, owner `postgres`, `service_role` execute ✓, anon ✗, authenticated ✗ |
| stored credential | decrypts, 43 chars, SHA-256 prefix `40c2c686` — identical to `~/.buffer/api-key` |
| credential still live at Buffer | `locatorbeast@gmail.com`, org `6b01f357d307eb797108b033` only; both TikTok channels resolve, neither disconnected nor locked |
| all four connections, 16 tracked fields | fingerprint `e059133555f67afc6a7153ab85c05d47` — **unchanged** |
| Instagram tokens | still resolve, 165 and 160 chars |
| Buffer-routed destinations | 0 |
| `social_settings.auto_posting` | `paused` |
| Vault secrets | buffer 1, instagram 4, tiktok 2, total 54 — unchanged |
| RLS / policies | still enabled, still zero policies |

Rollback: `ROLLBACK_20261123000002_buffer_accounts_grant_hardening.sql`. It restores the default
grants and says plainly that you probably do not want it — the right fix for a future admin screen
is an owner-scoped RLS policy, not a blanket grant.

Guarded by `scripts/social/bufferPublish.test.ts` §15 (11 assertions, mutation-tested): the revoke
names both browser roles and no others, the in-transaction guard is present and requires
`service_role` to keep all seven, the file touches no schema or data, a rollback exists, and no
application code selects from the table — the premise the whole change rests on.

---

## The schedule needs no work

Both rows carry `posts_per_day = NULL`, which falls through to `BASELINE_DAILY_TIMES` = 07:30 and
19:30, with `stagger_offset_minutes = 0` and `timezone` America/Chicago. **07:30 / 19:30 Central is
already the configured default.** The planner runs hourly; the worker runs every five minutes and
publishes what is due.

---

## The approvable inventory, as of 2026-11-23

Ten `tiktok_video` posts exist. Five have a rendered artifact. **Zero are approved.**

| Post | Video | Market | State |
|---|---|---|---|
| `87346e25` | The Drake White Rock | Dallas | **rendered, approvable, never published** |
| `b2a40fe9` | Live Grandscape | Dallas | rendered, approvable — but see below |
| `0569d083` `29a91c81` `bf0b2377` | Live Grandscape | Dallas | published 2026-10-24 |
| `dca4e3b8` `d047464b` `94601b2e` `67224a57` | four San Antonio tours | San Antonio | **not rendered** |
| `533db65b` | Winston Heights | Houston | **not rendered** |

**Only one genuinely new video is ready for approval: `87346e25`, The Drake White Rock.**

`b2a40fe9` shares its source video (`d022713a`) with the three posts already published on
2026-10-24. Approving it would be the **fourth** publish of the same creative. Nothing in the
pipeline refuses that — duplicate protection is per post row, not per creative — so it is a decision,
not an accident waiting to be caught.

Both approvable posts are **Dallas**. Neither destination carries a market restriction, so either
account would accept them.

---

## Remaining blockers

**1. Nothing is approved.** Approval is a hard gate in every worker. Fully armed, with the mapping
applied and the cron deployed, **nothing would publish**, and the planner's eligible pool would be
empty so nothing would even be scheduled. This is the only blocker that is not a configuration step.

**2. One new video is not a twice-daily schedule.** 07:30 and 19:30 needs two videos a day. There is
one approvable new video and five unrendered posts. The pipeline will run dry on day one.

**3. The render queue has no cron.** `POST /api/admin/social-autopilot/render-jobs/run` is
`requirePlatformAdmin` and needs a browser session; there is no `CRON_SECRET` path and no entry in
`vercel.json`. Renders only happen while someone is on the page. This does **not** block the first
post — `87346e25` is already rendered — but it does block any sustained schedule, and it is why the
five San Antonio and Houston posts are still unrendered.

**4. The dashboard will keep saying "Reconnect Needed".** `connectionStatus()` in
`lib/social/accountCapabilities.ts` reads `status === "error" || expired` and nothing else, so a
Buffer-routed row with an expired native token still reports a problem it no longer has. Cosmetic,
but it will be the first thing that looks wrong after a successful publish. The fix is for that
function to ask `isBufferRouted()` first; it has not been made.

**5. The native TikTok tokens stay expired.** Deliberate — see §6 of the mapping migration. There is
no TikTok token-refresh cron (only Instagram has one), so they stay expired until someone reconnects
by hand. Once the rows are Buffer-routed this is harmless: `social-tiktok-publish` asks
`isBufferRouted()` *before* resolving a token, so the row is skipped as "not ours" rather than failed
as a broken credential. **Reconnecting TikTok is not on the critical path.**

---

## What is deliberately not touched

- **Jay's two Instagram rows** (`5ea0e810` `@realestatepro_tx`, `671b758b` `@locatorbeast`) carry no
  Buffer mapping and keep publishing natively through the Meta Graph API with their own OAuth
  tokens. `scripts/social/instagramWorker.test.ts` asserts that `social-buffer-publish` holds no
  Instagram token of ours and never calls Meta directly.
- **Lisette's destinations** are a separate Buffer account with a separate key and remain
  `posting_paused = true`. Her files name none of Jay's connection ids.
- **Both pause flags, both market restrictions, both cadences, every comment setting** — unchanged by
  every file above.
