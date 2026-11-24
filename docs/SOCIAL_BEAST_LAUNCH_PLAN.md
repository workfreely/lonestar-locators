# Social Beast — the launch plan

Written 2026-11-23. Verified against the live database and the live Buffer accounts, not inferred.

**Goal.** Six channels publishing approved videos automatically at 07:30 and 19:30 Central, with
Lisette's one personal video going out first on both of her accounts.

**Scope discipline.** This plan adds nothing that is not required by that goal. Where a requirement
is already built, it says so and reuses it. Where a gate is self-imposed and protects nothing, it
removes it rather than feeding it.

> **STATUS 2026-11-23: the release is BUILT and APPLIED to the database. Nothing is deployed and
> nothing is armed.** All six destinations now exist and are routed. Both arm switches are unset,
> `social_settings.auto_posting` is `paused`, four of six destinations are paused, and no code has
> shipped — the Buffer worker and the render cron are still untracked by git. Section 9 is the
> deployment checklist.

---

## 1. Where the six channels actually stand

| # | Channel | Intended provider | State |
|---|---|---|---|
| 1 | Jay Main — Instagram `@realestatepro_tx` | direct Instagram API | **connected**, token valid to 2026-12-22, destination live |
| 2 | Jay Main — TikTok `@realestatepro_tx` | Buffer | **mapped** to channel `6b021ecd…`, verified at Buffer |
| 3 | Jay Dallas — Instagram `@locatorbeast` | direct Instagram API | **connected**, token valid to 2027-01-18, destination **paused** |
| 4 | Jay Dallas — TikTok `@locator.beast` | Buffer | **mapped** to channel `6b02190a…`, verified at Buffer |
| 5 | Lisette — Instagram `@locatorlisette` | her Buffer | **created** `7a2e3e3d`, routed to channel `6b03aa80…`, verified |
| 6 | Lisette — TikTok `@locatorlisette` | her Buffer | **created** `b25ef95a`, routed to channel `6b03aa49…`, verified |

**All six now exist and are routed.** Rows 5 and 6 were created by the release; before it the
database held exactly four `social_connections` rows, all owned by Jay.

### What is already verified about Lisette's side

Her Buffer account was read with her own key (never stored, never printed):

```
account        locatorlisette@gmail.com
organization   6b02f92207e3daab800671f4   (Jay's org NOT reachable from her key — correctly separate)

instagram  6b03aa808541f09ecb6efbec  @locatorlisette  type=business  connected, unlocked
  scopes include instagram_business_content_publish  -> Buffer can publish directly, not by reminder
tiktok     6b03aa498541f09ecb6efaa8  @locatorlisette  type=account   connected, unlocked
  scopes include video.publish
```

Both channel ids in the prepared migration are **correct**. Her Instagram can auto-publish, which
was the one thing that could have made requirement 5 impossible.

---

## 2. What is already built and needs no new work

Reuse, not rebuild. All of this exists and is under test.

| Requirement | Already satisfied by |
|---|---|
| Two posts/day at 07:30 & 19:30 Central | `BASELINE_DAILY_TIMES = [450, 1170]`, `DEFAULT_TIMEZONE = America/Chicago` |
| Approved content assigned to the right destination | `autopilotWrite.ts` claims a post and sets `connection_id` + `scheduled_at` |
| Duplicate publishing prevented | partial unique index on `(connection_id, scheduled_at)`, plus the `external_post_id`-null claim |
| Success/failure tracked per platform | one `social_posts` row per platform, each with its own `status`, `error_message`, `external_post_id` |
| Only approved, rendered videos publish | the worker's due query requires `approved_at not null` and `rendered_storage_path not null` |
| San Antonio / Austin only, for Lisette | `market_restriction text[]`, enforced in `marketRestriction.ts` (187 assertions) |
| Instagram + TikTok same creatives daily | `mirroredSchedule.ts` (83 assertions) + `mirrors_connection_id` |
| Balanced San Antonio / Austin rotation | `marketBalance.ts` + `balance_markets` |
| Platform-specific safe areas | `platformSafeArea.test.ts` (55 assertions), already live |
| Personal videos, per-agent | `personalOwnership.ts` (110 assertions) + `personal_agent_user_id` |
| Lisette's debut video first on both accounts | `debutGate.ts` + `debut_for_agent_user_id` |
| Partial debut failure holds everything | `debutRefusalFor` is a **hold**, not a failure: the row stays scheduled and retries, and regular content stays held |
| Buffer publishing itself | `buffer.ts`, `bufferRoute.ts`, `bufferServer.ts`, `bufferGate.ts`, the worker — 233 assertions |
| Free Buffer plan's 10-post queue cap | avoided: the client uses `mode: "shareNow"`, measured not to consume queue depth |

