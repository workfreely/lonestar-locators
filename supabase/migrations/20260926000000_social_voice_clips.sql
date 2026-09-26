-- Social Beast Voice Clips library (reusable Hooks + CTAs).
--
-- A small per-user bank of short voiceover audio files. Each clip is ONE type — a Hook
-- (auto-placed at the start of a video) or a CTA (auto-placed at the end) — stored in the
-- existing private `social-media` bucket. Clips carry only file basics (name, duration);
-- NO property metadata (Market/Type/Price live on the post, not the clip), so a clip can be
-- recorded once and reused across many property videos. Selection is persisted on the post.

create table if not exists public.social_voice_clips (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid(),
  clip_type        text not null check (clip_type in ('hook', 'cta')),
  name             text not null,
  storage_path     text not null,                 -- path within the `social-media` bucket
  duration_seconds numeric,                        -- clip length (optional)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.social_voice_clips is
  'Reusable Social Beast voiceover clips. clip_type hook=start / cta=end. File basics only — no property metadata; the post supplies context.';

create index if not exists social_voice_clips_user_type_idx on public.social_voice_clips (user_id, clip_type, created_at desc);

drop trigger if exists social_voice_clips_touch on public.social_voice_clips;
create trigger social_voice_clips_touch before update on public.social_voice_clips
  for each row execute function public.set_updated_at();

alter table public.social_voice_clips enable row level security;
-- Owner-scoped (mirrors the social-media bucket's owner-folder policy). Service-role bypasses.
drop policy if exists "voice clips owner all" on public.social_voice_clips;
create policy "voice clips owner all" on public.social_voice_clips
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Persist the chosen Hook + CTA on a post (mix-and-match; either may be null).
alter table public.social_posts
  add column if not exists voice_hook_id uuid references public.social_voice_clips(id) on delete set null,
  add column if not exists voice_cta_id  uuid references public.social_voice_clips(id) on delete set null;
