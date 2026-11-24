-- APPLIED 23 Nov 2026 — JAY'S TWO TIKTOK DESTINATIONS → BUFFER.
--
-- Approved as "Step 3 only", after the channel ids were re-verified against Buffer one final time
-- with the stored key: both resolved to the expected handle, both service=tiktok, neither
-- disconnected nor locked, both inside Jay's organization. Dry-run first with `commit` replaced by
-- `rollback`, which reported UPDATE 2 and passed all three guards. Applied in one transaction with
-- ON_ERROR_STOP=1: UPDATE 2, COMMIT.
--
-- Exactly two rows changed, in exactly three columns — buffer_account_id, buffer_channel_id,
-- updated_at. The two Instagram rows were not touched (their updated_at is still 23 Oct and 19 Nov).
-- Verified afterwards: the invariant fingerprint over every other tracked field on all four rows is
-- unchanged, both pause flags are as they were (Dallas still paused), posts_per_day still NULL on
-- both, market_restriction still NULL on both, and sa_get_buffer_destination resolves each
-- destination to its intended handle.
--
-- The channel mapping is CONFIRMED. It was an inference in the earlier PROPOSED draft of this
-- file; the operator has since read the handles against the accounts and stated it directly:
--
--   @locator.beast      is the DALLAS Locator TikTok
--   @realestatepro_tx   is the main TX APARTMENT LOCATOR TikTok
--
-- That is the fact the file was waiting for, and it is recorded here because it cannot be
-- re-derived: a TikTok open_id is scoped to the application that obtained it, so our stored
-- external_account_id and Buffer's serviceId for the SAME account are different strings by
-- design and can never be compared. Nobody auditing this later can check the mapping from the
-- database — only from the TikTok app — so the provenance is the audit trail.
--
-- ── THE MAPPING IS BY ID, NOT BY NAME, AND THAT IS LOAD-BEARING ─────────────────────────────
-- The operator renamed the display name on his Dallas Instagram and Dallas TikTok to
-- "Jay | Dallas Apt Locator" on 23 Nov 2026. The accounts themselves did not change.
--
-- Nothing in this file or in the publishing route reads a display name. The join below is
-- social_connections.id (a uuid we issued) → Buffer channel id (a string Buffer issued), and the
-- worker's route predicate is buffer_account_id + buffer_channel_id and nothing else. A rename on
-- either platform, today or later, cannot move a post to the wrong account, because no name is
-- consulted at any point between an approved row and Buffer's API.
--
-- social_connections.username holds the display name as it was at CONNECT time, so the Dallas row
-- still reads the old 'Jay Morris | Dallas Locator'. It is a label shown in the UI and in alert
-- email, read by nothing that routes or publishes. This migration deliberately does NOT refresh
-- it: rewriting a column to match a screenshot would be a change with no effect on behaviour, and
-- the only way to re-read it from TikTok is a reconnect, which is exactly what must not happen.
-- scripts/social/bufferPublish.test.ts asserts the name-independence rather than leaving it here
-- as a claim.
--
-- ── WHAT THIS FILE CHANGES, AND WHAT IT LEAVES ALONE ────────────────────────────────────────
-- CHANGES: two columns on two rows. The destination stops being claimed by
-- /api/cron/social-tiktok-publish and starts being claimed by /api/cron/social-buffer-publish.
--
-- LEAVES ALONE: both pause flags, both market restrictions, both cadences, both stagger offsets,
-- both native TikTok tokens, every comment setting. And Jay's two INSTAGRAM rows are not named
-- here at all — his Instagram keeps publishing natively through the Meta Graph API with its own
-- OAuth token, exactly as today. The verify block below proves that rather than asserting it.
--
-- PREREQUISITE: 20261122000000_buffer_publish_route.sql must be applied first (it creates the two
-- columns and social_buffer_accounts), and Jay's Buffer API key must already be stored — see §1.

begin;

