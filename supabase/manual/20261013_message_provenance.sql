-- ─────────────────────────────────────────────────────────────────────────────
-- MESSAGE PROVENANCE — tell the automation's own sends apart from a human's
--
-- THE BUG THIS FIXES. The follow-up gate holds automation when a locator has
-- texted the client recently ("don't fire stale automation right after a human
-- text"). It detects that from companion_messages.is_from_me = true. But the Mac
-- re-ingests EVERY outgoing message from chat.db, including the ones the
-- automation itself just sent — so New Lead Text 1, 30 seconds after it sends,
-- looks exactly like a locator typing by hand and holds Text 2. Whether the
-- opening pair completed at all was a race between the 30s inbound sync and the
-- 30s Text 2 timer.
--
-- Three kinds of message now exist explicitly, because the gate needs to treat
-- them differently and `is_from_me` only distinguishes two:
--   client_inbound     — the client texted us        (is_from_me = false)
--   automated_outbound — Locator Beast sent it       (is_from_me = true)
--   manual_outbound    — a human locator sent it     (is_from_me = true)
--
-- NOT A TIMING HEURISTIC. Provenance is established by identity, two ways:
--   1. AUTHORITATIVE — outbound_intent_id, set when the message's chat.db guid
--      matches the guid the Mac captured for the intent it sent.
--   2. CORRELATION — exact rendered_body of a 'sent' intent for the same lead,
--      claimed one-to-one. Content identity, not "it arrived near a send".
-- Both are durable: they survive re-sync, reboot, and replay, and re-running
-- them reaches the same answer.
--
-- NULL = predates this column, and is deliberately read as MANUAL for an
-- outbound message. That keeps the protective behaviour (automation yields to a
-- human) as the fail-safe: the worst case is a held message, never a message
-- that collides with a locator mid-conversation.
--
-- Idempotent: safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

alter table public.companion_messages
  add column if not exists provenance text;

comment on column public.companion_messages.provenance is
  'Who sent this message: client_inbound | automated_outbound | manual_outbound. NULL = predates this column; an outbound NULL is read as manual, which is the fail-safe (automation yields to a human). Written by lib/companion/provenance.ts at ingest.';

-- The authoritative link back to the automation that produced this message.
-- ON DELETE SET NULL, never CASCADE: the conversation is the client's record and
-- must outlive any automation bookkeeping. Pruning an intent must never delete a
-- message the client actually received.
alter table public.companion_messages
  add column if not exists outbound_intent_id uuid
  references public.followup_outbound_intents(id) on delete set null;

comment on column public.companion_messages.outbound_intent_id is
  'The followup_outbound_intents row that produced this message, when known. Non-null implies provenance = automated_outbound.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.companion_messages'::regclass
       and conname  = 'companion_messages_provenance_known'
  ) then
    alter table public.companion_messages
      add constraint companion_messages_provenance_known
      check (provenance is null or provenance in
        ('client_inbound','automated_outbound','manual_outbound'));
  end if;
end $$;

-- An intent links to at most ONE message. Without this, a correlation bug could
-- attach several chat.db rows to one intent and the one-to-one claim that makes
-- content correlation deterministic would be silently violated.
create unique index if not exists companion_messages_outbound_intent_uidx
  on public.companion_messages (outbound_intent_id)
  where outbound_intent_id is not null;

-- The gate's hot read: "latest manual outbound for this lead". Partial, because
-- that query never looks at inbound or automated rows.
create index if not exists companion_messages_manual_outbound_idx
  on public.companion_messages (lead_id, sent_at desc)
  where provenance = 'manual_outbound';

-- ── the authoritative side of the link ───────────────────────────────────────
-- The chat.db guid of the message this intent produced, captured by the Mac
-- immediately after a successful send. Nullable: an older Mac build does not
-- report it, and correlation covers that case.
alter table public.followup_outbound_intents
  add column if not exists message_guid text;

comment on column public.followup_outbound_intents.message_guid is
  'chat.db message.guid of the message this intent produced, reported by the Mac on ack. The authoritative provenance link; NULL falls back to exact-body correlation.';

commit;

-- ─── VERIFICATION (read-only) ────────────────────────────────────────────────
--
-- 1. Columns exist and are nullable:
--
-- select table_name, column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_schema = 'public'
--    and (table_name, column_name) in
--        (('companion_messages','provenance'),
--         ('companion_messages','outbound_intent_id'),
--         ('followup_outbound_intents','message_guid'))
--  order by table_name, column_name;
--
-- 2. The provenance constraint bites (must RAISE):
--
-- begin;
--   update public.companion_messages set provenance = 'guessed';
-- rollback;
--
-- 3. Both indexes exist:
--
-- select indexname from pg_indexes
--  where schemaname = 'public'
--    and indexname in ('companion_messages_outbound_intent_uidx',
--                      'companion_messages_manual_outbound_idx');
--
-- 4. AFTER the first automated send, every automated message should carry a link
--    or an exact-body correlation — this should return 0 rows:
--
-- select id, guid, sent_at from public.companion_messages
--  where provenance = 'automated_outbound' and outbound_intent_id is null;
--
-- 5. No intent claims two messages (the unique index makes this impossible, so a
--    non-empty result means the index was dropped):
--
-- select outbound_intent_id, count(*) from public.companion_messages
--  where outbound_intent_id is not null
--  group by outbound_intent_id having count(*) > 1;
