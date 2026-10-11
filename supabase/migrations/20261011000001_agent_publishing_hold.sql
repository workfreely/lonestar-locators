-- THE AGENT-OWNED PUBLISHING HOLD.
--
-- An agent approves a SPECIFIC video with SPECIFIC facts on it. If any of those facts change
-- afterwards, their approval no longer means what it meant, and the post must stop until they look
-- again. That is stricter than the admin's rule, deliberately and for one reason: the admin knows
-- what he changed, and the agent does not.
--
-- ── WHY NOT JUST TURN ON THE EXISTING GLOBAL FLAG ───────────────────────────────────────────
-- SOCIAL_PUBLISH_HOLD_ON_REVIEW_ENABLED stays OFF. Flipping it would change the ADMIN's
-- publishing behaviour, which was ruled out. These triggers mark only agent-owned rows, and the
-- enforcement added alongside them holds agent rows unconditionally while leaving admin rows
-- governed by that flag exactly as before.
--
-- ── WHAT COUNTS AS AN EXTERNAL AGENT ────────────────────────────────────────────────────────
-- agent_user_id IS NOT NULL **AND** agent_user_id <> owner_user_id. The second clause is not
-- pedantry: the admin's own Instagram connection carries agent_user_id = owner_user_id, so
-- without it every one of his posts would be swept into the agent regime. Mirrors
-- lib/social/agentIdentity.ts.
--
-- The existing admin trigger (social_content_flag_scheduled_for_review) is NOT modified. These are
-- additional triggers that fire on the same events and only ever touch agent-owned rows.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. MASTER CONTENT CHANGED -> agent posts need re-approval
-- ════════════════════════════════════════════════════════════════════════════
-- Wider than the admin rule in three ways, each deliberate:
--   COLUMNS   also property_type, market, amenities and property_name — an agent quotes all of
--             them to a renter, so a change makes their approval stale even though no pixel moved.
--   STATES    approved OR scheduled, not scheduled only. Approval IS the agent's sign-off; a
--             change between approving and scheduling must not slip through the gap.
--   NO "SHOWS IT" TEST  the admin version skips posts that do not display the changed field. An
--             agent is answering questions about the property, not just publishing a frame, so a
--             changed rent matters to them whether or not it is burned into the video.
create or replace function public.social_content_flag_agent_posts()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_reason text;
begin
  if new.budget_range      is not distinct from old.budget_range
     and new.special       is not distinct from old.special
     and new.price_label_mode is not distinct from old.price_label_mode
     and new.property_type is not distinct from old.property_type
     and new.market        is not distinct from old.market
     and new.amenities     is not distinct from old.amenities
     and new.property_name is not distinct from old.property_name then
    return new;
  end if;

  v_reason := 'The property information changed after you approved this video: ' ||
    trim(both ', ' from concat_ws(', ',
      case when new.budget_range  is distinct from old.budget_range  then 'price' end,
      case when new.special       is distinct from old.special       then 'special' end,
      case when new.price_label_mode is distinct from old.price_label_mode then 'price label' end,
      case when new.property_type is distinct from old.property_type then 'property type' end,
      case when new.market        is distinct from old.market        then 'market' end,
      case when new.amenities     is distinct from old.amenities     then 'amenities' end,
      case when new.property_name is distinct from old.property_name then 'property name' end))
    || '. Review it again before it posts.';

  update public.social_posts p
     set needs_review_at = now(), needs_review_reason = v_reason
    from public.social_connections c
   where p.source_content_id = new.id
     and c.id = p.connection_id
     and c.agent_user_id is not null
     and c.agent_user_id <> c.owner_user_id
     and p.published_at is null
     and p.external_post_id is null
     and (p.approved_at is not null or p.status = 'scheduled');

  return new;
end $$;

drop trigger if exists trg_social_content_flag_agent_posts on public.social_content;
create trigger trg_social_content_flag_agent_posts
  after update on public.social_content
  for each row execute function public.social_content_flag_agent_posts();

-- ════════════════════════════════════════════════════════════════════════════
-- 2. AGENT AVAILABILITY WITHDRAWN -> agent posts stop
-- ════════════════════════════════════════════════════════════════════════════
-- Withdrawing a video is the admin saying "agents may not have this". It must stop work already
-- in flight, not merely hide the row from a list. Flagged here AND checked again at publish time:
-- a flag can be cleared, so the publish path re-reads availability rather than trusting it.
create or replace function public.social_content_withdraw_agent_posts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.available_to_agents or not old.available_to_agents then
    return new;  -- only a true -> false transition
  end if;

  update public.social_posts p
     set needs_review_at = now(),
         needs_review_reason = 'This video is no longer available to agents. It will not post.'
    from public.social_connections c
   where p.source_content_id = new.id
     and c.id = p.connection_id
     and c.agent_user_id is not null
     and c.agent_user_id <> c.owner_user_id
     and p.published_at is null
     and p.external_post_id is null;

  return new;
end $$;

drop trigger if exists trg_social_content_withdraw_agent_posts on public.social_content;
create trigger trg_social_content_withdraw_agent_posts
  after update of available_to_agents on public.social_content
  for each row execute function public.social_content_withdraw_agent_posts();

-- ════════════════════════════════════════════════════════════════════════════
-- 3. CAPTION / HASHTAGS / RENDER CHANGED ON AN AGENT POST -> re-approval
-- ════════════════════════════════════════════════════════════════════════════
-- Caption and hashtags are deliberately NOT in RENDER_AFFECTING_COLUMNS — they are not burned into
-- the MP4, so the admin's rule leaves an approval standing when they change. For an agent that is
-- wrong: the caption is the words published under their name, and they approved the ones they read.
--
-- Render changes are already handled for APPROVAL by social_posts_unapprove_on_rerender. This adds
-- the REASON, so the agent is told why their approval disappeared instead of finding it gone.
create or replace function public.social_posts_agent_review_on_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_is_agent boolean;
  v_reason   text;
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

  v_reason := case
    when new.caption  is distinct from old.caption  then 'The caption changed after you approved this video.'
    when new.hashtags is distinct from old.hashtags then 'The hashtags changed after you approved this video.'
    when new.rendered_storage_path is distinct from old.rendered_storage_path
      or new.render_version is distinct from old.render_version then 'The video was re-rendered after you approved it.'
    else null end;

  if v_reason is null then return new; end if;

  new.needs_review_at := now();
  new.needs_review_reason := v_reason || ' Review it again before it posts.';
  -- The approval itself goes too. A standing approval on changed content is the exact thing the
  -- flag exists to prevent, and leaving it would let a cleared flag resurrect it.
  new.approved_at := null;
  return new;
end $$;

drop trigger if exists trg_social_posts_agent_review_on_change on public.social_posts;
create trigger trg_social_posts_agent_review_on_change
  before update on public.social_posts
  for each row execute function public.social_posts_agent_review_on_change();

commit;
