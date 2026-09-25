-- Durable Property Intelligence job architecture (CP4 — "build for it, don't schedule").
--
-- Supports the future always-on Mac Mini operator: Run Now / Pause / Resume / Stop,
-- crash-restart recovery, per-property durable state, idempotency, progress, and
-- activity + error history. Resume authority is the per-item state table, NOT
-- last_item (last_item is display only). Additive, service-role only.

create table if not exists public.property_enrichment_jobs (
  id            uuid primary key default gen_random_uuid(),
  job_type      text not null check (job_type in (
                  'property_enrichment','new_property_discovery','specials_refresh',
                  'google_rating_refresh','missing_image_fill','change_requested_image_replacement',
                  'data_health_audit')),
  status        text not null default 'queued' check (status in (
                  'queued','running','paused','stopping','stopped','completed','failed')),
  params        jsonb not null default '{}'::jsonb,   -- e.g. {markets:[...], placeIds:[...], limit:20}
  dry_run       boolean not null default false,
  -- progress + tallies
  total         integer not null default 0,
  processed     integer not null default 0,
  added         integer not null default 0,
  updated       integer not null default 0,
  skipped       integer not null default 0,
  conflicts     integer not null default 0,
  failed        integer not null default 0,
  -- display / status line (never the sole resume authority)
  last_item     text,
  last_item_at  timestamptz,
  message       text,
  error         text,
  requested_by  text,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  updated_at    timestamptz not null default now(),
  finished_at   timestamptz
);

comment on table public.property_enrichment_jobs is
  'Durable Property Intelligence jobs (run/pause/resume/stop, crash recovery, progress, tallies). Resume authority is property_enrichment_job_items, not last_item.';

create index if not exists property_enrichment_jobs_status_idx on public.property_enrichment_jobs (status, created_at desc);
create index if not exists property_enrichment_jobs_type_idx   on public.property_enrichment_jobs (job_type, created_at desc);

drop trigger if exists property_enrichment_jobs_touch on public.property_enrichment_jobs;
create trigger property_enrichment_jobs_touch before update on public.property_enrichment_jobs
  for each row execute function public.set_updated_at();

-- Per-property durable state = the authoritative resume/idempotency ledger.
create table if not exists public.property_enrichment_job_items (
  job_id          uuid not null references public.property_enrichment_jobs(id) on delete cascade,
  place_id        text not null,
  seq             integer,                          -- deterministic processing order
  status          text not null default 'pending' check (status in ('pending','in_progress','done','failed','skipped')),
  attempts        integer not null default 0,
  fields_examined integer not null default 0,
  fields_written  integer not null default 0,
  attrs_written   integer not null default 0,
  conflicts       integer not null default 0,
  result          jsonb,                            -- per-item detail (written fields, unknowns, floorplan-specific, sources, keywords, special, failures)
  error           text,
  started_at      timestamptz,
  finished_at     timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (job_id, place_id)
);

comment on table public.property_enrichment_job_items is
  'Per-property durable job state (idempotency + crash recovery). On resume, pending/in_progress are re-run; done/skipped are not. Writes are idempotent so re-running an interrupted item is safe.';

create index if not exists property_enrichment_job_items_status_idx on public.property_enrichment_job_items (job_id, status);

drop trigger if exists property_enrichment_job_items_touch on public.property_enrichment_job_items;
create trigger property_enrichment_job_items_touch before update on public.property_enrichment_job_items
  for each row execute function public.set_updated_at();

-- Activity + error history (dashboard "Recent activity / errors").
create table if not exists public.property_enrichment_job_activity (
  id         bigint generated always as identity primary key,
  job_id     uuid references public.property_enrichment_jobs(id) on delete cascade,
  place_id   text,
  level      text not null default 'info' check (level in ('info','warn','error')),
  event      text not null,
  detail     jsonb,
  created_at timestamptz not null default now()
);

create index if not exists property_enrichment_job_activity_job_idx on public.property_enrichment_job_activity (job_id, created_at desc);
create index if not exists property_enrichment_job_activity_recent_idx on public.property_enrichment_job_activity (created_at desc);

alter table public.property_enrichment_jobs         enable row level security;
alter table public.property_enrichment_job_items    enable row level security;
alter table public.property_enrichment_job_activity enable row level security;
