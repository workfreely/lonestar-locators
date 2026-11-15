-- CERTIFYING THAT AN ASSET CARRIES NOBODY'S PERSONAL IDENTITY.
--
-- Phase C. Four nullable columns, no backfill, no default, nothing reads them until the predicate
-- that ships alongside. Everything starts uncertified, which is the only safe starting point.
--
-- ── WHY A PERSON HAS TO SAY SO ──────────────────────────────────────────────────────────────
-- It cannot be derived, and this database proves it. All 15 posts built from the 18 videos the
-- operator marked "Personal — Only Me" carry presenter_id, voice_hook_id and voice_cta_id ALL
-- NULL. A rule of "no presenter and no voice clip means clean" would have certified every single
-- one of the videos he identified as featuring him personally. The correlation between the
-- identity columns and actual personal identity is not weak here — it is inverted.
--
-- ── WHAT 'CLEAN' MEANS ──────────────────────────────────────────────────────────────────────
-- No identifiable personal identity belonging to ANYONE — not the operator, not Lisette, not a
-- future agent. Recognisable footage of a person, an AI clone, and an identifiable personal
-- voiceover all disqualify it.
--
-- AUDIO DOES NOT. Background music, sound effects, original ambient audio and generic
-- non-identifying voiceovers are all perfectly clean. "Has an audio track" and "carries someone's
-- identity" are unrelated questions, and conflating them would make almost nothing reusable.
-- That is precisely why a voice clip needs its own certification rather than being presumed
-- identifying: the system cannot hear the difference between the operator's own voice and a
-- generic read, but a person can.

-- ── THE SOURCE FOOTAGE ──────────────────────────────────────────────────────────────────────
alter table public.social_content
  add column if not exists identity_cleared_at timestamptz,
  add column if not exists identity_cleared_by uuid references auth.users(id) on delete set null;

comment on column public.social_content.identity_cleared_at is
  'When a person certified that this FOOTAGE shows no identifiable individual. NULL = not certified, which is the default for every existing row. Independent of available_to_agents: that is a sharing decision, this is a fact about what is in the frame.';

-- ── THE VOICE CLIPS ─────────────────────────────────────────────────────────────────────────
-- A voice clip is certified when it does NOT identify the person speaking — a generic read, a
-- synthesised line, a track with no personal attribution. The operator's own recognisable voice
-- is never certified, and nothing here guesses which is which.
alter table public.social_voice_clips
  add column if not exists identity_cleared_at timestamptz,
  add column if not exists identity_cleared_by uuid references auth.users(id) on delete set null;

comment on column public.social_voice_clips.identity_cleared_at is
  'When a person certified that this clip does not identify its speaker — a generic or synthesised read rather than a recognisable personal voiceover. NULL = not certified. An uncertified clip makes any render that uses it carry its owner''s identity.';

-- AI PRESENTERS GET NO SUCH COLUMN, DELIBERATELY. A presenter is a likeness of a specific person
-- by construction; there is no version of one that identifies nobody. A render that composites a
-- presenter is 'owned' and that is not a judgement call anybody should be offered.

-- Finding what still needs certifying, without scanning the whole library.
create index if not exists social_content_uncertified_idx
  on public.social_content (owner_user_id) where identity_cleared_at is null;
