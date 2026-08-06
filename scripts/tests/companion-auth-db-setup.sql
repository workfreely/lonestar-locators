-- Stub the FK dependencies + roles, then run the REAL auth migrations in order.
create schema if not exists auth;
create table auth.users       (id uuid primary key default gen_random_uuid());
create table public.workspaces (id uuid primary key default gen_random_uuid());
create table public.profiles   (id uuid primary key default gen_random_uuid());
do $$ begin
  if not exists (select from pg_roles where rolname = 'service_role')  then create role service_role; end if;
  if not exists (select from pg_roles where rolname = 'anon')          then create role anon; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
\i :migration3
\i :migration4
