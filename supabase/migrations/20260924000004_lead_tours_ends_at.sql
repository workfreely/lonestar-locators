-- lead_tours.ends_at — canonical tour END time (Option B).
--
-- Keeps lead_tours as the SINGLE canonical tour store (no second table). Post Tour
-- eligibility = MAX(ends_at for the client's tour session) + 2h. When a caller does
-- not provide an explicit end, it defaults to scheduled_at + 60 minutes via the
-- trigger below, so every row always has a usable end.

alter table public.lead_tours
  add column if not exists ends_at timestamptz;

comment on column public.lead_tours.ends_at is
  'Tour END time. Defaults to scheduled_at + 60 min when not explicitly set (trigger). Post Tour follow-up is anchored to MAX(ends_at) of the day''s tours + 2h.';

-- Default ends_at to start + 60 min whenever it is left null (insert OR update).
create or replace function public.lead_tours_default_ends_at()
returns trigger
language plpgsql
as $$
begin
  if new.ends_at is null then
    new.ends_at := new.scheduled_at + interval '60 minutes';
  end if;
  return new;
end;
$$;

drop trigger if exists lead_tours_set_ends_at on public.lead_tours;
create trigger lead_tours_set_ends_at
  before insert or update on public.lead_tours
  for each row execute function public.lead_tours_default_ends_at();

-- Backfill existing rows to the same 60-minute default.
update public.lead_tours
  set ends_at = scheduled_at + interval '60 minutes'
  where ends_at is null;

-- Session lookup: last confirmed tour end for a lead (Post Tour anchor).
create index if not exists lead_tours_lead_ends_idx
  on public.lead_tours (lead_id, ends_at)
  where status = 'scheduled';
