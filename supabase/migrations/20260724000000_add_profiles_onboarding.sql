-- Locator Beast auth/onboarding foundation. Additive only — does not touch
-- leads or any existing CRM table. One profile row per auth.users row,
-- created automatically via trigger, used to drive the 7-step onboarding
-- wizard and to gate /admin (see app/admin/layout.tsx).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  -- Step 2: Business Information
  full_name text,
  business_name text,
  brokerage text,
  phone_number text,
  service_areas text[] not null default '{}',

  -- Step 3: Branding
  profile_photo_url text,
  business_logo_url text,
  brand_color text,

  -- Step 4 / Step 5 — UI-reflected connection state only. Real OAuth token
  -- storage and phone-provider wiring are a later milestone; these booleans
  -- exist so the onboarding UI and future integration work share one flag
  -- without a schema change.
  google_connected boolean not null default false,
  phone_sync_connected boolean not null default false,

  -- Step 6 — status only. Actual CSV parsing / lead insertion is deferred
  -- (the shared `leads` table has no per-tenant scoping yet, so importing
  -- into it now would mix a trial signup's data with real production leads).
  leads_import_status text check (leads_import_status in ('imported', 'skipped')),

  onboarding_step smallint not null default 1,
  onboarding_completed boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create a blank profile whenever a new auth user is created, so the
-- onboarding page never has to handle a "no profile row yet" race.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: every account that already exists today is the existing
-- business's own team, not a new trial signup — mark them as already
-- onboarded so nothing changes about their login experience.
insert into public.profiles (id, onboarding_completed, onboarding_step)
select id, true, 7 from auth.users
on conflict (id) do nothing;

-- Storage for Step 3 uploads (profile photo, business logo), one folder per
-- user keyed by auth.uid() so RLS can scope access without a join.
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

create policy "Users can upload their own branding assets"
  on storage.objects for insert
  with check (bucket_id = 'branding' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can update their own branding assets"
  on storage.objects for update
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Branding assets are publicly readable"
  on storage.objects for select
  using (bucket_id = 'branding');