Buffer's own posting schedules on Lisette's channels (random times like 18:20/20:22) are
**irrelevant** — `shareNow` publishes on our call, so timing comes from our scheduler alone.

---

## 3. Things that are NOT blockers, verified

- **Expired direct TikTok OAuth tokens.** The Buffer path never reads one. `sa_get_buffer_destination`
  returns `api_key, buffer_channel_id, buffer_account_id, buffer_account_label, provider, username,
  posting_paused, market_restriction, owner_user_id, agent_user_id` — no token, no expiry. None of
  `buffer.ts`, `bufferRoute.ts`, `bufferServer.ts` or the worker mentions a TikTok token. Jay's two
  native tokens expired 2026-11-20 and cannot block Buffer-routed publishing.
- **Buffer free-plan limits.** `shareNow` was measured not to consume scheduled-queue depth.
- **Instagram being dragged into Buffer.** Jay's Buffer account has **no Instagram channel at all**,
  so his Instagram cannot be routed through Buffer even by mistake. His two Instagram rows carry
  `buffer_account_id = NULL`.

---

## 4. The disclosure question, settled

Asked because the worker currently refuses every TikTok post over it.

**What Buffer requires: nothing.** `TikTokPostMetadataInput` has exactly two fields, `title` and
`isAiGenerated`, and `isAiGenerated` is optional — our client sets it only when defined. A TikTok
post publishes through Buffer with no disclosure field at all. There is no privacy level and no
comment/duet/stitch control; Buffer applies the channel's TikTok defaults.

**What TikTok requires for compliant publishing:**
- AI-generated realistic content must be labeled. **This content is not AI-generated** — the voice
  library is 58 recordings of Jay's own voice, presenter clips are uploaded footage of a real
  person, and overlays are text. So the absence of an AI label is correct, not an omission.
- Commercial content must be disclosed. This content *is* commercial. Buffer **cannot transmit**
  that flag, so the compliant route is disclosure in the caption — which the existing caption
  pipeline already composes.

