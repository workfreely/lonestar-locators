-- Pre-list Contact Follow-Up sequence (Contact FU1 → FU2 → FU3).
--
-- Adds three new canonical action_key values for the pre-list contact chase, a
-- sequence DISTINCT from the post-List-Sent follow_up_1/2/3 + final_follow_up
-- ladder. Only the CHECK constraint needs updating — the existing one-open-per-
-- (lead_id, action_key) unique index already covers the new keys generically, so
-- "one open Contact FU per level" is enforced without any index change (the app
-- additionally guards one open contact FU per lead across all three levels).
--
-- contacted_follow_up is retained in the allow-list for history: it is the retired
-- single-step predecessor and is no longer produced (recordPendingOutreach now
-- creates contact_follow_up_1). No data backfill is needed (0 such rows exist).

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
