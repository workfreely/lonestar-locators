-- Milestone A.1 — align the schema with producer canonicalization.
--
-- Corrective + additive, applied BEFORE any rows exist (LB prod workflow tables
-- confirmed empty; re-verified immediately before push). No workflow-mutation
-- primitive; frozen extension shell untouched.
--
-- Three changes:
--   1) origin domain → producers write 'workflow'; custom Add Task writes 'custom'.
--   2) action_key set → add 'contacted_follow_up' (the contacted-stage chase),
--      kept DISTINCT from the post-list-sent follow_up_1/2/3 + final_follow_up.
--   3) one-open-per-action uniqueness → EXCLUDE email_guest_card (intentionally
--      one-open PER PROPERTY, deduped in code by action_key + property_id).

-- 1) origin domain.
alter table public.lead_next_actions drop constraint if exists lead_next_actions_origin_chk;
-- A bare insert (the CRM "Add Task" path) is a manual/custom task by default.
alter table public.lead_next_actions alter column origin set default 'custom';
alter table public.lead_next_actions
  add constraint lead_next_actions_origin_chk
  check (origin in ('workflow', 'custom', 'system'));
comment on column public.lead_next_actions.origin is
  'Row source: ''workflow'' (engine-emitted canonical action), ''custom'' (user Add Task), ''system'' (backfill/system).';

-- 2) action_key set (+ contacted_follow_up).
alter table public.lead_next_actions drop constraint if exists lead_next_actions_action_key_chk;
alter table public.lead_next_actions
  add constraint lead_next_actions_action_key_chk
  check (
    action_key is null or action_key in (
      'contact_lead',
      'contacted_follow_up',
      'build_list',
      'send_list',
      'setup_tour',
      'tour_follow_up',
      'check_application',
      'confirm_lease',
      'get_invoice_details',
      'setup_movers',
      'send_rebate',
      'follow_up_1',
      'follow_up_2',
      'follow_up_3',
      'final_follow_up',
      'reconnect_client',
      'email_guest_card'
    )
  );

-- 3) one open row per (lead_id, action_key), EXCEPT email_guest_card (per-property).
-- This keeps "at most one open contacted_follow_up" and "at most one open
-- follow_up_1" independent — a COMPLETED contacted_follow_up (status<>'open') is
-- not in the index, so a later OPEN follow_up_1 never collides with it.
drop index if exists public.lead_next_actions_one_open_per_action_uidx;
create unique index if not exists lead_next_actions_one_open_per_action_uidx
  on public.lead_next_actions (lead_id, action_key)
  where status = 'open' and action_key is not null and action_key <> 'email_guest_card';
