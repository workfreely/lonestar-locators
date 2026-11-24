-- 20261123000002_buffer_accounts_grant_hardening.sql
--
-- APPROVED AND APPLIED 23 Nov 2026. Hardening only: no schema, no data, no routing.
--
-- WHY THIS EXISTS
-- 20261122000000_buffer_publish_route.sql created social_buffer_accounts and its comment calls the
-- table service-role only. That was true in effect but not in grants. CREATE TABLE in this project
-- inherits Supabase's default privileges, so anon and authenticated were each left holding the full
-- set — SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER — on a table that points at a
-- Vault secret.
--
-- Nothing was exposed by that. RLS is enabled with zero policies, and neither role has BYPASSRLS, so
-- every one of those privileges resolved to zero rows; the measured anon SELECT returned 0 rows, and
-- vault.decrypted_secrets is not reachable over REST at all. The exposure was CONDITIONAL: the day
-- someone adds a permissive policy for an admin screen, those grants are already in place and the
-- key_secret_id pointer becomes readable in the same commit. A policy is an intentional act; these
-- grants were an accident of defaults. Removing them means a future policy author has to grant read
-- access deliberately rather than inherit it.
--
-- WHAT STILL WORKS AFTERWARDS, AND WHY
-- No application code selects from this table — not once, in any route, component or script. The
-- only readers are sa_get_buffer_destination and sa_set_buffer_api_key, both SECURITY DEFINER owned
-- by postgres. A definer function executes with its OWNER's privileges, so the caller's table grants
-- are not consulted; postgres keeps its own direct grants and is the table owner besides. The Buffer
-- worker holds the service role, calls only that RPC, and never names the table. So the publishing
-- route is untouched by this revoke, and service_role's grants are left in place regardless, since
-- the statement names anon and authenticated and no one else.
--
-- service_role is not a member of anon or authenticated (membership runs the other way: authenticator,
-- postgres and supabase_realtime_admin are members of all three), so this cannot strip it by descent.

begin;

revoke all on public.social_buffer_accounts from anon, authenticated;

-- Proof, inside the transaction: if either role kept anything, or service_role lost anything, this
-- rolls back rather than reporting a success it cannot stand behind.
do $$
declare
  v_leftover int;
  v_service  int;
begin
  select count(*) into v_leftover
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'social_buffer_accounts'
     and grantee in ('anon', 'authenticated');
  if v_leftover <> 0 then
    raise exception 'anon/authenticated still hold % privileges on social_buffer_accounts. Rolling back.', v_leftover;
  end if;

  select count(*) into v_service
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'social_buffer_accounts'
     and grantee = 'service_role';
  if v_service < 7 then
    raise exception 'service_role holds only % privileges on social_buffer_accounts, expected 7. Rolling back.', v_service;
  end if;
end $$;

commit;
