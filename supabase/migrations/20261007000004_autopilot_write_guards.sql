-- Autopilot write-path guards: one slot per destination, and no backward slide into 'scheduled'.
--
-- Both guards live in the DATABASE, not in the new write path, and that is the point. An audit of
-- the existing code found FOUR separate writers that can put a post into the scheduled state, two of
-- which (posts/[id]/autoschedule and the posts/[id] PATCH) carry no status predicate at all — they
-- update by id alone. A guard inside the new planner would protect only the new planner. These
-- protect every writer, including the ones already shipped and any added later.
--
-- NOTHING IS ENABLED BY THIS MIGRATION. It adds an index and a trigger. No rule is created, no post
-- is scheduled, no publishing is armed.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. ONE POST PER DESTINATION SLOT
-- ════════════════════════════════════════════════════════════════════════════
-- Keyed on (connection_id, scheduled_at), NOT (owner_user_id, scheduled_at). Different connected
-- accounts belonging to one owner are independent destinations: an Instagram account and a TikTok
-- account — or two Instagram accounts — may legitimately post at the very same minute, and an
-- owner-keyed constraint would forbid that. The thing that must not be double-booked is a single
-- destination's slot.
--
-- PARTIAL, on purpose. Rows with no connection or no schedule are not competing for a slot:
--   * scheduled_at IS NULL  — drafts and unscheduled posts, which is most of the table
--   * connection_id IS NULL — every post created since the 2026-09-13 backfill, because nothing in
--     the codebase writes connection_id yet. The autopilot write path always sets it, so new rows
--     are covered; legacy recurrence rows are deliberately NOT, since constraining them would make
--     the existing generator fail on its very next run.
--
-- So this protects the autopilot path completely and the legacy path not at all. That is a known,
-- accepted limit rather than an oversight: closing it means teaching recurrence to assign a
-- connection, which is a separate change.
--
-- Postgres treats NULLs as distinct in a unique index by default, so even without the WHERE clause
-- the NULL-connection rows would not collide. The clause is kept because it also keeps the index
-- small and states the intent.
--
-- Verified against production before writing this: zero duplicate (connection_id, scheduled_at)
-- pairs exist today, so the index builds without a backfill or a cleanup step.
create unique index if not exists social_posts_connection_slot_uidx
  on public.social_posts (connection_id, scheduled_at)
  where connection_id is not null and scheduled_at is not null;

comment on index public.social_posts_connection_slot_uidx is
  'One scheduled post per (connection, minute). Concurrency protection for the autopilot write path: '
  'two simultaneous claims on the same destination slot cannot both succeed — the loser gets 23505. '
  'Partial: NULL connection_id (legacy recurrence rows) is intentionally unconstrained.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. NO BACKWARD SLIDE OUT OF publishing / published
-- ════════════════════════════════════════════════════════════════════════════
-- The concrete hazard, from the audit: posts/[id]/autoschedule selects "id, status" and then never
-- reads status again — its UPDATE is .eq("id", id) only. A row sitting in 'publishing' with a Meta
-- container already created can therefore be dragged back to 'scheduled' with a fresh scheduled_at,
-- after which the cron worker is free to claim it a second time. Today the only thing standing
-- between that and a duplicate Reel is the media_publish_claimed_at claim inside instagramFinalize —
-- a real backstop, but the LAST one, with nothing in front of it.
--
-- Two transitions are refused:
--   a) publishing|published -> scheduled            (the regression itself)
--   b) scheduled_at changed while publishing|published  (same hazard without touching status —
--      PostEditor.saveDraft sends a bare scheduledAt and leaves status alone)
--
-- Everything the publish pipeline actually does is still allowed: scheduled->publishing,
-- publishing->published, publishing->needs_attention, and the recovery re-write of a published row.
create or replace function public.social_posts_guard_schedule_regression()
returns trigger
language plpgsql
as $function$
begin
  if old.status in ('publishing', 'published') then
    if new.status = 'scheduled' then
      raise exception
        'cannot move a % post back to scheduled (post %)', old.status, old.id
        using errcode = '23514',
              hint = 'A post that is publishing or published must never re-enter the scheduling queue.';
    end if;

    if new.scheduled_at is distinct from old.scheduled_at then
      raise exception
        'cannot change scheduled_at on a % post (post %)', old.status, old.id
        using errcode = '23514',
              hint = 'Its slot is spent. Create a new post rather than re-dating this one.';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_social_posts_guard_schedule_regression on public.social_posts;
create trigger trg_social_posts_guard_schedule_regression
  before update on public.social_posts
  for each row
  execute function public.social_posts_guard_schedule_regression();

commit;
