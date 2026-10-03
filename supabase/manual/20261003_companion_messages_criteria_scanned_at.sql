-- ─────────────────────────────────────────────────────────────────────────────
-- CONVERSATION CRITERIA EXTRACTION — the processing ledger
--
-- One nullable timestamp recording that the criteria extractor has FINISHED
-- examining an inbound message. NULL means "not yet examined", which is the
-- correct and only state for every row that exists today.
--
-- WHY A COLUMN AND NOT THE CLIENT HISTORY EVENT. Dedupe was previously derived
-- from the evidence guid stored on each criteria_changed event. That works, but
-- it only records messages that CHANGED something — a message examined and found
-- to state nothing leaves no trace, so it would be re-sent to the model on every
-- run, forever. Client History is an audit record of what actually changed; it is
-- not a processing ledger, and overloading it as one conflates two different
-- questions. The evidence guid STAYS on the event for audit; this column is what
-- the consumer reads to decide whether to work.
--
-- SET ONLY AFTER SUCCESS. The consumer stamps this once the required work has
-- completed — including the lead update and the Client History write when a
-- change occurred. A model, Places, or persistence failure leaves it NULL so the
-- message is retried, which is why "scanned" must mean finished, never attempted.
--
-- NOTHING ELSE CHANGES. No default, no backfill, no trigger, no index, no RLS
-- change, and no message content is touched. Beast Sync never reads or writes
-- this column; ingestion, attribution, cursors and ACKs are entirely unaffected.
-- Adding a nullable column with no default is metadata-only in Postgres — no
-- table rewrite and no lock of consequence.
--
-- Idempotent: safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

alter table public.companion_messages
  add column if not exists criteria_scanned_at timestamptz;

comment on column public.companion_messages.criteria_scanned_at is
  'When the conversation criteria extractor FINISHED examining this message. NULL = not yet examined (and the state of every row predating the extractor). Set only after the required processing succeeded, so a failure leaves it NULL and the message is retried. Written only by lib/criteria/processLeadLocation.ts; Beast Sync ingestion never reads or writes it.';

commit;

-- ─── VERIFICATION (read-only; run after the transaction) ─────────────────────
--
-- 1. The column exists and is nullable, with no default:
--
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'companion_messages'
--    and column_name = 'criteria_scanned_at';
--
-- 2. NO existing row was touched — every message is still unscanned:
--
-- select count(*) as messages,
--        count(criteria_scanned_at) as scanned      -- expect 0
--   from public.companion_messages;
--
-- 3. Nothing else on the table changed (same column count + guid still unique):
--
-- select count(*) from information_schema.columns
--  where table_schema = 'public' and table_name = 'companion_messages';
