-- Beast Social — RECURRING POSTS. A recurring RULE (source + cadence + placement + state) is kept
-- separate from the POST INSTANCES it generates (each occurrence is a normal social_posts row,
-- visible/editable/skippable in Queue+Calendar, frozen once published). Additive + owner-scoped via
-- is_platform_admin(), exactly like social_posts. NO publishing here. The daily replenish cron is
-- NOT enabled in this checkpoint; occurrences are generated on rule save (rolling horizon).
create table if not exists public.social_recurring_rules (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null,
  source_content_id uuid not null references public.social_content(id) on delete cascade,
  platform          text not null default 'instagram',
  interval_days     int  not null check (interval_days between 1 and 365),
  end_mode          text not null default 'until_stopped' check (end_mode in ('after_days','on_date','until_stopped')),
  end_at            timestamptz,
  placement_pref    text not null default 'any' check (placement_pref in ('any','morning','midday','evening')),
  posts_per_day     int  not null default 2 check (posts_per_day between 1 and 3),
  state             text not null default 'active' check (state in ('active','paused','stopped')),
  post_type         text not null default 'reel',
  audio_choice      text not null default 'original',
  last_generated_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists social_recurring_rules_owner_idx on public.social_recurring_rules (owner_user_id, state);

alter table public.social_recurring_rules enable row level security;
drop policy if exists "platform admin owns social_recurring_rules" on public.social_recurring_rules;
create policy "platform admin owns social_recurring_rules" on public.social_recurring_rules
  for all to authenticated
  using (public.is_platform_admin() and owner_user_id = auth.uid())
  with check (public.is_platform_admin() and owner_user_id = auth.uid());

-- Occurrence linkage on the instance. recurrence_index is the stable occurrence number; the partial
-- unique index makes generation IDEMPOTENT (a rerun can never duplicate an occurrence).
alter table public.social_posts add column if not exists recurring_rule_id uuid references public.social_recurring_rules(id) on delete set null;
alter table public.social_posts add column if not exists recurrence_slot text;
alter table public.social_posts add column if not exists recurrence_index int;
create unique index if not exists social_posts_recurrence_uidx on public.social_posts (recurring_rule_id, recurrence_index) where recurring_rule_id is not null;
