-- VIDEO LIBRARY THUMBNAILS — one small JPEG per source clip, for the internal grid only.
--
-- WHY: the Video Library rendered a live <video> per card and seeked it to 0.6s to produce a
-- poster frame. Measured against the real library (60 clips, one browser, back to back), that
-- left 10-20 of 60 cards still black after ten seconds; without the seek, 60 of 60 painted. The
-- fix is to stop decoding video to draw a thumbnail at all.
--
-- THIS IS NOT A SOCIAL COVER. social_posts.cover_storage_path is the Instagram Reel / TikTok
-- cover the operator chooses for a PUBLISHED post, and it is untouched by this column and by
-- everything that writes it. This column is an internal preview for the admin grid: it is never
-- published, never uploaded to any platform, and never read by the render or publish paths.
--
-- The original video is not touched. thumb_storage_path is a SEPARATE object beside the source
-- (<owner>/<content id>/thumb.jpg vs .../source.<ext>); nothing here renames, re-encodes,
-- replaces or deletes an original, and a null value simply means "no thumbnail yet", which the
-- UI falls back from safely.
alter table public.social_content
  add column if not exists thumb_storage_path text;

comment on column public.social_content.thumb_storage_path is
  'INTERNAL Video Library preview JPEG (<owner>/<id>/thumb.jpg) in the social-media bucket. NOT an Instagram/TikTok cover (that is social_posts.cover_storage_path) and never published. Null = not generated yet; the grid falls back to the video element.';
