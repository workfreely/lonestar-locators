-- Social Autopilot → Post Composer + rendering (Option A: server-side FFmpeg).
--
-- Additive columns on social_posts for the composer + rendered derivative. The source
-- (social_content) stays IMMUTABLE; the rendered file is a separate storage identity
-- ({owner}/{contentId}/renders/{postId}-{version}.mp4) referenced by rendered_storage_path.
-- Overlay geometry lives in the existing on_video_config jsonb. No publishing here.

alter table public.social_posts
  add column if not exists overlay_headline     text,
  add column if not exists overlay_subheadline  text,
  add column if not exists hashtags             text[],
  add column if not exists audio_choice         text not null default 'original',  -- original | none | lb_track
  add column if not exists audio_track_id        uuid,                              -- future Locator Beast Music
  add column if not exists rendered_storage_path text,                              -- derivative path (immutable source untouched)
  add column if not exists render_status         text not null default 'none',      -- none | rendering | ready | error
  add column if not exists render_error          text,
  add column if not exists render_version        integer not null default 0;

comment on column public.social_posts.rendered_storage_path is
  'Storage path of the RENDERED derivative (overlay burned in + selected audio). The source
   social_content object is never modified; this is a separate object with its own identity.';
comment on column public.social_posts.audio_choice is
  'original = keep source audio; none = muted; lb_track = approved Locator Beast Music track
   (audio_track_id), rights-safe curated audio only — never Instagram trending/licensed music.';
