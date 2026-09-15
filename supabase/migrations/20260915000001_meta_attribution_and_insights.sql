-- Meta Ads Phase 2A — Smart Lead Form attribution (stable Meta IDs on leads) + local read-only ad
-- performance cache. NO Meta Lead Ads, NO leadgen webhook, NO leads_retrieval — the Smart Lead Form
-- stays the single lead intake. These are ADDITIVE columns/tables only.

-- 1) Stable Meta campaign/ad identifiers on the canonical lead. IDs are canonical (survive renames);
--    *_name are display-only snapshots. Captured from the ad's destination URL params on submit.
alter table public.leads add column if not exists meta_campaign_id   text;
alter table public.leads add column if not exists meta_adset_id      text;
alter table public.leads add column if not exists meta_ad_id         text;
alter table public.leads add column if not exists meta_campaign_name text;
alter table public.leads add column if not exists meta_adset_name    text;
alter table public.leads add column if not exists meta_ad_name       text;
create index if not exists idx_leads_meta_campaign on public.leads(meta_campaign_id) where meta_campaign_id is not null;
create index if not exists idx_leads_meta_ad       on public.leads(meta_ad_id) where meta_ad_id is not null;

-- 2) Local ad-entity dimension (campaign/adset/ad) — snapshot of names/status keyed by STABLE id.
create table if not exists public.meta_ad_entities (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces(id) on delete cascade,
  connection_id        uuid references public.meta_connections(id) on delete cascade,
  level                text not null,               -- 'campaign' | 'adset' | 'ad'
  external_id          text not null,               -- stable Meta id (canonical)
  name                 text,
  status               text,
  parent_external_id   text,                         -- adset→campaign, ad→adset
  updated_at           timestamptz not null default now(),
  unique (workspace_id, external_id)
);
create index if not exists idx_meta_entities_ws on public.meta_ad_entities(workspace_id);

-- 3) Daily read-only insights (spend/impressions/reach/clicks). CTR/CPC are DERIVED in analytics.
create table if not exists public.meta_insights_daily (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces(id) on delete cascade,
  connection_id        uuid references public.meta_connections(id) on delete cascade,
  entity_external_id   text not null,               -- the AD's stable id (rolls up via meta_ad_entities)
  campaign_external_id text,                         -- denormalized for fast campaign rollup
  date                 date not null,
  spend                numeric(14,2) not null default 0,
  impressions          bigint not null default 0,
  reach                bigint not null default 0,
  clicks               bigint not null default 0,
  updated_at           timestamptz not null default now(),
  unique (workspace_id, entity_external_id, date)
);
create index if not exists idx_meta_insights_ws_date on public.meta_insights_daily(workspace_id, date);
create index if not exists idx_meta_insights_campaign on public.meta_insights_daily(workspace_id, campaign_external_id);

alter table public.meta_ad_entities enable row level security;
alter table public.meta_insights_daily enable row level security;

-- Reads: active workspace members see their own workspace's ad data. Writes are done server-side by
-- the sync job via the SERVICE ROLE (bypasses RLS) — no authenticated write policy needed.
drop policy if exists "workspace members read meta_ad_entities" on public.meta_ad_entities;
create policy "workspace members read meta_ad_entities" on public.meta_ad_entities
  for select using (public.is_active_workspace_member(workspace_id));

drop policy if exists "workspace members read meta_insights_daily" on public.meta_insights_daily;
create policy "workspace members read meta_insights_daily" on public.meta_insights_daily
  for select using (public.is_active_workspace_member(workspace_id));
