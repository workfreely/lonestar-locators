-- Beast Milestones — per-account record of which achievements have been
-- unlocked, so each celebration fires exactly once per account, ever.
-- Append-only by design: rows are inserted when a milestone is earned and
-- never updated or deleted.

create table if not exists public.beast_milestones (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  milestone_key text not null,
  unlocked_at   timestamptz not null default now(),
  metadata      jsonb not null default '{}'::jsonb,
  -- One row per milestone per account — makes the unlock idempotent (the app
  -- upserts with ignoreDuplicates on this constraint).
  unique (user_id, milestone_key)
);

create index if not exists beast_milestones_user_idx on public.beast_milestones (user_id);

alter table public.beast_milestones enable row level security;

-- Each account sees and writes only its own milestones. No update/delete
-- policies: unlocks are permanent history.
create policy "beast_milestones_select_own"
  on public.beast_milestones for select
  using (auth.uid() = user_id);

create policy "beast_milestones_insert_own"
  on public.beast_milestones for insert
  with check (auth.uid() = user_id);
