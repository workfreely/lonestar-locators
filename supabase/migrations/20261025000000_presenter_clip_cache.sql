-- AI PRESENTER — the lip-sync clip cache. PHASE 2a: matching and reuse only, no generation.
--
-- ── WHAT PROBLEM THIS SOLVES ─────────────────────────────────────────────────────────────────
-- An avatar clip is lip-synced to ONE specific audio recording. Reusing it with a different
-- recording puts the wrong mouth on the right words — a desync that renders, publishes, and looks
-- like a bug in the product rather than a data problem. So the question "do we already have an
-- avatar clip for THIS voice hook?" needs a durable, verifiable answer, and that is this table.
--
-- Reuse already works for a single clip (a post caches presenter_clip_storage_path at selection
-- time). What did not exist was any record of WHICH RECORDING a clip was synced to, which is the
-- fact a match has to be made against.
--
-- ── WHY THE MATCH KEY IS THE AUDIO PATH, NOT THE VOICE CLIP ID ───────────────────────────────
-- The storage path is what was actually sent for lip-sync; the social_voice_clips row is a label
-- pointing at it. Keying on the path means:
--   * a deleted-and-re-uploaded hook cannot silently collide with the old clip (a new upload gets
--     a fresh uuid path, so it correctly reads as "no match" rather than reusing the old mouth),
--   * a match can be CHECKED against the file rather than inferred from an id.
-- Voice-clip audio is immutable in practice — uploads use upsert:false, every upload gets a fresh
-- uuid, and the voice-clips route has no update path — but NOTHING ENFORCES THAT. Recording the
-- path (and duration) is what turns "these ids match" into "this clip was synced to these bytes".
--
-- ── WHAT THIS MIGRATION DOES NOT DO ──────────────────────────────────────────────────────────
-- It adds one table. It alters no existing table, drops nothing, and changes no column, policy,
-- default or constraint anywhere else. Every existing post, render, template, caption and voice
-- clip behaves exactly as before; a post that never selects a voice hook never consults this table.

begin;

create table if not exists public.social_presenter_clips (
  id uuid primary key default gen_random_uuid(),

  -- Ownership is explicit AND defaulted, so the RLS predicate below is the same shape the Voice
  -- Clips table uses and a row can never be created unowned.
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,

  -- ── ON DELETE SET NULL ON BOTH, DELIBERATELY ──────────────────────────────────────────────
  -- This row points at an asset that COST MONEY to generate. Deleting a presenter or a voice clip
  -- must disable the match, never destroy the clip. Same reasoning as social_posts.presenter_id,
  -- which is `on delete set null` so removing a presenter disables the feature on its posts
  -- instead of deleting the posts.
  presenter_id  uuid references public.social_presenters(id) on delete set null,
  voice_clip_id uuid references public.social_voice_clips(id) on delete set null,

  -- THE SNAPSHOT. NOT NULL: a row with no recorded audio path could never be matched against
  -- anything, and a nullable column here would let an unmatched row look like a wildcard.
  audio_storage_path text not null,
  audio_duration_s   numeric(6,2),

  -- HeyGen identity. An id, never a credential — same rule as social_presenters.
  heygen_avatar_id text,
  -- Set by Phase 2b when a generation is in flight, so a crash reconciles against the existing
  -- job instead of re-billing. Phase 2a never writes it.
  heygen_video_id  text,

  -- The stored transparent WebM. NULL until a clip exists, which is why `ready` is the only status
  -- a lookup may serve and why the application checks both.
  clip_storage_path text,

  -- Phase 2a only ever writes 'ready' (an operator associating a clip they uploaded themselves)
  -- or 'failed'. The generation states exist now so Phase 2b needs no second migration against a
  -- table that by then holds real rows.
  status text not null default 'queued'
    check (status in ('queued','generating','ready','failed','cancelled')),
  attempt_count int not null default 0,
  max_attempts  int not null default 3,
  error_message text,

  -- IDEMPOTENCY. Derived from (presenter, avatar, audio path) the way renderJobKey() is derived
  -- from a post's render inputs: a double-click, a retried request or a resumed session collapse
  -- onto one row rather than producing two clips — and, in Phase 2b, two charges.
  idempotency_key text not null unique,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  finished_at timestamptz,

  -- A clip that claims to be ready must actually have a file. Without this a 'ready' row with a
  -- NULL path would satisfy a status check and then render no avatar at all, silently.
  constraint social_presenter_clips_ready_has_clip
    check (status <> 'ready' or clip_storage_path is not null)
);

comment on table public.social_presenter_clips is
  'Lip-synced AI Presenter clips, keyed to the EXACT audio recording each one was synced to. '
  'Exists so selecting a voice hook can reuse an existing clip instead of generating another, and '
  'so a clip synced to one recording is never served for a different one. audio_storage_path is '
  'the match key rather than voice_clip_id because the path is what was actually synced.';
comment on column public.social_presenter_clips.audio_storage_path is
  'The voice recording this clip was lip-synced to, as a storage key. THE MATCH KEY. Snapshotted '
  'rather than joined so a match is provable against the file instead of inferred from an id.';
comment on column public.social_presenter_clips.idempotency_key is
  'Derived from presenter + avatar + audio path. UNIQUE, so concurrent or retried requests collapse '
  'onto one row instead of producing (and in Phase 2b paying for) a second clip.';

-- ── THE REUSE LOOKUP, AND THE DUPLICATE GUARD, IN ONE INDEX ─────────────────────────────────
-- Unique on (presenter, audio path) but ONLY over the live statuses. Two consequences, both
-- wanted:
--   * a second request for a pair already queued/generating/ready is refused by the database, not
--     by application logic that could be forgotten;
--   * a 'failed' or 'cancelled' row does NOT permanently block a retry of that pair, which is what
--     makes a retry safe rather than a dead end.
create unique index if not exists social_presenter_clips_match_uidx
  on public.social_presenter_clips (presenter_id, audio_storage_path)
  where status in ('queued','generating','ready');

-- The lookup path: owner + presenter + audio path.
create index if not exists social_presenter_clips_owner_idx
  on public.social_presenter_clips (owner_user_id, presenter_id, audio_storage_path);

drop trigger if exists social_presenter_clips_touch on public.social_presenter_clips;
create trigger social_presenter_clips_touch before update on public.social_presenter_clips
  for each row execute function public.set_updated_at();

alter table public.social_presenter_clips enable row level security;

-- Owner-scoped, mirroring social_voice_clips. There is deliberately NO shared/sample read path:
-- a lip-synced clip is one person's voice and face, so unlike a sample presenter it is never
-- readable by another account. Service-role bypasses for the Phase 2b worker.
drop policy if exists "presenter clips owner all" on public.social_presenter_clips;
create policy "presenter clips owner all" on public.social_presenter_clips
  for all to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

commit;
