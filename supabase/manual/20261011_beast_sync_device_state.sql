-- ─────────────────────────────────────────────────────────────────────────────
-- BEAST SYNC — device-reported state, so Locator Beast can show a real status
--
-- The CRM can already infer three things from existing columns: Not Connected (no
-- live row), Sync Paused (sync_paused), and Connection Error (stale last_synced_at).
-- It CANNOT distinguish "Needs Full Disk Access" from a healthy-but-quiet device,
-- because only the Mac knows whether it can read chat.db. These two columns carry
-- that, reported on the heartbeat the Companion already sends.
--
-- Both nullable with no default, so:
--   • every existing row keeps working unchanged (there are 0 today, but the rule
--     holds for any device paired before its app build starts reporting);
--   • NULL means "this device has not told us yet" — never "no" — the same
--     unknown-is-not-failure rule used everywhere else in this project.
--
-- NOT a second source of truth for access. Entitlement, revocation, pause and
-- version remain server-authoritative in getFeatureEntitlement / requireDeviceToken;
-- these are purely the device's self-report for display.
--
-- Idempotent: safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

alter table public.device_tokens
  add column if not exists fda_granted boolean,
  add column if not exists sync_phase  text;

comment on column public.device_tokens.fda_granted is
  'Device self-report: can it read ~/Library/Messages/chat.db (Full Disk Access)? NULL = not reported yet, never "no". Display only — not an access decision.';

comment on column public.device_tokens.sync_phase is
  'Device self-report of its own SyncPhase (needs_pairing | needs_full_disk_access | needs_update | maintenance | paused | idle | syncing | offline | disconnected | pairing_reset). NULL = not reported yet. Display only.';

-- Constrain to the phases the Swift SyncPhase enum can actually produce, so a
-- typo on the client surfaces as a rejected write rather than an unknown chip in
-- the UI. NULL stays allowed.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.device_tokens'::regclass
       and conname  = 'device_tokens_sync_phase_known'
  ) then
    alter table public.device_tokens
      add constraint device_tokens_sync_phase_known
      check (sync_phase is null or sync_phase in (
        'needs_pairing','disconnected','pairing_reset','needs_full_disk_access',
        'needs_update','maintenance','paused','idle','syncing','offline'
      ));
  end if;
end $$;

commit;

-- ─── VERIFICATION (read-only) ────────────────────────────────────────────────
--
-- 1. Both columns exist and are nullable:
--
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'device_tokens'
--    and column_name in ('fda_granted','sync_phase')
--  order by column_name;
--
-- 2. No existing device changed meaning — everything should be NULL:
--
-- select count(*) as devices,
--        count(fda_granted) as reported_fda,
--        count(sync_phase)  as reported_phase
--   from public.device_tokens;
--
-- 3. The phase constraint bites (must RAISE):
--
-- begin;
--   update public.device_tokens set sync_phase = 'not_a_phase';
-- rollback;
