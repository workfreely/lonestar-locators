-- A COMPANION STORY HAS NO APPROVAL OF ITS OWN TO INVALIDATE.
--
-- APPLIED 24 Nov 2026.
--
-- social_posts_agent_review_on_change stamps needs_review_at and clears approved_at when an
-- agent-owned row that is approved or scheduled has its caption, hashtags or rendered artifact
-- change. For an agent-owned post that flag is an unconditional publish hold. The rule is right
-- for an ORIGINAL: an agent's approval is a statement about specific content, so changing the
-- content invalidates it.
--
-- A COMPANION STORY IS NOT AN ORIGINAL. It has no independent approval: releaseStoryForReel
-- stamps its approved_at FROM the Reel's, which a human gave, at the moment it releases it — and
-- in that same statement it now copies the Reel's current rendered artifact, so the Story cannot
-- publish a video the Reel has outgrown. The trigger sees that copy as "the video was re-rendered
-- after you approved it" and clears the approval the same statement just set. The Story ends up
-- scheduled, flagged and unapprovable: it can never publish.
--
-- That is exactly what happened to Lisette's debut Story. The Reel published at 19:41:47 and the
-- Story was released for 20:26:47, correct to the second — and arrived unapproved and flagged.
--
-- THE FIX IS THE NARROWEST ONE THAT IS ALSO TRUE: a row with follows_post_id is a derivative, and
-- the trigger returns early for it, the same way it already returns early for an admin row.
-- lib/social/tiktokSibling.ts takes the identical position in canCreateTikTokSibling — "a Story
-- companion is a derivative, not an original" — so this makes the database agree with the code
-- rather than inventing a new rule.
--
-- EVERY OTHER ROW IS UNTOUCHED. An agent's own Reel still loses its approval when its content
-- changes; that is the safeguard and it is not weakened here.
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
  -- A COMPANION STORY carries no decision of its own: its approval is copied from the Reel it
  -- follows, at release, together with that Reel's artifact. There is nothing here to invalidate.
  if new.follows_post_id is not null then
    return new;
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

  -- A render can only invalidate a decision about a video that already existed. The first one
  -- creates the video the decision is about. (20261124000000)
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
  new.approved_at := null;
  return new;
end $function$;

-- The companions this already caught: released, scheduled, and left unapprovable. Their approval
-- comes from the Reel they follow, which is published, so it is restored from that fact rather
-- than invented — and only for a companion whose Reel genuinely published.
update public.social_posts s
   set needs_review_at = null,
       needs_review_reason = null,
       approved_at = coalesce(s.approved_at, now()),
       updated_at = now()
  from public.social_posts r
 where s.follows_post_id = r.id
   and s.published_at is null
   and s.needs_review_at is not null
   and s.status = 'scheduled'
   and r.published_at is not null;

do $$
declare v_left integer; v_src text;
begin
  select count(*) into v_left
    from public.social_posts s join public.social_posts r on r.id = s.follows_post_id
   where s.published_at is null and s.status = 'scheduled' and r.published_at is not null
     and (s.needs_review_at is not null or s.approved_at is null);
  if v_left <> 0 then
    raise exception 'companion Stories still blocked: %', v_left;
  end if;
  select prosrc into v_src from pg_proc where proname = 'social_posts_agent_review_on_change';
  if v_src not like '%new.follows_post_id is not null%' then
    raise exception 'the trigger function was not replaced';
  end if;
end $$;

commit;
