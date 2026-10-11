-- SOCIAL BEAST — AGENT BETA, STAGE 1 FOUNDATION.
--
-- Data + policy only. No UI, no route, no feature is switched on by this file. Every agent-facing
-- capability it enables is additionally gated by a server-side allowlist that is empty until an id
-- is added to it, so applying this migration changes NOTHING for any current user — including the
-- admin, whose policies below are left exactly as they are.
--
-- Four changes:
--   1. social_content.available_to_agents  — the admin's per-video share switch, default FALSE
--   2. social_posts.declined_at            — an agent's "Skip", without touching the status enum
--   3. one-claim-per-(video, connection)   — an agent cannot claim the same video twice
--   4. ADDITIVE agent RLS policies         — agents can read what they are entitled to, and
--                                            nothing else

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. AVAILABLE TO AGENTS — the admin's share switch
-- ════════════════════════════════════════════════════════════════════════════
-- DEFAULT FALSE, NOT NULL. Some master videos feature Jay personally, so the safe state is "not
-- shared" and it must be the state every row starts in — both the 111 that exist today and every
-- future upload. Opting a video IN is a deliberate admin act; there is no path that sets this
-- column true implicitly.
--
-- This column is the AUTHORIZATION INPUT, not a UI hint. The agent read path refuses to mint a
-- signed media URL for a row where it is false — see lib/social/agentAccess.ts. A signed URL is a
-- bearer token: once issued it cannot be recalled, so the check has to happen before signing, not
-- when rendering a list.
alter table public.social_content
  add column if not exists available_to_agents boolean not null default false;

comment on column public.social_content.available_to_agents is
  'Admin-only switch: may agents see and claim this master video? Default false. Enforced server-side before any signed URL is minted, not merely in the UI.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. SKIP
-- ════════════════════════════════════════════════════════════════════════════
-- social_posts_status_chk allows exactly seven values and none of them means "the agent passed on
-- this". Adding an eighth would touch every status consumer in the app — the lane calculator, the
-- calendar dots, the planner's eligibility, the worker's due query. A nullable timestamp beside
-- approved_at is the smaller change and mirrors its shape: null = no decision, set = decided.
alter table public.social_posts
  add column if not exists declined_at timestamptz;

comment on column public.social_posts.declined_at is
  'The agent skipped this video for this connection. Mirrors approved_at; a row may have neither, but never both (enforced below).';

-- Approved and skipped are mutually exclusive. A row carrying both is a bug, and the database is
-- the only place that can say so for every writer at once.
alter table public.social_posts
  drop constraint if exists social_posts_decision_chk;
alter table public.social_posts
  add constraint social_posts_decision_chk
  check (approved_at is null or declined_at is null);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. ONE CLAIM PER (VIDEO, CONNECTION)
-- ════════════════════════════════════════════════════════════════════════════
-- The approval unit is one post row per video × agent connection × DESTINATION.
--
-- DESTINATION IS PART OF THE KEY, and that is not a refinement — a (content, connection) key was
-- tried first and PRODUCTION REFUSED IT. Two real pairs collide, and both are correct data:
--
--   Selene Luxury Residences  reel + its instagram_story companion, same content, same account
--   Remi Apartments           a published reel + a deliberate "anchor test" repost
--
-- The Story chain creates exactly that shape by design (storyCompanion reuses the Reel's content
-- and connection), so a key without destination would have broken Stories the first time one was
-- created.
--
-- PARTIAL on published_at IS NULL as well: published rows are a historical record, and history is
-- allowed to repeat. The constraint exists to stop an agent holding two live decisions on one
-- video for one account, which is a statement about PENDING work only. Verified against production
-- before building: zero collisions under this predicate.
create unique index if not exists social_posts_content_connection_dest_uidx
  on public.social_posts (source_content_id, connection_id, destination)
  where connection_id is not null and published_at is null;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. AGENT RLS — ADDITIVE, NEVER SUBTRACTIVE
-- ════════════════════════════════════════════════════════════════════════════
-- Same-command policies are OR'd, so each policy below widens access for agents and CANNOT narrow
-- what the existing "platform admin owns X" policies already grant. The admin policies are not
-- touched, renamed or re-created.
--
-- An AGENT is a user who holds at least one social_connections row as agent_user_id. That is a fact
-- about a row this migration does not create; with no such row, every policy below matches nothing.

-- A connection the agent holds. The agent may read it (to show account state) and may NOT update
-- it here — pause/resume/disconnect go through the existing SECURITY DEFINER RPCs, which is where
-- that authorization already lives.
drop policy if exists "agent reads own connections" on public.social_connections;
create policy "agent reads own connections"
  on public.social_connections for select
  using (agent_user_id = auth.uid());

-- Master videos: readable ONLY when the admin has shared them. The owner match keeps an agent
-- inside the library of the owner who invited them rather than every owner on the platform.
drop policy if exists "agent reads shared content" on public.social_content;
create policy "agent reads shared content"
  on public.social_content for select
  using (
    available_to_agents
    and exists (
      select 1 from public.social_connections c
       where c.agent_user_id = auth.uid()
         and c.owner_user_id = social_content.owner_user_id
    )
  );

-- Posts: an agent sees ONLY rows bound to a connection they hold. Not the admin's drafts, not
-- another agent's decisions — connection_id is the whole boundary.
drop policy if exists "agent reads own posts" on public.social_posts;
create policy "agent reads own posts"
  on public.social_posts for select
  using (
    connection_id is not null
    and exists (
      select 1 from public.social_connections c
       where c.id = social_posts.connection_id
         and c.agent_user_id = auth.uid()
      )
  );

-- Deliberately NO agent INSERT/UPDATE policy on social_posts. Claiming a video and recording a
-- decision run through server routes under the requireSocialAgent guard, so there is exactly one
-- place that authorizes a write and it is reviewable in one file. An RLS write policy would be a
-- second, independently-evolving answer to the same question.

commit;