-- ── 1. THE BUFFER ACCOUNT (Jay's own) ──────────────────────────────────────────────────────
-- Store the key BEFORE running this file, server-side, with the key as a BIND PARAMETER so it is
-- never pasted into SQL, a log or a shell history:
--
--   select public.sa_set_buffer_api_key(
--     'c567c077-d3f4-4532-8807-a54795f753f5',  -- p_owner_user_id: the platform admin, verified
--     null, 'Jay', $1, '6b01f357d307eb797108b033');
--
-- The key is read from ~/.buffer/api-key (0600). It is a DIFFERENT key from Lisette's and must
-- stay in a different account row: that separation is what makes it impossible for one account's
-- channels to be published with the other's credential. scripts/store-buffer-key.mjs does this
-- without printing the key.
--
-- The label 'Jay' is OUR OWN name for the account row, not a platform display name — it is how
-- this file finds the account it just created, and it is unique per owner by index.

-- ── 2. THE ACCOUNT MUST EXIST BEFORE ANYTHING IS POINTED AT IT ─────────────────────────────
-- Without this guard the UPDATE below would find no account row, join to nothing, and report
-- "UPDATE 0" — a silent no-op that reads like success. That is the single most likely way to run
-- this file and believe it worked. Fail loudly instead.
do $$
declare v_account uuid;
begin
  select id into v_account
    from public.social_buffer_accounts
   where owner_user_id = 'c567c077-d3f4-4532-8807-a54795f753f5'
     and lower(btrim(label)) = 'jay';
  if v_account is null then
    raise exception
      'No Buffer account row labelled "Jay" for this owner. Run sa_set_buffer_api_key first (see section 1) — nothing has been changed.';
  end if;
end $$;

-- ── 3. POINT THE TWO TIKTOK ROWS AT BUFFER ─────────────────────────────────────────────────
-- An UPDATE, not an insert: these rows exist and are live. Scoped by id, one row each, so neither
-- statement can touch anything else. The provider guard is belt and braces — it cannot match an
-- Instagram row even if an id were mistyped into the VALUES list.
update public.social_connections sc
   set buffer_account_id = ba.id,
       buffer_channel_id = v.channel_id,
       updated_at        = now()
  from (values
    -- CONFIRMED BY THE OPERATOR, 23 Nov 2026. Handles, not display names.
    ('1b5e4878-06b7-47ea-b9e2-73a11aa44e83'::uuid, '6b02190aece6dfde5f4c0fd6'),  -- Dallas Locator        → @locator.beast
    ('ebf475cf-cb0c-4c6b-8af2-99e89c84bc65'::uuid, '6b021ecdece6dfde5f4c40bf')   -- TX Apartment Locator  → @realestatepro_tx
  ) as v(connection_id, channel_id),
  (select id from public.social_buffer_accounts
    where owner_user_id = 'c567c077-d3f4-4532-8807-a54795f753f5'
      and lower(btrim(label)) = 'jay') ba
 where sc.id = v.connection_id
   and sc.provider = 'tiktok';

-- ── 4. EXACTLY TWO ROWS, OR NOTHING ────────────────────────────────────────────────────────
-- Both ids were read from production on 23 Nov 2026, so two is the only correct count. One would
-- mean an id has changed or a row was deleted — and a half-applied mapping is worse than none,
-- because one account would start publishing through Buffer while the other kept failing on a
-- dead native token, which looks like an intermittent fault rather than a configuration error.
do $$
declare v_mapped int;
begin
  select count(*) into v_mapped
    from public.social_connections
   where provider = 'tiktok'
     and owner_user_id = 'c567c077-d3f4-4532-8807-a54795f753f5'
     and buffer_channel_id is not null;
  if v_mapped <> 2 then
    raise exception
      'Expected exactly 2 Buffer-mapped TikTok destinations, found %. Rolling back — no mapping has been applied.', v_mapped;
  end if;
end $$;

-- ── 5. AND NO TWO DESTINATIONS MAY SHARE A CHANNEL ─────────────────────────────────────────
-- The failure this catches is the inverted mapping's quieter cousin: both rows pointed at one
-- channel. Downstream nothing would complain — Buffer accepts the post, TikTok reports success —
-- and every video would simply go to one account while the other stayed silent.
do $$
declare v_dupe int;
begin
  select count(*) into v_dupe from (
    select buffer_channel_id from public.social_connections
     where buffer_channel_id is not null
     group by buffer_channel_id having count(*) > 1) d;
  if v_dupe > 0 then
    raise exception 'Two destinations share a Buffer channel id. Rolling back.';
  end if;
end $$;

-- ── 6. WHAT HAPPENS TO THE NATIVE TIKTOK TOKENS ────────────────────────────────────────────
-- NOTHING, and that is deliberate. Both tokens are left exactly where they are:
--
--   'Jay | TX Apartment Locator'    token expired 2026-11-20T16:52:01Z
--   'Jay Morris | Dallas Locator'   token expired 2026-11-20T17:56:40Z
--
-- They are not cleared, because clearing them is irreversible without a reconnect and they are the
-- only route back if Buffer turns out to be wrong for this. They are not refreshed either — there
-- is still no TikTok token-refresh cron (only Instagram has one), so an expired TikTok token stays
-- expired until someone reconnects by hand.
--
-- Leaving them expired is HARMLESS once this file is applied: social-tiktok-publish asks
-- isBufferRouted() BEFORE it resolves a token, so a Buffer-routed row with a dead token is skipped
-- as "not ours" rather than failed as a broken credential. social-buffer-publish never looks at it.
-- This is why reconnecting TikTok is not on the critical path.

commit;

-- ── VERIFY (read-only, run after) ──────────────────────────────────────────────────────────
--
-- 1. Exactly two of Jay's rows moved, both TikTok, and his Instagram did not:
--      select sc.provider, sc.username, ba.label as buffer_account, sc.buffer_channel_id,
--             sc.posting_paused, sc.market_restriction
--        from public.social_connections sc
--        left join public.social_buffer_accounts ba on ba.id = sc.buffer_account_id
--       where sc.owner_user_id = 'c567c077-d3f4-4532-8807-a54795f753f5'
--         and sc.agent_user_id is distinct from '27d7bde4-00f0-433c-b32b-b243623ad20a'
--       order by sc.provider, sc.username;
--      -- expect: instagram realestatepro_tx  buffer_account NULL  (unchanged, still native)
--      --         instagram locatorbeast      buffer_account NULL  (unchanged, still native)
--      --         tiktok    …Dallas Locator   buffer_account 'Jay'  channel 6b02190aece6dfde5f4c0fd6
--      --         tiktok    …TX Apartment…    buffer_account 'Jay'  channel 6b021ecdece6dfde5f4c40bf
--      --         posting_paused and market_restriction identical to before:
--      --           Dallas Locator paused = true, TX Apartment Locator paused = false, both NULL restriction
--
-- 2. Each TikTok row resolves to Jay's key and NOT Lisette's:
--      select sc.username, d.buffer_account_label
--        from public.social_connections sc
--        cross join lateral public.sa_get_buffer_destination(sc.id) d
--       where sc.provider = 'tiktok';
--      -- expect: both rows → 'Jay'.  If either says 'Lisette', STOP and fix the mapping.
--
-- 3. The channel mapping is unique — no two destinations share a Buffer channel:
--      select buffer_channel_id, count(*) from public.social_connections
--       where buffer_channel_id is not null group by 1 having count(*) > 1;
--      -- expect: no rows
