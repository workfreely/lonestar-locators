# Instagram Comment Automation — deployment plan

**Status: PREPARED, NOTHING APPLIED.** No migration run, no environment variable changed, no
deploy, no reauthorization, nothing sent. Verified 2026-10-17.

---

## 0. Deployment scope — what a deploy from this worktree would actually release

**The branch is 1,071 commits ahead of `main`, but that is already-released work.** `main` has not
moved since 2026-08-01 and is not the release baseline; production is deployed by CLI from this
branch's lineage. Proven three ways:

1. Production serves `/api/cron/social-instagram-publish`, `/api/cron/followup-tick` and
   `/api/admin/social-autopilot/property-research` — routes that exist **only on this branch**
   (401/200, not 404), while the new `/api/cron/social-comment-poll` returns **404**.
2. Worktree `HEAD` is `3de7012`, committed 2026-10-15 16:29:48 CDT. The live production build was
   created 2026-10-15 16:29:54 CDT — **six seconds later**.
3. Production deployments are all CLI-made (`workingfreely-2537`, no git branch metadata),
   matching the established `vercel --prod --yes` process.

**So the release scope is exactly the uncommitted delta**, nothing more:

| | Files |
|---|---|
| New | 11 application/docs files + 6 test suites + 1 migration (unapplied) |
| **Modified existing** | **`vercel.json`** (+4 lines) and **`scripts/social/instagramWorker.test.ts`** (cron allow-list) |

Vercel project: **`locatorbeast`** (`prj_JcnpUhHw6P4xfmtvxLR0MCz6HOVS`), aliased to
`locatorbeast.com`. Lone Star Locators is a **different GitHub repo** (`workfreely/lonestar-locators`)
and is not this project.

---

## 1. The `vercel.json` diff — APPLIED LOCALLY, APPROVED

```diff
   {
     "path": "/api/cron/social-instagram-publish",
     "schedule": "*/5 * * * *"
   },
+  {
+    "path": "/api/cron/social-comment-poll",
+    "schedule": "*/5 * * * *"
+  },
   {
     "path": "/api/cron/social-autopilot-plan",
     "schedule": "0 * * * *"
   }
```

Validated: still valid JSON, 9 crons total (was 8), no duplicate paths, schedule exactly
`*/5 * * * *`.

Five minutes is proven feasible on this plan by observation, not by reading docs:
`social-instagram-publish` already runs `*/5`, `insights-refresh` runs `*/2`, and `followup-tick`
runs `* * * * *` in production today. A Hobby plan permits 2 daily-only crons, so this project is
Pro or above, where the limit is 40. Going from 8 to 9 needs no plan change.

**One existing test caught this change, correctly.** `instagramWorker.test.ts` holds an allow-list
of permitted social crons — it was deliberately tightened from a bare count once before — and it
failed when the poll cron appeared. The allow-list was extended to three with the reasoning
recorded inline. Its companion assertion, *"this worker is the ONLY cron that can publish to
Instagram"*, was left untouched and still passes: the poll route imports none of the publish
helpers. A control confirmed the allow-list still rejects an unreviewed social cron.

**This entry is safe to add before anything else is approved.** With
`SOCIAL_COMMENT_AUTOMATION_ENABLED` unset the route authenticates, returns
`{ ok: true, inert: true }`, and makes no database read and no Meta call. It costs one trivial
invocation every five minutes and does nothing.

---

## 2. Environment variables

Names and behaviour only. **No secret values appear in this document or anywhere in the repo.**

