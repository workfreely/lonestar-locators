-- Tour Follow-Up sequence (Tour Follow-Up → 2nd → 3rd), PER PROPERTY.
--
-- Mirrors 20260911000000_contact_follow_up_sequence.sql, which added the pre-list
-- Contact FU ladder the same way: new canonical action_key values, no data move,
-- no backfill. The difference, and the whole reason this migration is longer than
-- that one, is that the tour ladder is PROPERTY-SCOPED.
--
-- The contact ladder could rely on the generic one-open-per-(lead, action_key)
-- index. This one must not: a client tours 2-5 properties, and "one open 2nd Tour
-- Follow-Up per LEAD" would mean Altitude's second follow-up blocks Los Cielos'.
-- So both new keys join the same two places 'tour_follow_up' already sits in:
-- the exclusion list on the generic index, and the per-property unique index.
--
-- Existing 'tour_follow_up' rows are untouched and keep their meaning: they ARE
-- the first rung of the ladder, so no rename and no backfill.

-- 1) The canonical key vocabulary. Full list restated (the constraint is replaced,
--    not amended) — same shape as every prior key-adding migration.
alter table public.lead_next_actions drop constraint if exists lead_next_actions_action_key_chk;
alter table public.lead_next_actions
  add constraint lead_next_actions_action_key_chk
  check (
    action_key is null or action_key in (
      'contact_lead',
      'contacted_follow_up',
      'contact_follow_up_1',
      'contact_follow_up_2',
      'contact_follow_up_3',
      'build_list',
      'send_list',
      'setup_tour',
      'tour_follow_up',
      'tour_follow_up_2',
      'tour_follow_up_3',
      'start_application',
      'check_application',
      'confirm_lease',
      'get_invoice_details',
      'send_invoice',
      'commission_paid',
      'setup_movers',
      'send_rebate',
      'lease_follow_up',
      'follow_up_1',
      'follow_up_2',
      'follow_up_3',
      'final_follow_up',
      'reconnect_client',
      'email_guest_card'
    )
  );

-- 2) Keep the new rungs OUT of the generic one-open-per-(lead, action_key) index.
--    Without this, a lead could hold only one open 2nd Tour Follow-Up across ALL
--    properties — the exact multi-property breakage 20260815000000 removed for
--    'tour_follow_up'. Same exclusion, extended to its two successors.
drop index if exists public.lead_next_actions_one_open_per_action_uidx;
create unique index if not exists lead_next_actions_one_open_per_action_uidx
  on public.lead_next_actions (lead_id, action_key)
  where status = 'open'
    and action_key is not null
    and action_key not in ('email_guest_card', 'tour_follow_up', 'tour_follow_up_2', 'tour_follow_up_3');

-- 3) One OPEN tour follow-up per (lead, property) ACROSS THE WHOLE LADDER.
--
--    This replaces the single-key index from 20260815000000. Keying on
--    (lead_id, property_id) for ANY ladder rung is deliberately STRONGER than one
--    index per rung: it makes "an open Tour Follow-Up and an open 2nd Tour
--    Follow-Up for the same property at the same time" unrepresentable, which is
--    the duplicate-reminder case. Different properties stay independent, and a
--    COMPLETED rung is not in the index, so the next rung is free to open.
drop index if exists public.lead_next_actions_one_open_tour_follow_up_per_property_uidx;
create unique index if not exists lead_next_actions_one_open_tour_follow_up_per_property_uidx
  on public.lead_next_actions (lead_id, property_id)
  where status = 'open'
    and action_key in ('tour_follow_up', 'tour_follow_up_2', 'tour_follow_up_3');

-- 4) A workflow-generated rung MUST carry a property_id (extends the existing
--    'tour_follow_up' CHECK to its successors). NOT VALID: new/updated rows only,
--    so no existing row is re-validated.
alter table public.lead_next_actions drop constraint if exists lead_next_actions_tour_follow_up_property_chk;
alter table public.lead_next_actions
  add constraint lead_next_actions_tour_follow_up_property_chk
  check (
    not (
      action_key in ('tour_follow_up', 'tour_follow_up_2', 'tour_follow_up_3')
      and origin = 'workflow'
      and property_id is null
    )
  ) not valid;
