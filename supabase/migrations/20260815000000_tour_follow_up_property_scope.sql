-- ============================================================================
-- Tour Follow-Up → property/tour-scoped + the new canonical start_application
-- ============================================================================
-- Two changes, both mirroring the already-approved guest-card pattern:
--   1) Allow the new canonical 'start_application' action_key ("Apply"). It is
--      created only when a Tour Follow-Up outcome is Ready to Apply, scoped to the
--      lead's Top Pick property. Completing it advances the lead to 'applied',
--      which fires the EXISTING check_application rule — no parallel workflow.
--   2) tour_follow_up becomes PER-PROPERTY (exactly like email_guest_card): a
--      client may tour 2–5 properties in one block, so each tour gets its own
--      Tour Follow-Up (due that tour + 2h). It is therefore excluded from the
--      general one-open-per-action unique index and deduped per property instead.
--
-- Tables are empty pre-launch, so there is no data backfill for existing rows.

-- 1) action_key allowlist — add 'start_application' (keeps all existing keys).
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
      'start_application',
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

-- 2a) Exclude 'tour_follow_up' from the general one-open-per-(lead, action_key)
--     index (join email_guest_card in the exclusion), so multiple open
--     tour_follow_up rows — one per toured property — can coexist for one lead.
drop index if exists public.lead_next_actions_one_open_per_action_uidx;
create unique index if not exists lead_next_actions_one_open_per_action_uidx
  on public.lead_next_actions (lead_id, action_key)
  where status = 'open'
    and action_key is not null
    and action_key not in ('email_guest_card', 'tour_follow_up');

-- 2b) One OPEN tour_follow_up PER PROPERTY (twin of the guest-card per-property
--     uniqueness). Completing The Foundry's never collides with Skyline's.
create unique index if not exists lead_next_actions_one_open_tour_follow_up_per_property_uidx
  on public.lead_next_actions (lead_id, property_id)
  where status = 'open' and action_key = 'tour_follow_up';

-- 2c) A workflow-generated tour_follow_up MUST carry a property_id (mirror the
--     email_guest_card CHECK). NOT VALID: only enforced for new/updated rows.
alter table public.lead_next_actions drop constraint if exists lead_next_actions_tour_follow_up_property_chk;
alter table public.lead_next_actions
  add constraint lead_next_actions_tour_follow_up_property_chk
  check (
    not (action_key = 'tour_follow_up' and origin = 'workflow' and property_id is null)
  ) not valid;