| Variable | New? | Set to | Behaviour |
|---|---|---|---|
| `SOCIAL_COMMENT_AUTOMATION_ENABLED` | new | *leave unset* | The deploy-level kill switch. Only the literal `true` (whitespace trimmed, case-sensitive) arms the feature. Unset ⇒ both routes are verified no-ops. |
| `SOCIAL_COMMENT_SEND_ENABLED` | new | *leave unset* | The sending gate. Only `true` arms it. Unset ⇒ the pipeline evaluates every decision and writes its full ledger, but **no request leaves the process**. |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | new | a long random string | Echoed back during Meta's subscription handshake, compared timing-safely. Unset ⇒ the handshake returns 403, so the subscription cannot be created. |
| `INSTAGRAM_APP_SECRET` | **already in Vercel** | unchanged | The HMAC key for `X-Hub-Signature-256`. Already used by the OAuth flow. Unset ⇒ every webhook POST is refused `not_configured`. |
| `CRON_SECRET` | **already in Vercel** | unchanged | Bearer token for the poll route. Unset ⇒ the route returns 401 (fails closed). |

Neither `INSTAGRAM_APP_SECRET` nor `CRON_SECRET` is present in `.env.local`, so these routes
cannot be exercised against Meta from a local worktree. That is expected.

**Vercel environment changes require a redeploy to take effect.** The deploy-level switch is
therefore not an instant kill. See §5.

---

## 3. The `comment_media_cursors` migration — defer it

**Recommendation: do not apply it until after the first controlled test.**

It is purely an optimisation. Without it the poll fetches every in-window media (at most ~7 calls
per run); with it, one call per run in the steady state. `readCursors()` returns `[]` on *any*
error including `relation does not exist`, and `planPoll` treats an unknown cursor as "fetch", so
the poller is **correct** today and merely becomes frugal later. Deferring removes a schema change
from the riskiest deploy and loses nothing but call volume we are not currently near.

Reviewed for:

- **Idempotency** — `create table if not exists`, `enable row level security` (re-runnable), and
  `drop policy if exists` before `create policy`. A bare `create policy` errors on replay, which
  would abort the file halfway; the guard makes the whole migration safely re-runnable. This was a
  real defect found during review and fixed.
- **Security** — RLS enabled, owner-scoped `SELECT` only via an `exists` check against
  `social_connections.owner_user_id = auth.uid()`. **Deliberately no INSERT/UPDATE/DELETE policy**,
  so a browser session cannot write a cursor even as the owner — a forged cursor would make the
  poller skip a media and silently miss comments. Writes are service-role only. Same posture as
  the existing comment tables.
- **Rollback** — one statement, nothing to lose:
  ```sql
  drop table if exists public.comment_media_cursors;
  ```
  The table holds only a cache of provider comment counts. It is derived data that the next poll
  rebuilds, so dropping it cannot lose a comment, a commenter, an action, or a message. Its single
  foreign key points *outward* at `social_connections`; nothing references it, so the drop cannot
  cascade into anything that matters.
- **Rehearsal before applying** — `begin; \i supabase/migrations/20261017000000_comment_media_cursors.sql; rollback;`
  then the same again in one transaction to confirm the replay. Not run yet: this worktree has no
  `supabase/.temp/pooler-url`, and executing migrations is out of scope for now.

---

## 4. The shortest safe path

### Step A — inert production deployment (no approvals beyond the deploy itself)

1. Add the `vercel.json` entry from §1.
2. Deploy. Set **no** new environment variables.
3. Verify inertness:
   - `POST /api/webhooks/instagram` with no signature → **403**
   - `POST /api/webhooks/instagram` with a wrong signature → **403**
   - `GET /api/cron/social-comment-poll` with no bearer → **401**
   - `GET /api/cron/social-comment-poll` with the correct bearer → **200 `{inert: true, calls: 0}`**
   - `select count(*) from social_comments;` → still **0**

At this point the feature is deployed and provably doing nothing.

### Step B — controlled comment test

4. **Reauthorize Instagram** through the existing flow — no disconnect. Confirm the connection row
   keeps id `5ea0e810-f608-404d-8277-98169af785c9` and its `scopes` gains
   `instagram_business_manage_comments`.
5. Re-run `node probe_ig_comment_identity.mjs` (read-only, GETs only). This settles whether the
   comments *edge* returns `from`, which decides whether polled comments can ever be DM-eligible.
