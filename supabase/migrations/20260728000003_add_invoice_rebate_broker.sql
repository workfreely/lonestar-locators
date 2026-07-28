-- Invoice Details expansion: broker split + rebate tracking.
--   invoice_broker_split_pct — the locator's share (%). Expected Commission is
--     derived (Total Invoice Amount × broker split %), computed in the UI and
--     NOT stored, same as Total Invoice Amount.
--   invoice_rebate_type / invoice_rebate_amount — concession offered to the
--     client (None | Cash Rebate | Free Movers | Gift Card | Other), for future
--     gross / rebate / net commission reporting.
-- (The earlier invoice_expected_commission column is now unused — Expected
--  Commission became an auto-calculation — but is left in place harmlessly.)

alter table public.leads
  add column if not exists invoice_broker_split_pct  numeric,
  add column if not exists invoice_rebate_type       text,
  add column if not exists invoice_rebate_amount     numeric;
