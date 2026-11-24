-- APPLIED 23 Nov 2026, in one transaction with the launch release.
--
-- Adds personal_agent_user_id and debut_for_agent_user_id to social_content, with the constraint
-- that a debut must belong to the same person as the personal assignment, and a unique index
-- allowing one outstanding debut per agent. Both columns are NULL on every pre-existing row, so
-- the live Personal behaviour — available_to_agents deciding alone — is unchanged until a video is
-- explicitly assigned.
--
-- TWO NULLABLE COLUMNS ON social_content, and no data change of any kind.
--
--   personal_agent_user_id    whose personal video this is
--   debut_for_agent_user_id   the one video that must publish before anything else on that
--                             person's accounts
--
-- ── WHY THE EXISTING COLUMN COULD NOT CARRY THIS ───────────────────────────────────────────
-- The operator's "Personal — Only Me" checkbox is stored INVERTED in available_to_agents, giving
-- two states: shared with agents, or the operator's own. Marking Lisette's video Personal under
-- that rule makes it the OPERATOR's — refused at her account and allowed at his, which is exactly
-- backwards. A third state is needed and one nullable column expresses it:
--
--   available_to_agents  personal_agent_user_id   meaning
--   ───────────────────  ──────────────────────   ────────────────────────────────────────────
--   true                 null                     general apartment content        (today)
--   false                null                     the OPERATOR's personal video    (today)
--   false                <uuid>                   that person's personal video     (new)
--
-- Every row in production is one of the first two, because the column does not exist and the
-- absent value reads as null. So NOTHING the operator has today changes meaning — and that is
-- asserted in scripts/social/personalOwnership.test.ts rather than claimed here.
--
-- ── NO BACKFILL, DELIBERATELY ──────────────────────────────────────────────────────────────
-- There is no statement in this file that touches a single row. The 266 videos currently marked
-- Personal are the OPERATOR's personal videos, which is precisely what `null` already means. A
-- backfill writing his user id into all of them would change nothing semantically and would make
-- the column's own default meaningless.

begin;

alter table public.social_content
  add column if not exists personal_agent_user_id uuid
    references auth.users(id) on delete set null,
  add column if not exists debut_for_agent_user_id uuid
    references auth.users(id) on delete set null;

comment on column public.social_content.personal_agent_user_id is
  'WHOSE personal video this is. NULL (the default, and every pre-existing row) means it is not reserved for any particular person, and available_to_agents alone decides as it always has. When set, this video may ONLY publish to destinations whose effective agent is this user — enforced in both directions, including at the operator''s own accounts — and the destination''s market restriction is waived for it, since a personal video carries no market. See lib/social/personalOwnership.ts.';
comment on column public.social_content.debut_for_agent_user_id is
  'This video must be the FIRST published on every destination belonging to this user. While it is outstanding, that user''s destinations are narrowed to this video in the planner and nothing else may publish there. Satisfied when a post of this content reaches status ''published'' on EVERY one of those destinations; one of two is not partial credit. Released by publishing, or by the operator clearing this column. See lib/social/debutGate.ts.';

-- ── THE TWO COLUMNS MUST AGREE ABOUT WHO ───────────────────────────────────────────────────
-- A video reserved for Lisette cannot be the first video on the operator's account: it may not
-- publish there at all, so the hold would never be satisfiable and nothing would ever publish on
-- his accounts again. Refused at write time rather than discovered as a stalled queue.
--
-- An UNASSIGNED video may still be a debut: a general apartment video is a perfectly good first
-- post, so only the case where both are set is constrained.
alter table public.social_content
  drop constraint if exists social_content_debut_matches_personal;
alter table public.social_content
  add constraint social_content_debut_matches_personal
  check (
    debut_for_agent_user_id is null
    or personal_agent_user_id is null
    or debut_for_agent_user_id = personal_agent_user_id
  );

-- AT MOST ONE DEBUT PER PERSON. Two videos both claiming to be first is a contradiction, and the
-- planner reports it rather than choosing; this makes it unwritable instead.
create unique index if not exists social_content_one_debut_per_agent
  on public.social_content (debut_for_agent_user_id)
  where debut_for_agent_user_id is not null;

-- The planner filters the pool by assignment on every run; this keeps that a lookup rather than a
-- scan of the whole library.
create index if not exists social_content_personal_agent_idx
  on public.social_content (personal_agent_user_id)
  where personal_agent_user_id is not null;

commit;

-- ── VERIFY, READ ONLY ──────────────────────────────────────────────────────────────────────
--
--   1. Nothing moved. Both counts must be 0, because this file writes no rows:
--
--      select count(*) filter (where personal_agent_user_id is not null)  as assigned,
--             count(*) filter (where debut_for_agent_user_id is not null) as debuts
--        from public.social_content;
--
--   2. The existing two states are intact — these numbers must match what they were before:
--
--      select available_to_agents, count(*)
--        from public.social_content
--       group by 1 order by 1;
--
--   3. The constraint refuses an incoherent pair (expect ERROR, then ROLLBACK):
--
--      begin;
--        update public.social_content
--           set personal_agent_user_id = '27d7bde4-00f0-433c-b32b-b243623ad20a',
--               debut_for_agent_user_id = 'c567c077-d3f4-4532-8807-a54795f753f5'
--         where id = (select id from public.social_content limit 1);
--      rollback;
--
-- ── ASSIGNING HER FIRST VIDEO, when the time comes (NOT part of this file) ─────────────────
--
--      update public.social_content
--         set available_to_agents = false,
--             personal_agent_user_id  = '27d7bde4-00f0-433c-b32b-b243623ad20a',
--             debut_for_agent_user_id = '27d7bde4-00f0-433c-b32b-b243623ad20a',
--             updated_at = now()
--       where id = '<the uploaded video>';
--
--   and releasing the hold by hand, if a platform stays broken and the operator decides to
--   proceed anyway — the ONLY override, and deliberately a deliberate act:
--
--      update public.social_content set debut_for_agent_user_id = null
--       where id = '<the uploaded video>';
