-- THE AGENT REVIEW FLAG MUST NOT FIRE ON A POST'S FIRST RENDER.
--
-- social_posts_agent_review_on_change (20261011000001_agent_publishing_hold.sql) stamps
-- needs_review_at whenever an agent-owned row that is approved OR scheduled has its caption,
-- hashtags or rendered artifact change, and nulls approved_at with it. For an agent that flag is
-- an UNCONDITIONAL publish hold -- publishHoldDecision refuses the post with no environment
-- variable to forget -- which is right, because an agent's approval is a statement about specific
-- content.
--
-- ── WHAT WENT WRONG ─────────────────────────────────────────────────────────────────────────
-- The first week was placed as 84 posts at status='scheduled' with approved_at NULL, and then
-- rendered. Lisette's fourteen are agent-owned and scheduled, so the trigger fired on each render
-- -- render_version 0 -> 1, rendered_storage_path NULL -> a path -- and wrote
--
--     "The video was re-rendered after you approved it. Review it again before it posts."
--
-- Nothing had been approved and nothing had been re-rendered: that was the first artifact the row
-- ever had. The message was false, the hold was permanent, and because the trigger also nulls
-- approved_at, every future render of her week would wipe an approval just given. Her debut gates
-- every other post on her account, so this alone took the account offline.
--
-- ── THE CHANGE, AND HOW NARROW IT IS ────────────────────────────────────────────────────────
-- A render can only invalidate a decision if there was an EARLIER artifact to decide about. So the
-- render branch yields null when the row had none: old.rendered_storage_path IS NULL and
-- old.render_version is 0 or NULL. Everything else is untouched --
--
--   * a genuine re-render (an artifact existed and changed) still stamps the flag and still
--     clears approved_at;
--   * a caption or hashtag change still stamps it, including on a row with no render at all,
--     because those branches are evaluated first and never look at the render;
--   * admin rows, published rows, and rows that are neither approved nor scheduled still return
--     early exactly as before.
--
-- The UPDATE at the end clears only the flags this bug wrote: the reason text it writes, no
-- approval, no publish, exactly one render, still scheduled. A flag on any other row may be a real
-- one and is left alone. The guard block at the bottom fails the transaction unless both halves
-- took effect.
begin;

create or replace function public.social_posts_agent_review_on_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_is_agent boolean;
  v_reason   text;
  v_had_render boolean;
begin
  if new.published_at is not null or new.external_post_id is not null then
    return new;  -- history is never rewritten
  end if;
  if new.approved_at is null and new.status is distinct from 'scheduled' then
    return new;  -- nothing approved or scheduled to invalidate
  end if;

  select (c.agent_user_id is not null and c.agent_user_id <> c.owner_user_id)
    into v_is_agent
    from public.social_connections c where c.id = new.connection_id;
  if v_is_agent is not true then
    return new;  -- admin rows keep the admin's behaviour, unchanged
  end if;

  -- DID THIS ROW HAVE AN ARTIFACT BEFORE THIS UPDATE? A render can only invalidate a decision
  -- about a video that already existed. The first one creates the video the decision is about.
  v_had_render := old.rendered_storage_path is not null or coalesce(old.render_version, 0) > 0;

  v_reason := case
    when new.caption  is distinct from old.caption  then 'The caption changed after you approved this video.'
    when new.hashtags is distinct from old.hashtags then 'The hashtags changed after you approved this video.'
    when new.rendered_storage_path is distinct from old.rendered_storage_path
      or new.render_version is distinct from old.render_version
      then case when v_had_render then 'The video was re-rendered after you approved it.' else null end
    else null end;

  if v_reason is null then return new; end if;

  new.needs_review_at := now();
  new.needs_review_reason := v_reason || ' Review it again before it posts.';
  -- The approval itself goes too. A standing approval on changed content is the exact thing the
  -- flag exists to prevent, and leaving it would let a cleared flag resurrect it.
  new.approved_at := null;
  return new;
end $function$;

update public.social_posts p
   set needs_review_at = null, needs_review_reason = null, updated_at = now()
 where p.needs_review_at is not null
   and p.needs_review_reason like 'The video was re-rendered%'
   and p.approved_at is null
   and p.published_at is null
   and p.external_post_id is null
   and p.render_version = 1
   and p.status = 'scheduled';

do $$
declare
  v_left integer;
begin
  select count(*) into v_left
    from public.social_posts
   where needs_review_at is not null
     and needs_review_reason like 'The video was re-rendered%'
     and approved_at is null
     and render_version = 1
     and status = 'scheduled';
  if v_left <> 0 then
    raise exception 'first-render review flags remain: %', v_left;
  end if;
  if not exists (
    select 1 from pg_proc
     where proname = 'social_posts_agent_review_on_change'
       and prosrc like '%v_had_render%'
  ) then
    raise exception 'the trigger function was not replaced';
  end if;
end $$;

commit;
