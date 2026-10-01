-- ─────────────────────────────────────────────────────────────────────────────
-- CANONICAL PHONE IDENTITY — Beast Sync attribution by E.164, not by last 10 digits
--
-- Beast Sync decides which lead an incoming iMessage belongs to by phone number,
-- so the phone IS an identity. Today that comparison is
-- `digits.replace(/\D/g,'').slice(-10)`, which has three measured defects:
--
--   1. "+44 20 7946 0958" (London) reduces to 2079460958 — area code 207 is MAINE.
--      A UK client's messages would attribute to a Maine lead. +1 is not "the US":
--      the NANP is shared with Canada and ~20 Caribbean nations.
--   2. Soft-deleted leads are not excluded from the lookup at all, so a deleted
--      lead can capture a live lead's messages.
--   3. On a duplicate number the first row returned wins (`!map.has(key)`), which
--      is an arbitrary choice between two real leads.
--
-- The rule itself lives in lib/phone/identity.ts (libphonenumber-js), because
-- deciding that 416 is Canadian needs the area-code-to-country map, not a regex.
-- These columns are where that decision is STORED so it can be indexed and joined.
--
-- ── WHY A COLUMN AND NOT A GENERATED EXPRESSION ──────────────────────────────
-- A generated column would need the NANP country map in SQL. Keeping one rule in
-- TypeScript and writing its result here means there is exactly one definition of
-- identity; the alternative is two that will drift.
--
-- NOTHING IS BACKFILLED BY THIS FILE. Backfill runs through the same TypeScript
-- rule: `npx tsx scripts/companion/backfillPhoneIdentity.ts`. A SQL backfill
-- could only guess, and guessing is the bug being fixed.
--
-- Idempotent: safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── leads ────────────────────────────────────────────────────────────────────
-- Nullable with no default: NULL means "this lead has no Beast Sync identity",
-- which covers both "no phone yet" (10 of 26 rows today) and "has a phone that is
-- not a U.S. number". Both are normal states, not errors — a lead does not need a
-- phone to exist, and a foreign number stays as contact information.
alter table public.leads
  add column if not exists phone_e164 text;

comment on column public.leads.phone_e164 is
  'Canonical E.164 phone identity (+12105551234) for Beast Sync attribution, written by lib/phone/identity.ts. NULL = no Beast Sync identity (no phone, or a non-U.S./invalid number kept as contact info). leads.phone remains the human-entered display value.';

-- ── companion_messages ───────────────────────────────────────────────────────
-- The same identity derived from the inbound iMessage handle, so attribution is a
-- column-to-column comparison instead of per-row string surgery. NULL covers
-- e-mail handles, shortcodes and foreign numbers — none of which may identify a
-- lead.
alter table public.companion_messages
  add column if not exists phone_e164 text;

comment on column public.companion_messages.phone_e164 is
  'Canonical E.164 identity of the message handle, written by lib/phone/identity.ts. NULL = the handle cannot identify a lead (e-mail handle, shortcode, non-U.S. number).';

-- Why a message is NOT attributed. Without this, "two leads share this number, so
-- I refused to guess" is indistinguishable from "no lead has this number" — and a
-- conflict nobody can see is a conflict nobody resolves. The product requirement
-- is to SURFACE ambiguity rather than pick a lead.
alter table public.companion_messages
  add column if not exists attribution_status text;

comment on column public.companion_messages.attribution_status is
  'Why this message is or is not attributed: attributed | no_match (no lead has this number) | ambiguous (2+ live leads share it — deliberately NOT attributed) | ineligible (handle is not a U.S. phone number). NULL = predates this column.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.companion_messages'::regclass
       and conname  = 'companion_messages_attribution_status_known'
  ) then
    alter table public.companion_messages
      add constraint companion_messages_attribution_status_known
      check (attribution_status is null or attribution_status in
        ('attributed','no_match','ambiguous','ineligible'));
  end if;
end $$;

-- ── indexes ──────────────────────────────────────────────────────────────────
-- Attribution asks exactly one question: "which LIVE leads in THIS workspace have
-- this identity?" Partial on both conditions so the index holds only rows that can
-- ever match — soft-deleted leads are excluded here as well as in the query, since
-- defect 2 above was precisely a missing deleted_at filter.
create index if not exists leads_workspace_phone_e164_idx
  on public.leads (workspace_id, phone_e164)
  where phone_e164 is not null and deleted_at is null;

-- The late-attribution scan: "unattributed messages in this workspace for this
-- identity". Partial on lead_id is null, which is the only set it ever reads, and
-- which shrinks to nearly nothing once messages are attributed.
create index if not exists companion_messages_unattributed_phone_idx
  on public.companion_messages (workspace_id, phone_e164)
  where lead_id is null;

commit;

-- ─── VERIFICATION (read-only) ────────────────────────────────────────────────
--
-- 1. All three columns exist and are nullable:
--
-- select table_name, column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public'
--    and (table_name, column_name) in
--        (('leads','phone_e164'),
--         ('companion_messages','phone_e164'),
--         ('companion_messages','attribution_status'))
--  order by table_name, column_name;
--
-- 2. Nothing was backfilled by this migration — every value should be NULL:
--
-- select count(*) as leads, count(phone_e164) as with_identity from public.leads;
--
-- 3. Both indexes exist and are partial:
--
-- select indexname, indexdef from pg_indexes
--  where schemaname = 'public'
--    and indexname in ('leads_workspace_phone_e164_idx',
--                      'companion_messages_unattributed_phone_idx');
--
-- 4. The status constraint bites (must RAISE):
--
-- begin;
--   update public.companion_messages set attribution_status = 'guessed';
-- rollback;
--
-- 5. AFTER running the backfill script, this must return 0 rows — a live lead
--    whose stored phone produced no identity is either foreign or not dialable,
--    and should be reviewed rather than silently unmatchable:
--
-- select id, name, phone from public.leads
--  where deleted_at is null and phone is not null and phone <> '' and phone_e164 is null;
--
-- 6. AFTER the backfill, duplicate identities within one workspace — each of these
--    is a conflict attribution will refuse to guess at:
--
-- select workspace_id, phone_e164, count(*) as leads, array_agg(id) as lead_ids
--   from public.leads
--  where deleted_at is null and phone_e164 is not null
--  group by workspace_id, phone_e164
-- having count(*) > 1;
