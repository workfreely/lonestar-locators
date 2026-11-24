-- APPLIED 23 Nov 2026, in one transaction with the launch release.
--
-- Adds mirrors_connection_id and balance_markets, then points Lisette's TikTok at her Instagram
-- and switches balanced rotation on for both of her destinations. Verified inside the transaction:
-- exactly one mirror link exists, and balance_markets is set on NO destination that is not hers.
--
-- ONE CREATIVE ON TWO PLATFORMS: the two columns the scheduler needs, and the two rows that use
-- them. Run AFTER 20261122000000_buffer_publish_route.sql and
-- 20261122000001_lisette_buffer_destinations.sql, because the UPDATE at the bottom reads the rows
-- that file inserts.
--
-- ── WHAT THESE COLUMNS CHANGE FOR EXISTING DESTINATIONS: NOTHING ───────────────────────────
-- Both are added NULL / FALSE, and both are read as opt-in:
--
--   mirrors_connection_id   NULL  -> the destination plans for itself, exactly as today
--   balance_markets         FALSE -> the planner's long-standing parity rule, the same code path
--
-- Jay's four destinations take the identical branch they take now. That is asserted by test, not
-- assumed: scripts/social/mirroredSchedule.test.ts checks that computeAutopilotPlan only diverges
-- when the column is set.
--
-- ── WHY A SELF-REFERENCE RATHER THAN A PAIR TABLE ─────────────────────────────────────────
-- A pair is directional: one destination CHOOSES the creative and the other FOLLOWS it. A symmetric
-- pair table would have to encode which half leads anyway, and would make "two followers of one
-- lead" (an agent on three platforms) a different shape rather than another row. This column says
-- exactly one thing — "my schedule comes from that destination" — and the planner reads it that way.
--
-- ON DELETE SET NULL, deliberately: removing the lead must not remove the follower. A follower
-- whose lead is gone stops mirroring and plans nothing (computeAutopilotPlan notes it by name),
-- which is the safe direction. RESTRICT would instead block a disconnection, and CASCADE would
-- delete a live destination to satisfy a scheduling preference.

begin;

alter table public.social_connections
  add column if not exists mirrors_connection_id uuid
    references public.social_connections(id) on delete set null,
  add column if not exists balance_markets boolean not null default false;

comment on column public.social_connections.mirrors_connection_id is
  'This destination takes its schedule and its creative from that destination, instead of planning for itself: the same source_content_id at the same minute, rendered for this destination''s own geometry. NULL (the default, and every pre-existing row) means it plans independently. See lib/social/mirroredSchedule.ts.';
comment on column public.social_connections.balance_markets is
  'Ask for the least-posted permitted market instead of the one the slot index names. A preference only — market_restriction remains the hard filter. FALSE (the default, and every pre-existing row) keeps the planner''s parity rule. See lib/social/marketBalance.ts.';

-- A destination cannot mirror itself: that would be a schedule with no source.
alter table public.social_connections
  drop constraint if exists social_connections_mirror_not_self;
alter table public.social_connections
  add constraint social_connections_mirror_not_self
  check (mirrors_connection_id is null or mirrors_connection_id <> id);

-- One follower per lead per provider is not enforced here, and that is a choice: the planner
-- already handles several followers of one lead (each gets its own mirrorSchedule pass against its
-- own pool), and a constraint would have to know about providers to be correct.
create index if not exists social_connections_mirrors_idx
  on public.social_connections (mirrors_connection_id)
  where mirrors_connection_id is not null;

-- ── LISETTE'S PAIR ─────────────────────────────────────────────────────────────────────────
-- Instagram LEADS and TikTok FOLLOWS. The direction is not arbitrary:
--
--   • the Instagram pool is the one with inventory — tiktok_video rows are siblings created from
--     an approved Reel (lib/social/tiktokSibling.ts), so TikTok can never have a creative that
--     Instagram does not;
--   • instagram_reel publishes today, while tiktok_video is still `awaiting_approval`, so a TikTok
--     lead would plan a queue its own publisher refuses.
--
-- Scoped to her agent_user_id, so this statement can touch nothing of Jay's. Both rows already
-- carry stagger_offset_minutes = 0 (set by 20261122000001), which is why the mirrored minute and
-- the follower's own derived minute are the same 07:30 / 19:30 rather than a few minutes apart.
update public.social_connections tt
   set mirrors_connection_id = ig.id,
       balance_markets = true,
       updated_at = now()
  from public.social_connections ig
 where tt.agent_user_id = '27d7bde4-00f0-433c-b32b-b243623ad20a'
   and tt.provider = 'tiktok'
   and ig.agent_user_id = tt.agent_user_id
   and ig.provider = 'instagram'
   and tt.buffer_channel_id is not null
   and ig.buffer_channel_id is not null;

-- The LEAD also balances, because the lead is where the market is chosen. Mirroring copies the
-- outcome, so setting it on the follower alone would balance nothing.
update public.social_connections
   set balance_markets = true,
       updated_at = now()
 where agent_user_id = '27d7bde4-00f0-433c-b32b-b243623ad20a'
   and provider = 'instagram'
   and buffer_channel_id is not null;

commit;

-- ── VERIFY, READ ONLY ──────────────────────────────────────────────────────────────────────
--
--   1. Her pair, and its direction:
--
--      select f.username, f.provider as follower, f.balance_markets,
--             l.provider as leads, l.balance_markets as lead_balances,
--             f.stagger_offset_minutes, l.stagger_offset_minutes as lead_stagger,
--             f.market_restriction
--        from public.social_connections f
--        join public.social_connections l on l.id = f.mirrors_connection_id
--       where f.agent_user_id = '27d7bde4-00f0-433c-b32b-b243623ad20a';
--
--      Expect exactly ONE row: follower tiktok, leads instagram, both balance_markets true, both
--      staggers 0, market_restriction {San Antonio,Austin}.
--
--   2. Nothing of Jay's moved — must return 0 rows:
--
--      select id, provider, mirrors_connection_id, balance_markets
--        from public.social_connections
--       where agent_user_id is distinct from '27d7bde4-00f0-433c-b32b-b243623ad20a'
--         and (mirrors_connection_id is not null or balance_markets is true);
--
--   3. Posting is still off everywhere it was off:
--
--      select provider, posting_paused from public.social_connections
--       where agent_user_id = '27d7bde4-00f0-433c-b32b-b243623ad20a';
--
--      Expect posting_paused = true on both.
