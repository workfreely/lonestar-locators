-- ============================================================================
-- Commission Paid → the terminal closing action after Invoice Sent
-- ============================================================================
-- After the agent confirms the invoice was sent (send_invoice), the final closing
-- action is Confirm Payment: an explicit confirmation that the commission payment
-- was actually received (Locator Beast can't know this automatically). Completing
-- it sets the durable state (leads.invoice_commission_paid) and records an
-- immutable lead_timeline event. The open action displays "Confirm Payment"; the
-- completed action reads "Commission Paid".
--
-- One additive change: allow the new 'commission_paid' action_key (keeps every
-- existing key). It is property-scoped to the Top Pick and one-open-per-lead, so it
-- stays under the general one-open-per-(lead, action_key) index — no index change.

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
      'send_invoice',
      'commission_paid',
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
