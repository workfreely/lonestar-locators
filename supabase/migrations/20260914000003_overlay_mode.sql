-- Beast Social — Text Overlay mode. Each source (social_content) stores a DEFAULT overlay mode and
-- each post (social_posts) carries its own mode (inherited from the source at creation, overridable
-- in the Post Editor). 'generate' = Beast Social renders/burns the Template 1 overlay (current
-- behavior); 'existing' = the uploaded video already has burned-in text, so no Beast Social overlay
-- is drawn. Default 'generate' so ALL existing rows keep the current behavior (no silent disabling).

alter table public.social_content
  add column if not exists overlay_mode text not null default 'generate';
alter table public.social_posts
  add column if not exists overlay_mode text not null default 'generate';

do $$ begin
  alter table public.social_content add constraint social_content_overlay_mode_chk check (overlay_mode in ('generate','existing'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.social_posts add constraint social_posts_overlay_mode_chk check (overlay_mode in ('generate','existing'));
exception when duplicate_object then null; end $$;
