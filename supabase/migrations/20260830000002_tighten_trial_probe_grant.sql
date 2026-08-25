-- ============================================================================
-- Account Deletion (follow-up): remove an enumeration oracle
-- ============================================================================
-- lb_trial_already_used(email, phone) was revoked from public and anon but not
-- from `authenticated`, and Supabase grants EXECUTE to authenticated by default
-- — so any signed-in user could probe whether an ARBITRARY email or phone had
-- ever started a trial. That is a membership oracle over personal data.
--
-- Only the server needs it: /api/billing/start-trial calls it under the service
-- role after authenticating the caller.
revoke all on function public.lb_trial_already_used(text, text) from authenticated;

-- lb_account_deletion_preflight KEEPS its authenticated grant on purpose: it
-- takes no arguments and resolves auth.uid() internally, so it can only ever
-- describe the caller's own account.
