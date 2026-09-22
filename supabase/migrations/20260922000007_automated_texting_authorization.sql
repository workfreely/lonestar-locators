-- Automated Texting — account authorization + per-lead enrollment write-lock.
-- Configuration + authorization ONLY. NOTHING here sends a message, creates a
-- run/intent, or runs a dispatcher — entirely inert. Idempotent (safe to re-run).

-- ── Account-level authorization (NON-self-writable) ─────────────────────────
-- Deliberately a SEPARATE table, NOT a profiles column: profiles has an
-- unrestricted self-UPDATE policy (auth.uid() = id), so a boolean there would let
-- any locator self-authorize. Modeled on platform_admins: RLS enabled, SELECT-own
-- only, and NO write policy → a row can be granted ONLY via the service role / the
-- admin route. Authorization is keyed to the canonical auth.users.id, never a
-- phone number and never an email. Granting another account later is a single
-- INSERT of their auth.users.id — no schema/API/UI change.
create table if not exists public.automated_texting_accounts (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid,
  note       text
);
alter table public.automated_texting_accounts enable row level security;

drop policy if exists "read own automated_texting authorization" on public.automated_texting_accounts;
create policy "read own automated_texting authorization"
  on public.automated_texting_accounts for select
  using (user_id = auth.uid());

-- Canonical authorization check, reused by the enrollment API (server) and the
-- (future) send gate. SECURITY DEFINER so it reads the RLS-protected table for any
-- passed user id; STABLE + a fixed search_path. Mirrors is_platform_admin().
create or replace function public.is_automated_texting_authorized(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.automated_texting_accounts a where a.user_id = p_user_id
  );
$$;
grant execute on function public.is_automated_texting_authorized(uuid) to authenticated;

-- ── Per-lead enrollment: lock leads.followup_opt_in to server-only writes ────
-- leads.followup_opt_in already exists (default false). The client roles hold
-- TABLE-level UPDATE on leads (Supabase default) which OVERRIDES a column-level
-- revoke — so a column revoke alone does NOT block a direct PostgREST write of
-- this column. The authoritative lock is a BEFORE UPDATE trigger that rejects any
-- CHANGE to followup_opt_in unless the caller is the service role (the enrollment
-- API route). Other-column updates and the default-false insert are unaffected;
-- an UPDATE that leaves the column unchanged is always allowed.
--
-- The column-level revoke is kept as defense-in-depth (it becomes effective if the
-- table-level grant is ever tightened) but is NOT the enforcement mechanism.
revoke update(followup_opt_in) on public.leads from authenticated, anon;

create or replace function public.enforce_followup_opt_in_server_only()
returns trigger
language plpgsql
as $$
begin
  -- SECURITY INVOKER (default): current_user is the role executing the UPDATE —
  -- 'authenticated'/'anon' for a browser/PostgREST client, 'service_role' for the
  -- server. Block a client from changing enrollment; allow the server + superusers.
  if new.followup_opt_in is distinct from old.followup_opt_in
     and current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'followup_opt_in may only be changed by the server (service role)'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_followup_opt_in_server_only on public.leads;
create trigger trg_followup_opt_in_server_only
  before update on public.leads
  for each row execute function public.enforce_followup_opt_in_server_only();
