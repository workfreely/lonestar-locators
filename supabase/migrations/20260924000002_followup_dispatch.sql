-- Follow-Up Agent — OUTBOUND DISPATCH bridge (server → Beast Sync gateway).
--
-- Additive only. Reuses the existing lead_followup_runs (state machine) and
-- followup_outbound_intents (work queue) unchanged; this adds the few timestamp
-- columns the dispatcher/claim/ack loop needs. No transport, no provider.

-- Enrollment anchor: when a lead is opted into automated texting, stamp the
-- moment so the dispatcher can bound New-Lead run creation to freshly-created
-- leads (never back-fill Text 1 for an old lead enrolled long after creation).
alter table public.leads
  add column if not exists followup_enrolled_at timestamptz;

comment on column public.leads.followup_enrolled_at is
  'When automated-texting enrollment (followup_opt_in) was last turned ON. Set by the enrollment endpoint; cleared on opt-out. Used only to bound New-Lead run creation.';

-- Outbound intent lifecycle timestamps for the Beast Sync gateway handshake.
-- dispatch_status is free text (no CHECK) and now also takes:
--   pending    — created by the dispatcher, awaiting a device claim
--   claimed    — handed to a specific gateway_device_id (claimed_at set)
--   sent       — Beast Sync confirmed submission through Apple Messages (sent_at)
--   failed     — Beast Sync reported a send failure (error set)
--   superseded — canceled at claim-time revalidation (conversation/stage/etc.)
alter table public.followup_outbound_intents
  add column if not exists claimed_at   timestamptz,
  add column if not exists local_sent_at timestamptz;

-- One active outbound intent per (run, step): prevents any double-enqueue and any
-- double-send across dispatcher retries / duplicate cron ticks / reconnect.
create unique index if not exists followup_intents_active_step_uidx
  on public.followup_outbound_intents (run_id, step_key)
  where dispatch_status in ('pending', 'claimed', 'sent');
