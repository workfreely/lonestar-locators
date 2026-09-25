-- Property source / research lineage (CP3 — Source Visibility).
--
-- A property can appear in MULTIPLE research streams (e.g. a Townhome/Loft sweep
-- AND a general inventory pull). We do NOT collapse those into one source label:
-- each (place_id, research_category, source_file, source_row) is its own row, so a
-- property can carry several categories at once. This explains WHY a property became
-- an enrichment priority. Additive, service-role only; touches no property values.

create table if not exists public.property_source_lineage (
  id                uuid primary key default gen_random_uuid(),
  place_id          text not null,                 -- resolved Google Place ID (may also be a review candidate)
  research_category text not null,                 -- canonical stream: high_rise_research | townhome_research | loft_research | rental_home_research | rental_tower_research | condo_private_rental_research | penthouse_research | furnished_research | general_apartment_inventory | google_discovery | manual_addition | other_curated
  inventory_type    text,                          -- raw Inventory Type from the source workbook (fidelity)
  source_file       text,                          -- underlying research workbook (not the aggregation master)
  source_sheet      text,
  source_row        text,                          -- original row in the underlying workbook
  aggregated_in     text,                          -- the Audit Master workbook this arrived through
  market            text,
  discovered_at     timestamptz not null default now(),
  note              text,
  created_at        timestamptz not null default now(),
  unique (place_id, research_category, source_file, source_row)
);

comment on table public.property_source_lineage is
  'Multi-value research/source lineage per Place ID. One row per (place_id, research_category, source_file, source_row); a property may carry several categories. Explains enrichment priority. Never collapsed to a single label.';

create index if not exists property_source_lineage_place_idx    on public.property_source_lineage (place_id);
create index if not exists property_source_lineage_category_idx  on public.property_source_lineage (research_category);
create index if not exists property_source_lineage_market_idx    on public.property_source_lineage (market);

alter table public.property_source_lineage enable row level security;

-- Convenience: categories aggregated per place_id (array), for list/detail rendering.
create or replace view public.property_source_categories as
  select place_id,
         array_agg(distinct research_category order by research_category) as research_categories,
         array_agg(distinct inventory_type)      filter (where inventory_type is not null) as inventory_types,
         count(*)                                as lineage_rows,
         min(discovered_at)                      as first_discovered_at
    from public.property_source_lineage
   group by place_id;

comment on view public.property_source_categories is
  'Per-Place-ID rollup of research categories / inventory types (multi-value) for the review + catalog UIs.';
