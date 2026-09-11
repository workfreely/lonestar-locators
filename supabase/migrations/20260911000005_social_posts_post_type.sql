-- Social Autopilot → post type (Instagram: Reel | Feed Post | Story).
--
-- Additive column on social_posts. Kept as free text (no DB CHECK) and validated per
-- PLATFORM in application code (lib/social/postTypes.ts) so TikTok/YouTube can add their
-- own content types later WITHOUT a migration and WITHOUT overloading Instagram's values.
-- New video posts default to 'reel'.

alter table public.social_posts
  add column if not exists post_type text not null default 'reel';

comment on column public.social_posts.post_type is
  'Platform-scoped content type (Instagram: reel|feed|story). Validated per platform in
   app code, not by a DB check, so new platforms can add their own types without a migration.';
