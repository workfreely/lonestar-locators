-- A POST MAY CARRY ITS OWN SOURCE VIDEO, WITHOUT DUPLICATING THE PROPERTY.
--
-- social_content conflates two things in one row: the SOURCE VIDEO (storage_path) and the
-- PROPERTY'S FACTS (property_name, market, budget_range, special, amenities, notes, place_id,
-- property_type, area_neighborhood, tags, details). That conflation means "same property, new
-- footage" has, until now, required a second social_content row — i.e. a second independent copy
-- of the property facts.
--
-- That is not a hypothetical cost. Two properties in this database already have two content rows
-- each, and the copies have DRIFTED:
--
--   The Standard at Legacy (place_id ChIJT5xo…)  →  $2,400 in one row, $1,300 in the other
--   300 Main               (place_id ChIJsVxi…)  →  "Garage Parking" vs "Rooftop Pool"
--
-- Same property, two prices. This column is the smallest change that stops the workflow producing
-- more of that: the property stays ONE social_content row, and a post that needs different footage
-- overrides the video on itself.
--
--   source_storage_path IS NULL      → render from social_content.storage_path (every row today)
--   source_storage_path IS NOT NULL  → render from this path instead
--
-- DELIBERATELY NOT a second content row, and deliberately NOT a mutation of
-- social_content.storage_path. Mutating the content row would swap the footage under EVERY post
-- built from it — including published ones, whose artifact and external_post_id are a historical
-- record. The override is per-post, so history is immutable by construction.
--
-- DELIBERATELY NOT a `social_properties` table. That is the correct long-term model (property as
-- its own entity, videos beneath it), but it is a large migration and is not needed to stop the
-- duplication. This column is reversible; that refactor stays open.
--
-- NOT RECONCILING the two existing diverged property pairs — explicitly out of scope. This change
-- is about preventing new ones.

begin;

alter table public.social_posts
  add column if not exists source_storage_path text;

comment on column public.social_posts.source_storage_path is
  'Optional per-post override of the source video. NULL (the default, and every pre-existing row) '
  'means render from social_content.storage_path. Lets one property/source record serve several '
  'creatives shot from different footage WITHOUT duplicating the property metadata onto a second '
  'social_content row. Never set on a published post: a published row''s footage is part of the '
  'historical record, so new footage becomes a new variation instead.';

-- A published post's footage is FROZEN, enforced by the database rather than by every caller
-- remembering. Once published_at or external_post_id is set, the override may not be introduced or
-- changed; "same property, new footage" must become a new variation sharing the same
-- source_content_id. Without this, one stray UPDATE could silently repoint a live post's video.
--
-- Written as a trigger rather than a CHECK because the rule is about the TRANSITION (the value
-- changing on an already-published row), which a CHECK constraint cannot see.
create or replace function public.social_posts_freeze_published_source()
returns trigger
language plpgsql
as $$
begin
  if (old.published_at is not null or old.external_post_id is not null)
     and new.source_storage_path is distinct from old.source_storage_path then
    raise exception
      'social_posts: cannot change source_storage_path on a published post (id=%). Create a new variation sharing the same source_content_id instead.',
      old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists social_posts_freeze_published_source_trg on public.social_posts;
create trigger social_posts_freeze_published_source_trg
  before update on public.social_posts
  for each row
  execute function public.social_posts_freeze_published_source();

commit;