6. Set `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`, redeploy, and subscribe the `comments` field in the Meta
   app dashboard pointing at `https://<domain>/api/webhooks/instagram`.
7. **Dry run.** Set `SOCIAL_COMMENT_AUTOMATION_ENABLED=true`, leave `SOCIAL_COMMENT_SEND_ENABLED`
   unset, redeploy. Then:
   ```sql
   insert into comment_automation_settings (owner_user_id, global_enabled)
     values ('c567c077-d3f4-4532-8807-a54795f753f5', true);
   insert into comment_account_settings (connection_id, enabled, activated_at)
     values ('5ea0e810-f608-404d-8277-98169af785c9', true, now());
   ```
   Comment `LIST` on one of your own Reels **from a second account you control**. Expect: one
   `social_comments` row, one `social_commenters` row carrying the real IGSID, and **two
   `comment_actions` rows both reading `skipped / sending_disabled`** — and no DM.
8. **One real send.** Only if step 7 looks right: set `SOCIAL_COMMENT_SEND_ENABLED=true`, redeploy,
   comment once more from the test account. Verify the DM arrives, `dm_sent_at` is stamped, and the
   action reads `sent`.
9. **The test that matters.** Comment a *third* time from the same account. Expect
   `already_messaged` and **no second DM**.
10. Unset `SOCIAL_COMMENT_SEND_ENABLED` and redeploy until you are ready for real traffic. Leave
    `public_replies_enabled` false throughout — public replies are a separate decision.

---

## 5. Rollback

| Situation | Action | Latency |
|---|---|---|
| **Stop everything now** | `update comment_automation_settings set global_enabled = false;` | **Immediate** — `readGate` reads it on every invocation, no deploy needed. |
| Stop one account | `update comment_account_settings set enabled = false where connection_id = '…';` | Immediate |
| Stop sending, keep observing | Unset `SOCIAL_COMMENT_SEND_ENABLED`, redeploy | One deploy |
| Disable the whole feature | Unset `SOCIAL_COMMENT_AUTOMATION_ENABLED`, redeploy | One deploy |
| Stop the poll | Remove the `vercel.json` entry, redeploy | One deploy |
| Stop webhook deliveries | Unsubscribe the `comments` field in the Meta dashboard | Immediate, outside our stack |
| Revert the code entirely | Delete the 14 new files; **no existing file needs reverting** | One deploy |
| Undo the migration (if applied) | `drop table if exists public.comment_media_cursors;` | Immediate, loses only cache |

**The database switch is the real kill switch**, because it needs no deploy. Right now the feature
is off by four independent mechanisms: the env gate is unset, `comment_automation_settings` has no
row (defaults false), `comment_account_settings` has no row (defaults false), and the connection
lacks the comments scope.

Nothing in the rollback path touches `social_posts`, `social_content`,
`social_property_research`, rendering, publishing, scheduling, captions, overlays, or media.

---

## 6. Known gaps, stated plainly

- **`social_comments.post_id` is never populated.** The column exists and the store writes
  `external_media_id` instead. The Inbox can therefore show which media a comment is on but cannot
  yet join to the Social Beast post. Not a safety issue; worth closing before the Inbox UI ships.
- **`scripts/social/gapResearch.ts`** is also uncommitted in this worktree. It is the provenance
  record for the 10 property-research writes, not application code, and is not part of the Next
  build output. It would be uploaded with the deploy and do nothing.
- **Meta's `X-Hub-Signature-256` carries no timestamp and no nonce**, so a captured valid body
  stays valid for ever and there is no cryptographic replay protection available. Idempotency is
  the entire defence: it is complete for *effects* (nothing happens twice) but the endpoint will
  accept, parse, and then dedupe a replayed delivery rather than rejecting it outright.
- **Polled comments will usually not be DM-eligible**, because Meta does not document `from` on the
  comments edge. Step 5 above settles it empirically.
