-- Follow-Up Agent — HARD per-lead automation enrollment gate.
--
-- Default OFF for EVERY lead. A lead is eligible for ANY automated outbound
-- (run creation, intent creation, Beast Sync transmission) ONLY when this flag is
-- true. Bound to the canonical lead_id (the column lives on leads), never phone or
-- email. This is the server-side substrate of the gate; the deterministic engine
-- (lib/followup/gate.ts) refuses to authorize any send for a non-enrolled lead,
-- and the future dispatcher will also filter candidate runs on this column.
--
-- INERT on deploy: no dispatcher / send path exists, so this column changes no
-- behavior today. It simply guarantees the default-OFF invariant is in the data
-- from the start. Enrollment is flipped only by an explicit, workspace-verified
-- server action (never a client-trusted toggle) — added when sending is built.
alter table public.leads
  add column if not exists followup_opt_in boolean not null default false;
-- (attribution columns — enrolled_at / enrolled_by — are added with the
--  workspace-verified enrollment API in a later checkpoint.)

comment on column public.leads.followup_opt_in is
  'HARD per-lead Follow-Up Agent automation enrollment. Default false. A lead may '
  'produce automated runs/intents/sends ONLY when true. Bound to lead_id. Flipped '
  'only by an explicit workspace-verified server action.';
