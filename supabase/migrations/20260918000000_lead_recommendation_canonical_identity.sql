-- Duplicate-recommendation fix — a canonical per-lead property identity enforced at
-- the database level, so CRM, Beast Companion, future entry points, and snapshots are
-- all protected by ONE rule (never UI-only dedupe).
--
-- Identity reuses the EXISTING place-id pipeline (lib/propertyExplorer/types.ts
-- placeIdFromPropertyUrl → regex `[?&]q=place_id:([^&]+)`; property_catalog is keyed by
-- the same Google place_id). When a place_id can be resolved from property_url the key
-- is `pid:<place_id>`; otherwise it falls back to the normalized property_url
-- (`url:<lower(btrim(property_url))>`). The fallback is deterministic and is NOT
-- property name or display address.
--
-- APPLIED TO PRODUCTION (project onwrrajmklxtnabekzcy) out-of-band via the Supabase
-- Management API on 2026-09-18, statement by statement with verification, because the
-- remote migration history is drifted and `supabase db push` would have (re)applied
-- unrelated migrations. This file is the version-controlled record of that schema
-- change; the one-time production data cleanup (removing the single existing duplicate
-- and repairing one UNSENT snapshot) was performed as targeted statements and is NOT
-- part of this reproducible migration.

-- 1) Canonical identity — a STORED generated column, so the database derives it for
--    every write path automatically (no app-side normalization to forget).
alter table public.lead_recommendations
  add column if not exists canonical_property_key text
  generated always as (
    coalesce(
      'pid:' || substring(property_url from '[?&]q=place_id:([^&]+)'),
      'url:' || lower(btrim(property_url))
    )
  ) stored;

-- 2) De-duplicate existing rows before the unique index (keep the earliest per group).
--    A no-op on a clean database; required so the index can be created where dupes exist.
delete from public.lead_recommendations a
using public.lead_recommendations b
where a.lead_id = b.lead_id
  and a.canonical_property_key = b.canonical_property_key
  and a.id > b.id;

-- 3) The authoritative guard: one recommendation per (lead, canonical identity).
create unique index if not exists lead_recommendations_lead_canonical_uidx
  on public.lead_recommendations (lead_id, canonical_property_key);
