-- ROLLBACK 20261115000002_destination_market_restriction.
--
-- Safe while no destination carries a restriction, which row 5 of the verify script proves. If a
-- restriction HAS been set, DROPPING THE COLUMN DISCARDS IT and every destination silently becomes
-- unrestricted — a Dallas-only account would start drawing from every market on the next plan.
-- Check first:
--
--   select provider, username, market_restriction
--     from public.social_connections
--    where market_restriction is not null;
--
-- ── ORDER MATTERS: ROLL THE CODE BACK FIRST ─────────────────────────────────────────────────
-- Three code paths name this column — the planner's connections query, both publish workers' row
-- read, and the accounts page. With the column gone and the code still deployed the system goes
-- INERT, not wrong: the planner gets zero rules and schedules nothing, both workers skip every post
-- fail-closed, and the accounts page's query errors. Nothing publishes to the wrong market either
-- way, but TikTok and Instagram publishing both stop. So: redeploy the previous build, THEN run
-- this.
--
-- Nothing else in the release is undone by dropping the column, because nothing else was added:
-- the planner's pool filter and both workers' guards read NULL as "unrestricted", which is exactly
-- how they behaved before the column existed.

-- The one writer goes first, so nothing can set a value between the two statements.
drop function if exists public.sa_update_destination_markets(uuid, text[]);

alter table public.social_connections
  drop constraint if exists social_connections_market_restriction_shape;

alter table public.social_connections
  drop column if exists market_restriction;

-- NOT TOUCHED, deliberately: posting_paused, posts_per_day, stagger_offset_minutes, label,
-- token_secret_id, scopes and every destination RPC. This release added one column and one
-- function; it changed nothing else, so a rollback removes one column and one function.
