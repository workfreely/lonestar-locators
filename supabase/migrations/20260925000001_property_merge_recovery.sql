-- Property Catalog — PRE-MERGE RECOVERY infrastructure.
--
-- Schema ONLY. Creates the durable snapshot store + the merge-run/change-log +
-- a read-only rollback PREVIEW. No property is imported/merged/enriched here, and
-- this migration does NOT populate a snapshot (the one-time snapshot of the 4,202
-- prod rows is created by supabase/recovery/pre_property_catalog_merge_2026_09_25.sql
-- so it never runs against a fresh/other environment).
--
-- Rollback philosophy: a merge is NEVER an anonymous bulk mutation. Every future
-- mutation belongs to a merge_run_id and is logged per-field (old→new), so a single
-- run can be reversed WITHOUT a full-table restore that would clobber unrelated CRM
-- activity. All new tables are service-role only (RLS on, no policies).

-- ── 1. Checkpoint metadata ──────────────────────────────────────────────────
create table if not exists public.property_catalog_snapshots (
  checkpoint_id     text primary key,
  created_at        timestamptz not null default now(),
  environment       text,
  git_commit        text,
  catalog_row_count integer,
  related_counts    jsonb not null default '{}'::jsonb, -- {property_enrichment_events: N, ...}
  image_state_counts jsonb not null default '{}'::jsonb, -- {keep, missing, change_requested}
  image_url_md5     text,   -- integrity hash of all image URLs (order by place_id)
  commission_md5    text,   -- integrity hash of send/escort/bonus (order by place_id)
  notes             text
);
comment on table public.property_catalog_snapshots is
  'One row per recovery checkpoint. The frozen per-row copy lives in property_catalog_snapshot_rows.';

-- ── 2. Full frozen per-row copy (durable, queryable, targeted restore source) ─
create table if not exists public.property_catalog_snapshot_rows (
  checkpoint_id text not null references public.property_catalog_snapshots(checkpoint_id) on delete cascade,
  place_id      text not null,
  row_data      jsonb not null, -- the ENTIRE property_catalog row as of the checkpoint
  primary key (checkpoint_id, place_id)
);
comment on table public.property_catalog_snapshot_rows is
  'Exact pre-merge copy of every property_catalog row (all columns as jsonb). Restore source of record for UPDATED-field rollback.';

-- ── 3. Merge runs (durable state for Start/Pause/Resume/Stop) ────────────────
create table if not exists public.property_merge_runs (
  merge_run_id   uuid primary key default gen_random_uuid(),
  checkpoint_id  text references public.property_catalog_snapshots(checkpoint_id), -- pre-merge baseline
  operation_type text not null default 'property_merge',  -- future job types reuse this table
  status         text not null default 'queued'
                   check (status in ('queued','running','paused','stopped','completed','failed')),
  source_label   text,        -- the import dataset/record this run applied
  totals         jsonb not null default '{}'::jsonb, -- {queued,processed,inserted,updated,skipped,conflicts,failed}
  last_item      text,        -- last COMPLETED place_id — the resume cursor (durable, not in Mac memory)
  error          text,
  started_at     timestamptz,
  updated_at     timestamptz not null default now(),
  completed_at   timestamptz,
  created_at     timestamptz not null default now()
);
comment on table public.property_merge_runs is
  'Durable per-run merge state. Pause/stop happen at a property boundary; resume continues after last_item. Survives a Mac Mini restart because state lives here, not in process memory.';
comment on column public.property_merge_runs.last_item is
  'Resume cursor: the last fully-processed place_id. A resumed run must skip everything at/through this without reprocessing or duplicating.';

-- ── 4. Per-field change log (reversibility) ─────────────────────────────────
create table if not exists public.property_merge_changes (
  id             uuid primary key default gen_random_uuid(),
  merge_run_id   uuid not null references public.property_merge_runs(merge_run_id) on delete cascade,
  place_id       text not null,
  action         text not null check (action in ('inserted','updated','skipped','conflict','failed')),
  field_name     text,        -- null for a row-level insert; set for an updated field
  old_value      text,        -- exact pre-merge value (UPDATED) — the restore target
  new_value      text,        -- value written by the merge
  source_type    text,
  source_reference text,
  reason         text,
  created_at     timestamptz not null default now()
);
comment on table public.property_merge_changes is
  'Every mutation a merge run made, per field: inserted/updated/skipped/conflict/failed with old→new. The reversal source of truth.';
create index if not exists property_merge_changes_run_idx on public.property_merge_changes (merge_run_id);
create index if not exists property_merge_changes_place_idx on public.property_merge_changes (place_id);

alter table public.property_catalog_snapshots      enable row level security;
alter table public.property_catalog_snapshot_rows  enable row level security;
alter table public.property_merge_runs             enable row level security;
alter table public.property_merge_changes          enable row level security;

-- ── 5. Read-only ROLLBACK PREVIEW (dry-run) ─────────────────────────────────
-- Reports what a rollback of ONE merge run WOULD do, without mutating anything, and
-- surfaces CONFLICT where the value changed AGAIN after the merge (never clobbers
-- newer data). Verdicts: WOULD_RESTORE | WOULD_DELETE | WOULD_SKIP | CONFLICT.
create or replace function public.property_merge_rollback_preview(p_merge_run_id uuid)
returns table (
  place_id      text,
  field_name    text,
  action        text,
  verdict       text,
  current_value text,
  restore_to    text,
  note          text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with chg as (
    select * from public.property_merge_changes where merge_run_id = p_merge_run_id
  )
  select
    c.place_id,
    c.field_name,
    c.action,
    case
      when c.action = 'updated' then
        case
          when cur.val is not distinct from c.new_value then 'WOULD_RESTORE'
          else 'CONFLICT'                       -- value changed again after the merge
        end
      when c.action = 'inserted' then
        case
          when dep.cnt > 0 then 'CONFLICT'      -- other production data now depends on it
          when cur.exists_now then 'WOULD_DELETE'
          else 'WOULD_SKIP'                     -- already gone
        end
      else 'WOULD_SKIP'                          -- skipped/conflict/failed made no mutation
    end                                             as verdict,
    cur.val                                         as current_value,
    case when c.action = 'updated' then c.old_value else null end as restore_to,
    case
      when c.action = 'updated' and cur.val is distinct from c.new_value
        then 'changed after merge — resolve manually'
      when c.action = 'inserted' and dep.cnt > 0
        then 'referenced by later production data — do not delete'
      else null
    end                                             as note
  from chg c
  left join lateral (
    select
      (to_jsonb(pc) ->> c.field_name) as val,
      (pc.place_id is not null)       as exists_now
    from public.property_catalog pc
    where pc.place_id = c.place_id
  ) cur on true
  left join lateral (
    select count(*) as cnt
    from public.client_recommendation_share_items s
    where s.place_id = c.place_id
  ) dep on true;
$$;

revoke all on function public.property_merge_rollback_preview(uuid) from public;
-- Grant to service_role only where that role exists (Supabase); portable to plain PG.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.property_merge_rollback_preview(uuid) to service_role';
  end if;
end $$;

comment on function public.property_merge_rollback_preview(uuid) is
  'Dry-run rollback preview for one merge run. Read-only. WOULD_RESTORE (updated field, unchanged since merge), WOULD_DELETE (inserted, no dependents), WOULD_SKIP (no mutation / already reverted), CONFLICT (changed again, or inserted row now depended upon). Never mutates.';
