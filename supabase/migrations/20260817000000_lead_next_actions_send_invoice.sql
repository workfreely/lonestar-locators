-- ============================================================================
-- Send Invoice → the canonical closing action after Get Invoice Details
-- ============================================================================
-- After the agent collects the lease/commission info (get_invoice_details), the
-- next canonical closing action is Send Invoice: email the invoice to the property
-- (reusing the Guest Card email-composer pattern), then explicitly confirm it was
-- sent. Completing it sets the durable Invoice Sent state (leads.invoice_submitted)
-- and records an immutable lead_timeline event.
--
-- One additive change: allow the new 'send_invoice' action_key (keeps every
-- existing key). send_invoice is property-scoped to the Top Pick and one-open-per-
-- lead, so it stays under the general one-open-per-(lead, action_key) index — no
-- index change needed.

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
