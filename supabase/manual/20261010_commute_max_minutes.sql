-- ─────────────────────────────────────────────────────────────────────────────
-- COMMUTE MODE — one nullable column
--
-- `leads.commute_max_minutes` is the client's stated MAXIMUM acceptable drive time
-- to `leads.commute_anchor_place_id`. Its nullness IS the mode switch:
--
--   null (or no anchor)  → Area Mode. Every line of the existing Desired Areas
--                          behaviour runs unchanged. This is the default for all
--                          26 existing leads, so applying this migration changes
--                          NO lead's matching.
--   set + anchor present → Commute Mode. The maximum becomes the primary
--                          geographic qualification: a property whose Google
--                          Routes drive time is at or under it has satisfied the
--                          client's location requirement, with no Desired Area
--                          text required.
--
-- WHY A SEPARATE COLUMN FROM THE EXISTING COMMUTE DATA. Two commute numbers exist
-- and they mean opposite things:
--   leads.commute_max_minutes                 the client's REQUIREMENT  (this column)
--   lead_property_reasons.commute_minutes     a MEASURED result per property
-- Conflating them would make a measurement look like a requirement.
--
-- NOT PARSED FROM NOTES. The value is only ever set by the locator choosing from the
-- Max Drive selector. Ka'Leah's "approximately 20 minutes" lived in locator_notes
-- prose and was deliberately left there until this column existed to hold it.
--
-- Idempotent: safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

alter table public.leads
  add column if not exists commute_max_minutes integer;

comment on column public.leads.commute_max_minutes is
  'Client''s maximum acceptable drive time, in whole minutes, to commute_anchor_place_id. NULL = Area Mode (Desired Areas decide geography, unchanged). Set together with an anchor = Commute Mode, where a Routes-verified drive time at or under this value is itself a location match. This is the client REQUIREMENT; lead_property_reasons.commute_minutes is a measured per-property result.';

-- A sanity range, not a UI allowlist. The selector offers 10/15/20/30/45, but the
-- column deliberately accepts any sane value so a later option needs no migration.
-- NOT VALID is unnecessary here: the column is new, so every existing row is null and
-- null passes a CHECK.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.leads'::regclass
       and conname  = 'leads_commute_max_minutes_sane'
  ) then
    alter table public.leads
      add constraint leads_commute_max_minutes_sane
      check (commute_max_minutes is null or (commute_max_minutes > 0 and commute_max_minutes <= 180));
  end if;
end $$;

commit;

-- ─── VERIFICATION (read-only; run after the transaction) ─────────────────────
--
-- 1. The column and its constraint exist, and it is nullable:
--
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'leads'
--    and column_name = 'commute_max_minutes';
--
-- select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--  where conrelid = 'public.leads'::regclass
--    and conname = 'leads_commute_max_minutes_sane';
--
-- 2. NO existing lead changed mode — every row should still be null, so every
--    lead is still in Area Mode (expect commute_mode_leads = 0):
--
-- select count(*)                                             as leads,
--        count(commute_max_minutes)                            as with_max,
--        count(*) filter (where commute_anchor_place_id is not null
--                           and commute_max_minutes is not null) as commute_mode_leads
--   from public.leads;
--
-- 3. The constraint bites (must RAISE, changing nothing):
--
-- begin;
--   update public.leads set commute_max_minutes = 0 where id = 84;    -- rejected
-- rollback;
--
-- begin;
--   update public.leads set commute_max_minutes = 1000 where id = 84; -- rejected
-- rollback;
--
-- 4. THE KA'LEAH BENCHMARK — turn Commute Mode on for her (she already has the
--    Fort Sam anchor). Reversible; run inside a transaction first if you prefer.
--
-- update public.leads set commute_max_minutes = 20 where id = 84;
--
--    Then re-run, which should report Altitude at Brooks verified at ~19 min:
--      npx tsx scripts/matching/commuteBenchmark.ts
--
--    To put her back in Area Mode:
--      update public.leads set commute_max_minutes = null where id = 84;
