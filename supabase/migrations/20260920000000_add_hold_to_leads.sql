-- On Hold workflow for leads (pause a search without leaving the pipeline).
--
-- Purely additive: two nullable columns + one partial index. No backfill, no
-- default, no CHECK/enum change, and crm_status is UNTOUCHED — a held lead keeps
-- its real pipeline stage (e.g. 'searching') so Resume restores it exactly.
--
--   held_at          — non-null ⇒ the lead is On Hold (and when it was held).
--                      NULL ⇒ active. This is the ONLY hold flag; there is no
--                      'hold' crm_status and Hold creates no lead_next_actions row.
--   hold_follow_up_at — the required follow-up/reminder date. The Agenda surfaces a
--                      "Follow Up — {name} · Lead On Hold" item on this date; it does
--                      NOT auto-resume the lead.
--
-- Hold and Archive are mutually exclusive (the archive path clears both columns).

alter table public.leads
  add column if not exists held_at timestamptz,
  add column if not exists hold_follow_up_at date;

-- Cheap "held leads" scans/counts for the board's Inactive → On Hold tab and the
-- cron guards, without touching the full-table indexes.
create index if not exists leads_held_at_idx
  on public.leads (held_at)
  where held_at is not null;
