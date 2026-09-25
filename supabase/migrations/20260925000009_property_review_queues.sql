-- Post-canary review queues (ADDITIVE, non-destructive, service-role).
--
-- (1) property_conflict_review: every surfaced write conflict, classified, with a safe
--     disposition. Auto-resolvable classes (stale Google-owned refresh, malformed-value
--     replacement) are recorded as resolved; legitimate disagreements stay open for a
--     human. (2) property_qualification_review: the ambiguous/unmatched qualification
--     cells with candidate catalog matches + confidence; identity is never guessed.

create table if not exists public.property_conflict_review (
  id                   bigint generated always as identity primary key,
  place_id             text,
  field_name           text not null,
  existing_value       text,
  incoming_value       text,
  incoming_source_type text,
  classification       text not null check (classification in (
                         'stale_google_owned','normalization_diff','malformed_existing',
                         'legitimate_disagreement','freshness_update','needs_human')),
  disposition          text not null default 'open' check (disposition in (
                         'auto_refreshed','auto_replaced','preserved_pending_review','resolved','dismissed')),
  resolved_value       text,
  note                 text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists property_conflict_review_disp_idx on public.property_conflict_review (disposition);
create index if not exists property_conflict_review_place_idx on public.property_conflict_review (place_id);
drop trigger if exists property_conflict_review_touch on public.property_conflict_review;
create trigger property_conflict_review_touch before update on public.property_conflict_review
  for each row execute function public.set_updated_at();
alter table public.property_conflict_review enable row level security;

create table if not exists public.property_qualification_review (
  id                   bigint generated always as identity primary key,
  source_property_name text not null,
  market               text,
  criterion            text,                 -- source column / criterion label
  original_value       text,                 -- verbatim caveat/value (never flattened)
  source_file          text,
  candidate_place_id   text,                 -- best catalog candidate (may be null)
  candidate_name       text,
  match_confidence     text check (match_confidence in ('exact','strong','weak','none')),
  match_evidence       text,
  status               text not null default 'pending' check (status in ('pending','matched','excluded')),
  matched_place_id     text,
  matched_at           timestamptz,
  matched_by           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists property_qualification_review_status_idx on public.property_qualification_review (status);
create index if not exists property_qualification_review_market_idx on public.property_qualification_review (market);
drop trigger if exists property_qualification_review_touch on public.property_qualification_review;
create trigger property_qualification_review_touch before update on public.property_qualification_review
  for each row execute function public.set_updated_at();
alter table public.property_qualification_review enable row level security;
