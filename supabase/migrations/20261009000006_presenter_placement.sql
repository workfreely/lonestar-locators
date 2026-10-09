-- AI PRESENTER — per-post size and side.
--
-- The approved default placement (lower-LEFT, 360px wide) is NOT changing. These columns let one
-- post override it when the avatar would cover something that matters in that particular
-- walkthrough — a kitchen island on the left, say — without touching the overlay templates, the
-- frozen y427 headline anchor, or any other post.
--
-- ── BOTH ARE NULLABLE, AND NULL MEANS "USE THE DEFAULT" ──────────────────────────────────────
-- Not `default 'left'` / `default 360`. A stored default would copy today's geometry into every
-- row, and then changing the product default later would silently NOT apply to any existing post,
-- because each would carry its own frozen copy. NULL keeps lib/social/presenterSpec.ts the single
-- source of truth for what "default" means — the same discipline the overlay spec follows.
--
-- Every existing row is therefore untouched and unaffected.
--
-- ── THE RANGE IS ENFORCED HERE, NOT ONLY IN THE UI ──────────────────────────────────────────
-- 240–520px. Below ~240 a waist-up figure stops reading as a person at Reels scale; above ~520 it
-- starts competing with the property footage it is supposed to introduce. The right-hand placement
-- is additionally bounded by Instagram's engagement rail at x978, which the application computes —
-- a width that would overlap the rail is repositioned, never allowed to sit under the icons.

begin;

alter table public.social_posts
  add column if not exists presenter_side text
    check (presenter_side is null or presenter_side in ('left', 'right'));

alter table public.social_posts
  add column if not exists presenter_width_px integer
    check (presenter_width_px is null or (presenter_width_px >= 240 and presenter_width_px <= 520));

comment on column public.social_posts.presenter_side is
  'Which corner the presenter occupies, or NULL for the product default (left). NULL rather than a '
  'stored default so presenterSpec.ts stays the one definition of the default and a future change '
  'to it reaches existing posts.';
comment on column public.social_posts.presenter_width_px is
  'Rendered avatar width in 1080x1920 canvas units, or NULL for the product default (360). Height '
  'always follows the clip aspect. Bounded 240-520: smaller stops reading as a person at Reels '
  'scale, larger competes with the footage.';

commit;
