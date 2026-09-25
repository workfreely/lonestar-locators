-- Follow-Up Agent — CROSS-CLIENT SEND PACING (persisted dispatch eligibility).
--
-- Sequence timing decides WHEN a step becomes eligible; this decides WHEN an
-- eligible send is actually handed to a device. `send_not_before` staggers
-- different clients ~3–7 min apart and lets a reconnecting device claim only what
-- is genuinely due now — never a whole overdue backlog at once. Additive only.

alter table public.followup_outbound_intents
  add column if not exists send_not_before timestamptz;

comment on column public.followup_outbound_intents.send_not_before is
  'Earliest instant this intent may be handed to a gateway device (cross-client pacing / reconnect catch-up). Distinct from the run''s sequence eligibility (lead_followup_runs.next_eligible_at).';

-- Claim scans pending intents oldest-eligible-first.
create index if not exists followup_intents_sendorder_idx
  on public.followup_outbound_intents (workspace_id, send_not_before)
  where dispatch_status = 'pending';
