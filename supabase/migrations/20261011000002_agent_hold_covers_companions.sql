-- THE COMPANION-STORY GAP.
--
-- A Story companion is created at approval with connection_id NULL and only receives the Reel's
-- connection at RELEASE, 45 minutes after the Reel actually publishes. Both agent triggers match
-- on `c.id = p.connection_id`, so while that column is null a Story matches NOTHING: an admin can
-- withdraw a video, and the Story created before the withdrawal is neither flagged nor unapproved.
-- Worse, storyFollowUp stamps it with a FRESH approved_at at release, so it then looks newly
-- approved by a human when no human touched it.
--
-- Measured before writing this, with the real sequence in a rolled-back transaction:
--     story_flagged = false, story_approved = true, master_available = false
--
-- It did not publish — publishHoldDecision re-reads availability at publish time and refuses — but
-- that left ONE layer standing between a withdrawn video and a post. The whole design of this
-- feature is that no single check is the only thing preventing a mistake.
--
-- So both triggers now also match a post whose FOLLOWED post is agent-owned. A companion inherits
-- its parent's regime, which is the honest rule: it is the same creative, for the same account,
-- chosen by the same agent.

begin;

-- ONE definition of "this post belongs to an external agent", usable from any trigger.
--
-- Resolves through the post's OWN connection, and — when that is null, which is exactly the
-- companion-Story window — through the connection of the post it FOLLOWS. One level of indirection
-- only: a Story follows a Reel, and nothing follows a Story (storyCompanion refuses to create a
-- companion-of-a-companion), so there is no chain to walk and no cycle to guard against.
create or replace function public.sa_post_is_agent_owned(p_post_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.social_posts p
      left join public.social_connections c  on c.id = p.connection_id
      left join public.social_posts parent   on parent.id = p.follows_post_id
      left join public.social_connections pc on pc.id = parent.connection_id
     where p.id = p_post_id
       and (
         (c.agent_user_id  is not null and c.agent_user_id  <> c.owner_user_id)
         or
         (pc.agent_user_id is not null and pc.agent_user_id <> pc.owner_user_id)
       )
  )
$$;

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
   where p.source_content_id = new.id
     and p.published_at is null
     and p.external_post_id is null
     and (p.approved_at is not null or p.status = 'scheduled' or p.follows_post_id is not null)
     and public.sa_post_is_agent_owned(p.id);

  return new;
end $$;

create or replace function public.social_content_withdraw_agent_posts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.available_to_agents or not old.available_to_agents then
    return new;
  end if;

  update public.social_posts p
     set needs_review_at = now(),
         needs_review_reason = 'This video is no longer available to agents. It will not post.'
   where p.source_content_id = new.id
     and p.published_at is null
     and p.external_post_id is null
     and public.sa_post_is_agent_owned(p.id);

  return new;
end $$;

commit;
