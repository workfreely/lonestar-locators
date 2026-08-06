-- Stub the FK dependencies + a service_role, then run the REAL auth migration.
create schema if not exists auth;
create table auth.users     (id uuid primary key default gen_random_uuid());
create table public.workspaces (id uuid primary key default gen_random_uuid());
create table public.profiles   (id uuid primary key default gen_random_uuid());
do $$ begin
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
\i :migration
