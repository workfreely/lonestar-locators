-- Reverses 20261123000002_buffer_accounts_grant_hardening.sql by restoring the default grants.
--
-- You almost certainly do not want this. It puts back privileges that were an accident of Supabase's
-- CREATE TABLE defaults and that no code path uses. It is here only so the change is reversible on
-- the same terms it was applied: if some future admin screen is found to depend on a table-level
-- grant to authenticated, restoring it is one statement while the real fix is written.
--
-- The correct fix in that case is an RLS policy scoped to the owner, not a blanket grant.

begin;
grant select, insert, update, delete, truncate, references, trigger
  on public.social_buffer_accounts to anon, authenticated;
commit;