**What our worker imposes unnecessarily:** a hard refusal of every `tiktok_video` post unless
`social_posts.tiktok_disclosure` is set — a column that does not exist in production, so the
refusal is total. The worker's own comment already concedes this logic for privacy and interactions
("requiring the other two HERE would refuse posts without protecting anything, which is the worst
kind of gate"). The same argument applies to the third.

It is also **mis-mapped**: `isAiGenerated = disclosure !== "none"` derives an AI-content label from a
*commercial* disclosure. Declaring "your_brand" on a human-shot walkthrough would label it
AI-generated to TikTok; declaring "none" on a genuinely AI video would fail to label it. Wrong in
both directions.

**Minimum fix:** remove the refusal, stop deriving `isAiGenerated` from the commercial disclosure,
and **do not apply** `20261104000000_tiktok_publish_settings.sql`. No new columns, no new UI. If an
AI label is ever wanted, one boolean on `social_settings` — a table that already exists — is enough.

---

## 5. The remaining blockers, ranked

1. **Lisette has no connections, and her Buffer key is not stored.** Blocks channels 5 and 6 entirely.
2. **Nothing is deployed.** The Buffer worker is untracked by git; committed `vercel.json` has 11
   crons and no Buffer entry. Production cannot run it.
3. **Four additive migrations unapplied** — Lisette's destinations, mirrored + balance, personal
   ownership, sibling link.
4. **Zero approved content.** 10 TikTok drafts, none approved. Only `87346e25` ("The Drake White
   Rock", Dallas) is rendered, unpublished and genuinely new. Instagram has 0
   approved-and-rendered-and-unpublished.
5. **The self-imposed disclosure gate** refuses 100% of TikTok posts (section 4).
6. **Rendering has no cron.** `render-jobs/run` is `requirePlatformAdmin` with no `CRON_SECRET`
   path, so newly approved videos will not render unattended.
7. **The dashboard will read "Reconnect needed"** for both TikTok accounts. `accountCapabilities.ts`
   contains zero mentions of Buffer and keys the badge off native token expiry, which is expired.
   Cosmetic, but it will look like a failure.
8. **The intended final gates**, to be opened last and deliberately: `auto_posting = paused`, both
   arm switches unset, and two destinations paused.

---

## 6. The release — one grouped change

Everything below is additive or a deletion of a gate that protects nothing. No existing integration,
credential, schedule or pause flag is modified.

### 6a. Credential (one command, no schema)

Store Lisette's Buffer key under its own label, using the script and function already proven twice:

```
node scripts/store-buffer-key.mjs --label Lisette --file ~/.buffer/lisette-api-key \
  --org 6b02f92207e3daab800671f4
```

Her key stays in her own Vault secret, her own `social_buffer_accounts` row, separate from Jay's.
Jay's row (`9d74a2cd`, label `Jay`) is not touched. The label is unique per owner by index.

### 6b. Migrations — one transaction each, dry-run first, same pattern as the three already applied

| File | What it adds | Why it is needed |
|---|---|---|
| `20261122000001_lisette_buffer_destinations.sql` | 2 rows: her Instagram + TikTok, Buffer-routed, `market_restriction = {San Antonio, Austin}`, `posts_per_day = 2`, `posting_paused = true` | channels 5 and 6 |
| `20261122000003_mirrored_destinations.sql` | `mirrors_connection_id`, `balance_markets` | her Instagram and TikTok publish the same two creatives; SA/Austin rotation |
| `20261123000000_personal_video_ownership.sql` | `personal_agent_user_id`, `debut_for_agent_user_id` | "Lisette — Personal"; debut-first |
| `20261123000001_tiktok_sibling_of_post.sql` | `sibling_of_post_id` + unique index | pairs the TikTok row to its Instagram row so each platform's success/failure is tracked separately without double-publishing |

**Not applied:** `20261104000000_tiktok_publish_settings.sql` — section 4.

Each file keeps its own rollback. Verification after each: the invariant fingerprint over every
tracked field on the pre-existing four connections must not change.

### 6c. Code changes — three, all small

1. **Remove the disclosure refusal** in `app/api/cron/social-buffer-publish/route.ts` and stop
   deriving `isAiGenerated` from a commercial disclosure. Net: fewer lines than it has now.
2. **Teach `accountCapabilities.ts` about Buffer** — a Buffer-routed destination is connected
   regardless of native token expiry. ~10 lines, so the dashboard stops saying "Reconnect needed"
   about accounts that publish fine.
3. **Give rendering a cron** — add a `CRON_SECRET` path to the existing `render-jobs/run` route and
   one `vercel.json` entry. Without it nothing renders unattended and the queue never fills.

Then commit the seven already-written modules, the Buffer worker, the Buffer cron entry and the UI
changes as **one release**.

### 6d. Safeguards that stay in place through the release

- Both arm switches stay unset until the deploy is verified, so the deployed worker refuses every
  row before reading it.
- Both of Lisette's destinations are created **paused**.
- `auto_posting` stays `paused` owner-wide.
- The debut hold means that even fully armed, nothing of Lisette's regular content publishes until
  her one personal video has published on **both** of her accounts.

### 6e. Testing before deploy

- `tsc --noEmit` clean.
- Full suite, judged by **diffing the failing-suite set** against the 28-suite baseline, not by
  comparing counts. The only acceptable new entry is `newLeadContactAction` (clock-dependent, passes
  before 09:00 Central).
- The guard suites that will need honest updates because this release genuinely changes their
  subject: `autopilotTrigger` (cron count), `instagramWorker` and `personalOwnership` (allow-lists),
  and `bufferPublish` (the disclosure gate it currently asserts). Each updated with the reason
  stated, not to make a failure disappear.
- `scripts/verify-buffer-mapping.mjs` across all four Buffer-routed destinations once Lisette's two
  exist: each must resolve to the intended handle.

---

## 7. Launch order, after the release is deployed

Operational steps, no code:

1. Mark Lisette's one personal video: **Lisette — Personal**, and set it as her debut.
2. Approve the content to seed the queues. `87346e25` is the one genuinely new TikTok video.
3. Confirm rendering drains the queue (the new cron).
4. Set `SOCIAL_BUFFER_AUTOPUBLISH_ENABLED=true`, then `SOCIAL_BUFFER_TIKTOK_ENABLED=true`.
5. Unpause, in this order: Lisette's two destinations, then Jay Dallas Instagram, then Jay Dallas
   TikTok.
6. Lift `auto_posting` from `paused` **last**. This is the single switch that starts publishing.
7. Watch the first cycle: her debut should publish on both of her accounts before anything else of
   hers, and nothing should publish twice.

Rollback at any point: set `auto_posting` back to `paused`. It is one row and it stops everything.

---

## 8. The deployment checklist

Everything above the line is **done**. Everything below it needs your go-ahead.

### Already applied to the database (no deploy involved)

| # | Change | Evidence |
|---|---|---|
| 1 | Lisette's Buffer key stored | `social_buffer_accounts` `bbdb689d`, label `Lisette`, org `6b02f922…`; SHA-256 `5fd69519` matches her file; her key reaches her org only, Jay's `40c2c686` unchanged and reaches his only |
| 2 | Her two destinations created | `7a2e3e3d` Instagram, `b25ef95a` TikTok — both routed, `{San Antonio, Austin}`, 2/day, **paused** |
| 3 | Mirroring + balanced rotation | her TikTok mirrors her Instagram; `balance_markets` true on her two and on **no** other destination |
| 4 | Personal ownership columns | `personal_agent_user_id`, `debut_for_agent_user_id`, NULL on every pre-existing row |
| 5 | Sibling link | `sibling_of_post_id` + unique index, so one approval cannot become two TikTok posts |
| 6 | Pre-existing four untouched | fingerprint over every tracked field still `f5067a0ece557c41dfb1008beb256cba`, asserted **inside** the transaction |

All four migrations went in as **one transaction**, after a dry run with `commit` replaced by
`rollback` passed every guard. Each file now records that it is applied, and each keeps its rollback.

### Written, tested, not deployed

| Change | What it does |
|---|---|
| `lib/social/buffer*.ts` + `app/api/cron/social-buffer-publish` | Buffer publishing for both providers |
| the disclosure gate, **removed** | the worker no longer refuses every TikTok post for a column that does not exist |
| `app/api/cron/social-render` (new) | drains the render queue on a schedule, so approvals render unattended |
| `vercel.json` | 13 crons: `social-render` added, placed before the publishers |
| `accountCapabilities.ts` + the two cards | a Buffer-routed destination is not "Reconnect Needed" because a token it never uses expired |
| the seven ownership / mirroring / debut modules | personal assignment, debut-first, mirrored creatives, market balance |

`tsc` clean. 19,293 assertions pass. Failing-suite set is the 28-suite baseline **plus only**
`newLeadContactAction` (clock-dependent: passes before 09:00 Central). No baseline failure vanished.

### The deploy, in order

1. **Commit and push** the release. Nothing publishes on deploy: both arm switches are unset, so the
   Buffer worker returns before reading a row, and `auto_posting` is `paused`.
2. **Set `CRON_SECRET`** if it is not already set in production — the new render cron is gated by it
   and returns 401 without it.
3. **Deploy.** Then confirm, before arming anything: the Accounts page shows all six destinations,
   and neither TikTok card says "Reconnect Needed".
4. **Mark Lisette's debut video**: Personal → Lisette Hernandez, and set it as her debut. The picker
   appears only once this release is deployed.
5. **Approve content.** TikTok has 10 drafts and **0 approvals**; `87346e25` ("The Drake White Rock",
   Dallas) is the one rendered, unpublished, genuinely new video.
6. **Confirm rendering drains** — the new cron should clear the queue a job per run.
7. **Arm**: `SOCIAL_BUFFER_AUTOPUBLISH_ENABLED=true`, then `SOCIAL_BUFFER_TIKTOK_ENABLED=true`.
8. **Unpause** in this order: Lisette's two, then Jay Dallas Instagram, then Jay Dallas TikTok.
9. **Lift `auto_posting` from `paused` LAST.** This is the switch that starts publishing.

**Rollback at any point:** set `auto_posting` back to `paused`. One row, stops everything.

### What this release deliberately does not do

- It does not apply `20261104000000_tiktok_publish_settings.sql` (section 4).
- It does not touch Jay's Instagram integrations, tokens, schedules or pause flags.
- It does not touch Lisette's Buffer credential beyond storing it under her own label.
- It does not revoke the default grants on the other 38 tables in the same shape as
  `social_buffer_accounts` — several of which hold credentials. Inert today, worth its own review.
- It does not fix `scripts/social/tiktokPublishSettings.test.ts`, whose one failing assertion
  ("no cron entry was added") has asserted something untrue since the native TikTok cron shipped.
  Pre-existing, in the baseline, and out of this release's scope.
