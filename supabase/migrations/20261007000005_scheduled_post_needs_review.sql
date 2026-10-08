-- Mark a SCHEDULED post for review when the price or special it depends on actually changes.
--
-- NOT a staleness clock. Nothing expires on a timer and nothing is blocked by age: a post scheduled
-- six weeks out is fine for six weeks as long as the underlying property data has not moved. The
-- trigger fires on CHANGE, not on elapsed time, which is why social_content.updated_at stays purely
-- informational — it says when a row was last touched, not whether what it says is still true.
--
-- THE GAP THIS CLOSES. Editing a content row's price or special today updates that row and nothing
-- else. A post already scheduled against it keeps its burned-in overlay and its caption, and
-- publishes the old number weeks later with no signal anywhere. Under fill-forward that matters far
-- more than it used to, because placements now land 45+ days out instead of inside a 7-day horizon.
--
-- SMALL ON PURPOSE. Two nullable columns and one trigger. No new table, no job, no scheduler, no
-- expiry policy. It records a fact — "the data behind this scheduled post changed, and here is
-- when and why" — and leaves the decision to a human.
--
-- IT DOES NOT BLOCK PUBLISHING. Nothing here prevents a flagged post from going out; the publish
-- worker is untouched. Whether a flagged post should be held is a separate decision, deliberately
-- not made here.

begin;

alter table public.social_posts
  add column if not exists needs_review_at timestamptz,
  add column if not exists needs_review_reason text;

comment on column public.social_posts.needs_review_at is
  'Set when the source content price/special changed while this post was scheduled. Informational: '
  'nothing is blocked by it. Cleared by re-rendering or by an explicit review.';

create index if not exists social_posts_needs_review_idx
  on public.social_posts (needs_review_at)
  where needs_review_at is not null;

create or replace function public.social_content_flag_scheduled_for_review()
returns trigger
language plpgsql
as $function$
declare
  v_reason text;
begin
  -- Only the three fields that carry a commercial claim. A property NAME or market edit does not
  -- make a scheduled post wrong in the way a changed rent does.
  if new.budget_range    is not distinct from old.budget_range
     and new.special     is not distinct from old.special
     and new.price_label_mode is not distinct from old.price_label_mode then
    return new;
  end if;

  v_reason := trim(both ', ' from concat_ws(', ',
    case when new.budget_range is distinct from old.budget_range
         then 'price ' || coalesce(old.budget_range, '(none)') || ' -> ' || coalesce(new.budget_range, '(none)') end,
    case when new.special is distinct from old.special
         then 'special ' || coalesce(old.special, '(none)') || ' -> ' || coalesce(new.special, '(none)') end,
    case when new.price_label_mode is distinct from old.price_label_mode
         then 'price label ' || coalesce(old.price_label_mode, '(none)') || ' -> ' || coalesce(new.price_label_mode, '(none)') end));

  -- EVERGREEN POSTS ARE NOT FLAGGED. A post only depends on this data if it actually shows it:
  --   * overlay_subheadline non-empty  -> a price/special line is burned into the video
  --   * the caption quotes the OLD special -> the written copy repeats the claim
  -- A headline-only post with no second line and no mention of the special is unaffected by a rent
  -- change, so it is left alone rather than generating review noise.
  --
  -- Only SCHEDULED, not-yet-published rows. Published posts are history and are never rewritten;
  -- drafts are edited before they go anywhere, so there is nothing to warn about.
  update public.social_posts p
     set needs_review_at = now(),
         needs_review_reason = v_reason
   where p.source_content_id = new.id
     and p.status = 'scheduled'
     and p.published_at is null
     and p.external_post_id is null
     and (
       coalesce(nullif(trim(p.overlay_subheadline), ''), '') <> ''
       or (old.special is not null and trim(old.special) <> ''
           and p.caption is not null and position(old.special in p.caption) > 0)
     );

  return new;
end;
$function$;

drop trigger if exists trg_social_content_flag_scheduled_for_review on public.social_content;
create trigger trg_social_content_flag_scheduled_for_review
  after update on public.social_content
  for each row
  execute function public.social_content_flag_scheduled_for_review();

commit;
