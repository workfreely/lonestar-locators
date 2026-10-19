# Instagram publishing — what still stands between a draft and a published Reel

Recorded 2026-10-18. **Documentation only.** Nothing here was fixed in the release that added this
file; each item is written so it can be picked up cold.

The approval gate was a sixth item on this list and is now fixed (the PATCH handler's stored-row
select was missing `render_status` and `rendered_storage_path`, so approval was impossible for every
post). The rest are untouched.

## The intended path, and where it breaks

```
draft ──render──> status='ready' ──approve──> approved_at set
      ──schedule──> status='scheduled' + scheduled_at + connection_id
      ──cron worker──> Instagram
```

Four of those five arrows have a problem.

---

## 1. `autoschedule` never sets `connection_id` — a scheduled post faults

**Severity: blocks publishing. The most consequential item here.**

`POST /api/admin/social-autopilot/posts/[id]/autoschedule` sets `scheduled_at` and
`status='scheduled'`, and nothing else:

```ts
.update({ scheduled_at: scheduledAt, status: "scheduled", updated_at: … })
```

The publish worker then resolves the destination from `connection_id`:

```ts
async function resolveDestination(connectionId: string | null) {
  if (!connectionId) return { ok: false, kind: "fault",
    reason: "no publishing destination selected for this post" }
```

So a post scheduled from the Post Editor is **faulted by the worker rather than published**. The
`PATCH /posts/[id]` route's whitelist does not include `connection_id` either, so the editor has no
way to set it.

Only `lib/social/autopilotWrite.ts` sets it, and it sets all three together:

```ts
.update({ scheduled_at: req.scheduledAtUtc, connection_id: req.connectionId,
          status: "scheduled", updated_at: … })
```

That is the **autopilot planner** path, not the editor path.

**Why it has not been noticed:** nothing has been scheduled since the gate above made approval
impossible, and `autoschedule` refuses an unapproved post. The two bugs masked each other.

**Options, in increasing size:**

1. Have `autoschedule` resolve the owner's single connected Instagram destination and set
   `connection_id` alongside the other two fields — mirroring `autopilotWrite`. Smallest fix.
2. Add `connection_id` to the editor as an explicit destination picker. Larger, and the right answer
   once there is more than one destination.

Either way the invariant worth encoding is: **`status='scheduled'` must never be written without
`connection_id`**. A CHECK constraint or a trigger would make the worker's fault branch
unreachable rather than merely unlikely.

---

## 2. There is no manual Instagram publish button

**Severity: blocks a launch that does not want automation.**

`POST /posts/[id]/publish` and `/publish/status` exist, are complete, and implement the two-phase
container flow correctly. **Zero UI calls them** — grep across `app/` and `components/` for the
endpoint returns nothing outside `app/api/`.

The editor's **Publish** button does not publish. Its own comment says so:

```
// Publish — the ONE primary action. This does NOT publish to Instagram. "Publish" means: hand
// this post to Social Beast for automatic placement.
```

It calls `autoschedule` (item 1). TikTok, by contrast, *does* have a manual path
(`components/crm/social/TikTokPostConfirm.tsx` → `/api/integrations/tiktok/publish`).

So today the only route to Instagram is the cron worker, which needs item 3.

**Note:** the manual route requires `status='ready'` **and** `connection_id`, and nothing sets
`connection_id` on a `ready` post — so wiring the button up also needs item 1 resolved.

---

## 3. The worker's env flag is absent in production

`SOCIAL_INSTAGRAM_AUTOPUBLISH_ENABLED` is **not set** in production, and the worker fails closed on
anything but the exact string `"true"`:

```ts
function autopublishEnabled(): boolean {
  return (process.env.SOCIAL_INSTAGRAM_AUTOPUBLISH_ENABLED ?? "").trim() === "true"
}
```

Also absent: `SOCIAL_AUTOPILOT_TRIGGER_ENABLED` and `SOCIAL_AUTOPILOT_WRITE_ENABLED`, which gate the
planner that *does* set `connection_id`. And `social_settings.auto_posting` is `'paused'`.

This is deliberate and should stay that way until items 1 and 2 are settled. Listed so the full
chain is visible in one place.

---

## 4. The 8 published posts went out under different rules

All eight have `connection_id` set and `approved_at` **NULL** — they predate the approval gate. So
the historical publishing path is **not** the path that exists today, and "it worked in October" is
not evidence that the current path works. Do not use those rows as a template.

---

## 5. Secondary items

- **TikTok's token expired 2026-10-14.** `social_connections.token_expires_at` is in the past;
  `resolveDestination` faults an expired destination. TikTok publishing is unavailable until it is
  re-authorised.
- **`social_comments.post_id` is never populated**, so the Comments inbox Post column is always
  empty. Cosmetic until comment automation goes live.
- **The comment poll's media-age filter** excludes everything with its 7-day window, and the
  comments edge returns 0 regardless — so polling cannot be the fallback for webhooks today.
- **`comment_media_cursors` migration is unapplied** and its file is untracked.
- **66 display names carry UTC-derived dates.** Fixed for new uploads; no backfill.
- **Vault secret deletion is swallowed** in `sa_connect_instagram`, `meta_connect` and
  `sa_connect_tiktok` — superseded secrets are never deleted. Same ambiguous-`id` family as the
  bug fixed in `20261024000000`, but on a `delete` whose failure is caught.

## Suggested order

1. Item 1 (`connection_id`) — nothing else matters while a scheduled post cannot resolve a
   destination.
2. Item 2 (manual publish) — gives a launch path that needs no automation at all.
3. Item 3 (env flags) — only once 1 and 2 are proven on a single post.

A single-post rehearsal after items 1 and 2, with the worker still off, is the cheapest way to
prove the chain before enabling anything.
