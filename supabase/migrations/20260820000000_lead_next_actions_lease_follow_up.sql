-- Future Lease Follow-Up — the client-retention action that closes the loop after
-- a successful lease (No Client Incentive / Free Movers → after Commission Paid;
-- Cash Rebate → after Rebate Sent). It reuses lead_next_actions entirely: a new
-- canonical action_key 'lease_follow_up', property-scoped to the leased Top Pick,
-- due ~90 days before the estimated lease end (Lease Start + Lease Term − 90 days).
--
-- One additive change: extend the action_key CHECK to allow 'lease_follow_up'
-- (keeps every existing key). It stays under the general one-open-per-(lead,
-- action_key) index — no index change, no new table, no new column.

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
      'lease_follow_up',
      'follow_up_1',
      'follow_up_2',
      'follow_up_3',
      'final_follow_up',
      'reconnect_client',
      'email_guest_card'
    )
  );
