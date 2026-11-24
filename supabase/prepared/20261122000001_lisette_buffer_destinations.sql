-- APPLIED 23 Nov 2026 — Lisette Hernandez's two Buffer-routed destinations.
--
-- Applied as part of the approved launch release, in ONE transaction with the three files below it,
-- after a dry run of the whole release with `commit` replaced by `rollback` passed every guard.
-- Created: her Instagram (7a2e3e3d) and TikTok (b25ef95a), both routed to the Buffer account
-- labelled "Lisette" (bbdb689d), market_restriction {San Antonio, Austin}, posts_per_day 2,
-- posting_paused TRUE. Her two Buffer channel ids were verified against her own Buffer account
-- before applying: 6b03aa80… is @locatorlisette on instagram, 6b03aa49… is @locatorlisette on
-- tiktok, both connected and unlocked, both inside HER organization and not Jay's.
--
-- The four pre-existing destinations were untouched — asserted inside the transaction by comparing
-- their fingerprint over every tracked field against f5067a0ece557c41dfb1008beb256cba.
--
-- Apply AFTER 20261122000000_buffer_publish_route.sql, which adds the table and columns this uses.
--
-- This supersedes the draft written on 21 Nov 2026, which used a single buffer_channel_id column
-- and inserted a social_autopilot_rules row. Both were wrong:
--   • the credential needs its own row (one key per Buffer ACCOUNT, N channels per account) —
--     see the modelling note in 20261122000000;
--   • social_autopilot_rules is read by NOTHING in production, so a row in it would have had no
--     effect. The cadence comes from constants — see
--     20261007000002_social_autopilot_rules.INVESTIGATION.sql.
--
-- ── WHAT THIS DOES NOT DO ──────────────────────────────────────────────────────────────────
-- It touches NONE of Jay's four existing rows: no market restriction, no pause flag, no cadence,
-- no token, no Buffer mapping. Every statement below is an INSERT, and the one UPDATE is scoped by
-- buffer_channel_id to rows this file just created. Jay's Instagram keeps publishing natively
-- through the Meta Graph API exactly as it does today.
--
-- ── VERIFIED AGAINST HER LIVE BUFFER ACCOUNT, 22 Nov 2026 ──────────────────────────────────
-- Organization 6b02f92207e3daab800671f4 (distinct from Jay's, with its own rate-limit bucket):
--
--   instagram / business  6b03aa808541f09ecb6efbec  locatorlisette  America/Chicago
--     connected, unlocked, queue live, defaultToReminders = FALSE, hasActiveMemberDevice = FALSE
--     scopes: basic, content_publish, manage_insights, manage_comments
--     authorizationStatus: posting ok, comment ok, insights ok
--     network cap 50 posts/day, 0 scheduled, 0 sent
--
--   tiktok / account      6b03aa498541f09ecb6efaa8  locatorlisette  America/Chicago
--     connected, unlocked, queue live, hasActiveMemberDevice = FALSE
--     scopes include video.publish
--     authorizationStatus: posting ok, comment ok, insights ok
--     network cap 25 posts/day, 0 scheduled, 0 sent

begin;

-- ── 1. HER BUFFER ACCOUNT, AND ITS KEY ─────────────────────────────────────────────────────
-- The key is NOT in this file and must never be. Create the account row, then store the key
-- through the RPC with the key as a BIND PARAMETER, from a server-side call — never pasted into
-- SQL, where it would land in the statement log:
--
--   select public.sa_set_buffer_api_key(
--     'c567c077-d3f4-4532-8807-a54795f753f5',  -- p_owner_user_id: the platform admin, verified
--     null,                              -- p_account_id: null creates
--     'Lisette',                         -- p_label
--     $1,                                -- p_key, BOUND, read from ~/.buffer/lisette-api-key
--     '6b02f92207e3daab800671f4');       -- p_organization_id
--
-- Her account row is owned by the platform admin, as every social_connections row already is;
-- `label` is what records that the Buffer account and its key are hers. scripts/store-buffer-key.mjs
-- performs this call without printing the key.
--
-- That returns the new account id. The insert below is written to be run AFTER it, reading the
-- account back by label so no uuid has to be copied by hand.
--
-- owner_user_id is JAY, not Lisette, and that is correct: social_connections.owner_user_id is
-- always the platform admin (RLS is `is_platform_admin() and owner_user_id = auth.uid()`), and
-- agent_user_id is what records whose brand a destination carries. Making Lisette the owner would
-- mean inserting her into platform_admins, which would grant her administrative reach over every
-- account including Jay's — the opposite of separating her.

-- ── 2. HER TWO DESTINATIONS ────────────────────────────────────────────────────────────────
-- posting_paused = true is stated EXPLICITLY rather than left to the column default. It is the
-- switch that keeps both accounts silent until activation is approved, and a reader of this file
-- should not have to know the default to know that nothing will post.
--
-- posts_per_day = 2 is likewise explicit although NULL already yields 2 via
-- BASELINE_DAILY_TIMES.length — so that her cadence is a stated fact rather than a fall-through.
-- The times themselves (07:30 and 19:30 America/Chicago) come from BASELINE_DAILY_TIMES and
-- DEFAULT_TIMEZONE and are not expressible per row today.
--
-- market_restriction is the enforced filter. The planner filters her pool by it before selection;
-- the Buffer worker re-checks it twice — once before claiming the row and again as the last
-- statement before the send — and FAILS the post on a mismatch rather than skipping it.
insert into public.social_connections
  (owner_user_id, agent_user_id, provider, username, label,
   buffer_account_id, buffer_channel_id,
   market_restriction, posting_paused, posts_per_day, stagger_offset_minutes,
   status, external_account_id, token_secret_id)
select
  'c567c077-d3f4-4532-8807-a54795f753f5'::uuid,
  '27d7bde4-00f0-433c-b32b-b243623ad20a'::uuid,
  v.provider, 'locatorlisette', v.label,
  ba.id, v.channel_id,
  array['San Antonio','Austin'], true, 2, 0,
  'connected',
  -- NULL, and deliberately. external_account_id is the id of an account WE hold an OAuth token
  -- for; we hold none, because Buffer holds the network credential. The global uniqueness index on
  -- (provider, external_account_id) is partial on `external_account_id is not null`, so these rows
  -- are unaffected by it — and the unique index on buffer_channel_id is what keeps them unique.
  null,
  -- NULL, and this is the point of the whole feature: a Buffer-routed destination needs no OAuth
  -- token of ours. The native workers now ask isBufferRouted() BEFORE resolving a token, so a null
  -- here is no longer read as "disconnected or removed".
  null
from (values
  ('instagram', 'Lisette — Instagram (via Buffer)', '6b03aa808541f09ecb6efbec'),
  ('tiktok',    'Lisette — TikTok (via Buffer)',    '6b03aa498541f09ecb6efaa8')
) as v(provider, label, channel_id)
cross join (
  select id from public.social_buffer_accounts
   where owner_user_id = 'c567c077-d3f4-4532-8807-a54795f753f5'
     and lower(btrim(label)) = 'lisette'
) ba
-- Idempotent: re-running cannot create a second row for the same Buffer channel. The unique index
-- would refuse it anyway; this makes the file safe to re-run rather than merely safe to run once.
where not exists (
  select 1 from public.social_connections sc where sc.buffer_channel_id = v.channel_id
);

commit;

-- ── VERIFY (read-only, run after) ──────────────────────────────────────────────────────────
--
-- 1. Her two rows, and nothing else, are Buffer-routed and restricted:
--      select sc.username, sc.provider, sc.label, ba.label as buffer_account,
--             sc.buffer_channel_id, sc.market_restriction, sc.posting_paused, sc.posts_per_day
--        from public.social_connections sc
--        left join public.social_buffer_accounts ba on ba.id = sc.buffer_account_id
--       order by sc.provider, sc.username;
--      -- expect: exactly 2 rows with buffer_account = 'Lisette',
--      --         market_restriction = {San Antonio,Austin}, posting_paused = true,
--      --         and Jay's 4 rows with buffer_account NULL and market_restriction NULL
--
-- 2. Her key resolves, and resolves to HER account:
--      select buffer_account_label, provider, posting_paused, market_restriction,
--             length(api_key) > 0 as has_key          -- never select api_key itself
--        from public.sa_get_buffer_destination(
--               (select id from public.social_connections
--                 where buffer_channel_id = '6b03aa808541f09ecb6efbec'));
--      -- expect: 1 row, buffer_account_label = 'Lisette', has_key = true
--
-- 3. Jay's destinations still resolve to NOTHING through the Buffer path:
--      select count(*) from public.social_connections sc
--        cross join lateral public.sa_get_buffer_destination(sc.id)
--       where sc.agent_user_id is distinct from '27d7bde4-00f0-433c-b32b-b243623ad20a';
--      -- expect: 0
--
-- 4. Nothing of Jay's was modified:
--      select username, updated_at from public.social_connections
--       where buffer_account_id is null order by updated_at desc;
--      -- expect: the same timestamps as before this file ran
--        instagram realestatepro_tx   2026-10-23
--        instagram locatorbeast       2026-11-19
--        tiktok    Jay | TX Apart…    2026-11-19
--        tiktok    Jay Morris | Dal…  2026-11-19
