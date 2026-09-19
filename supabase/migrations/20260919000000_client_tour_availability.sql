-- Client Tour Availability + "Done Selecting Favorites" bridge.
--
-- Turns the public /r/<token> recommendation page into a workflow:
--   client hearts (share-scoped) -> Done Selecting Favorites -> lead advances
--   List Sent -> Ready to Tour AND the hearted properties are reconciled into the
--   canonical lead_favorites registry (so the existing Favorites section + Schedule
--   Tour workflow become the destination) -> Send My Availability stores general
--   availability and ensures the existing canonical setup_tour ("Schedule Tour")
--   action is actionable. NONE of this creates a lead_tours appointment; concrete
--   tours continue to be booked by the locator via completeSetupTour().
--
-- Security: the raw token is the only credential (hashed in Node before it reaches
-- the DB); every RPC resolves by token_hash, no-ops on revoked/disabled shares, and
-- never accepts or returns a lead_id / internal id. Availability is stored OUTSIDE
-- the immutable recommendation snapshot.
--
-- APPLY TO PRODUCTION via the Supabase Management API, statement by statement with
-- verification (remote migration history is drifted; `supabase db push` would reapply
-- unrelated migrations). This file is the version-controlled record.

-- =====================================================================================
-- 1) Availability storage (share-scoped, mutable, upsert-per-share).
-- =====================================================================================
alter table public.client_recommendation_shares
  add column if not exists done_selecting_at timestamptz;

create table if not exists public.client_tour_availability (
  share_id          uuid primary key references public.client_recommendation_shares(id) on delete cascade,
  tour_type         text check (tour_type in ('in_person','virtual','either')),
  dates             jsonb   not null default '[]'::jsonb,   -- [{date:'YYYY-MM-DD', windows:['morning'|'afternoon'|'evening'|'flexible']}]
  favorited_indexes int[]   not null default '{}'::int[],   -- sort_orders favorited AT SUBMIT TIME (history/context only)
  status            text    not null default 'submitted' check (status in ('submitted','withdrawn')),
  submitted_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.client_tour_availability enable row level security;

-- Members of the share's workspace can read availability (mirrors share_items RLS).
-- Writes go ONLY through the SECURITY DEFINER RPCs below; there is no anon/insert policy.
drop policy if exists "members read tour availability" on public.client_tour_availability;
create policy "members read tour availability"
  on public.client_tour_availability for select
  using (exists (
    select 1 from public.client_recommendation_shares s
    where s.id = client_tour_availability.share_id
      and public.is_active_workspace_member(s.workspace_id)
  ));

-- =====================================================================================
-- 2) lead_favorites canonical identity + client provenance (ADDITIVE, no-delete).
--    Reuses the EXACT identity strategy already established for lead_recommendations
--    (migration 20260918000000): pid:<place_id> when resolvable from property_url,
--    else url:<normalized property_url>. Verified 0 collisions / 0 null-url rows at
--    write time, so the unique index is created with NO dedupe/delete step.
-- =====================================================================================
alter table public.lead_favorites
  add column if not exists canonical_property_key text
  generated always as (
    coalesce(
      'pid:' || substring(property_url from '[?&]q=place_id:([^&]+)'),
      'url:' || lower(btrim(property_url))
    )
  ) stored;

-- One row per (lead, canonical property). Partial: url-less rows (key null) are exempt,
-- exactly like the pre-existing behavior for name-only favorites.
create unique index if not exists lead_favorites_lead_canonical_uidx
  on public.lead_favorites (lead_id, canonical_property_key)
  where canonical_property_key is not null;

-- Additive provenance: set when a row is created/promoted by the client's Done bridge.
-- Does NOT change origin ('favorite'/'application') shown/hidden semantics.
alter table public.lead_favorites
  add column if not exists client_committed_at timestamptz;

comment on column public.lead_favorites.client_committed_at is
  'Set when this favorite was committed by the client via Done Selecting Favorites on /r. Additive provenance only: origin still governs favorite/application display. Locator-added favorites have this null. Never used to auto-delete.';

-- =====================================================================================
-- 3) RPC: Done Selecting Favorites — ONE atomic event.
--    Resolve token -> reconcile hearted items into lead_favorites (idempotent,
--    promotion-aware, never destructive) -> forward-only advance to ready_to_tour ->
--    create the canonical Ready-to-Tour action -> stamp done_selecting_at + timeline.
--    Any failure rolls the whole thing back (the route then reports non-success).
-- =====================================================================================
create or replace function public.lb_mark_client_done_selecting(p_token_hash text)
  returns jsonb
  language plpgsql
  volatile
  security definer
  set search_path to 'public'
as $$
declare
  v_share    record;
  v_lead     record;
  v_committed int := 0;
  v_advanced  boolean := false;
  v_first_done boolean := false;
  v_rank_cur  int;
  v_rank_rtt  int;
  v_action_key   text;
  v_action_title text;
  v_action_due   timestamptz;
  -- LEAD_STAGES order. array_position is 1-based, so ranks are new=1 … ready_to_tour=5.
  v_stages constant text[] := array['new','contacted','searching','list_sent','ready_to_tour','done_touring','applied','closed','archived'];
begin
  -- Resolve share by token; revoked/unknown and disabled shares mutate nothing.
  select s.id, s.lead_id, s.workspace_id, s.disabled_at, s.done_selecting_at
    into v_share
  from public.client_recommendation_shares s
  where s.token_hash = p_token_hash and s.revoked_at is null
  limit 1;
  if v_share.id is null then return null; end if;             -- revoked/unknown -> silent
  if v_share.disabled_at is not null then return null; end if; -- disabled -> no writes
  v_first_done := (v_share.done_selecting_at is null);

  select l.id, l.crm_status, l.workspace_id, l.owner_user_id, l.move_date
    into v_lead
  from public.leads l where l.id = v_share.lead_id limit 1;
  if v_lead.id is null then return null; end if;

  -- 3a) Reconcile currently-hearted share items into canonical lead_favorites.
  --     Identity mirrors lead_recommendations (pid:/url:). Promotion is one-way
  --     (application -> favorite, same id); an existing favorite is never demoted or
  --     deleted. Ownership stamped explicitly (set_workspace_ownership keys off
  --     auth.uid(), which is null under this anon-invoked definer RPC).
  --
  --     Identity carrier is resolved in strict priority, using ONLY existing canonical
  --     identity rules (no name/address/fuzzy matching):
  --       1. snapshot place_id                                 -> pid:<id>
  --       2. snapshot property_website_url                     -> url:<...>
  --       3. FALLBACK: the exact SOURCE recommendation's place_id (via
  --          source_recommendation_id), when the immutable snapshot carried neither.
  --          Only a Google place_id embedded in the source's property_url counts as a
  --          "safely resolvable identity" here; a bare source URL is NOT used. This
  --          reads the source recommendation but never mutates/backfills the snapshot.
  --       else -> NULL -> the item is skipped (unchanged behavior).
  with src as (
    select
      coalesce(
        case when nullif(btrim(i.place_id), '') is not null
             then 'https://www.google.com/maps/place/?q=place_id:' || btrim(i.place_id) end,
        nullif(btrim(i.property_website_url), ''),
        case when nullif(btrim(substring(r.property_url from '[?&]q=place_id:([^&]+)')), '') is not null
             then 'https://www.google.com/maps/place/?q=place_id:' || btrim(substring(r.property_url from '[?&]q=place_id:([^&]+)')) end
      ) as prop_url,
      i.property_name, i.property_address, i.property_image_url
    from public.client_recommendation_share_items i
    left join public.lead_recommendations r on r.id = i.source_recommendation_id
    where i.share_id = v_share.id
      and i.favorited_at is not null
  ), ins as (
    insert into public.lead_favorites
      (lead_id, property_name, property_url, property_address, property_image_url,
       origin, workspace_id, owner_user_id, client_committed_at)
    select
      v_lead.id, src.property_name, src.prop_url, src.property_address, src.property_image_url,
      'favorite', v_lead.workspace_id, v_lead.owner_user_id, now()
    from src
    where src.prop_url is not null   -- skip items with no safe canonical identity
    on conflict (lead_id, canonical_property_key) where canonical_property_key is not null
    do update set
      origin = case when lead_favorites.origin = 'application'
                    then 'favorite' else lead_favorites.origin end,
      client_committed_at = coalesce(lead_favorites.client_committed_at, now()),
      updated_at = now()
    returning 1
  )
  select count(*) into v_committed from ins;

  -- 3b) Forward-only stage advance: only from a stage earlier than ready_to_tour.
  v_rank_cur := coalesce(array_position(v_stages, v_lead.crm_status), -1);
  v_rank_rtt := array_position(v_stages, 'ready_to_tour');
  if v_rank_cur >= 1 and v_rank_cur < v_rank_rtt then
    update public.leads set crm_status = 'ready_to_tour' where id = v_lead.id;
    v_advanced := true;

    -- Canonical Ready-to-Tour action (mirrors getStageWorkflowAction('ready_to_tour')):
    -- far-out move date -> Reconnect Client, else Setup Tour (immediate).
    if v_lead.move_date is not null and v_lead.move_date > (current_date + 90) then
      v_action_key := 'reconnect_client';
      v_action_title := 'Reconnect Client';
      v_action_due := (v_lead.move_date - 90)::timestamptz;
    else
      v_action_key := 'setup_tour';
      v_action_title := 'Setup Tour';
      v_action_due := now();
    end if;

    begin
      insert into public.lead_next_actions
        (lead_id, title, due_at, priority, completed, action_type, origin, action_key,
         status, workflow_version, workspace_id, owner_user_id)
      values
        (v_lead.id, v_action_title, v_action_due, 'medium', false, 'workflow', 'workflow',
         v_action_key, 'open', 1, v_lead.workspace_id, v_lead.owner_user_id);
    exception when unique_violation then
      null; -- one_open_per_action backstop: an open row already exists -> idempotent no-op
    end;
  end if;

  -- 3c) Mark Done (idempotent) + append a timeline record.
  update public.client_recommendation_shares
    set done_selecting_at = coalesce(done_selecting_at, now())
  where id = v_share.id;

  -- Append a timeline record only on the FIRST Done for this share, so reloading or
  -- pressing Done again never duplicates the workflow event.
  if v_first_done then
    insert into public.lead_timeline (lead_id, type, method, metadata, occurred_at, workspace_id, owner_user_id)
    values (
      v_lead.id, 'stage_change', 'client_done_selecting',
      jsonb_build_object('to', 'ready_to_tour', 'advanced', v_advanced, 'favorites_committed', v_committed),
      now(), v_lead.workspace_id, v_lead.owner_user_id
    );
  end if;

  return jsonb_build_object('ok', true, 'favoritesCommitted', v_committed, 'advanced', v_advanced);
end;
$$;

grant execute on function public.lb_mark_client_done_selecting(text) to anon, authenticated;

-- =====================================================================================
-- 4) RPC: Send My Availability — upsert general availability + ensure setup_tour.
--    Validates strictly (enum tour_type, YYYY-MM-DD future dates, enum windows,
--    bounded). Ensures the canonical setup_tour action is open ONLY when the lead is
--    at ready_to_tour (never reopens on later stages). Never writes lead_tours.
-- =====================================================================================
create or replace function public.lb_set_client_tour_availability(
  p_token_hash text,
  p_tour_type  text,
  p_dates      jsonb
)
  returns jsonb
  language plpgsql
  volatile
  security definer
  set search_path to 'public'
as $$
declare
  v_share record;
  v_lead  record;
  v_clean jsonb := '[]'::jsonb;
  v_day   jsonb;
  v_date  text;
  v_windows jsonb;
  v_fav   int[];
  v_open_id bigint;
  v_completed_id bigint;
begin
  select s.id, s.lead_id, s.disabled_at into v_share
  from public.client_recommendation_shares s
  where s.token_hash = p_token_hash and s.revoked_at is null limit 1;
  if v_share.id is null then return null; end if;
  if v_share.disabled_at is not null then return null; end if;

  -- Validate tour type.
  if p_tour_type is null or p_tour_type not in ('in_person','virtual','either') then
    raise exception 'invalid tour_type';
  end if;

  -- Validate + normalize dates: YYYY-MM-DD, today-or-future, known windows, bounded.
  if p_dates is null or jsonb_typeof(p_dates) <> 'array' then
    raise exception 'invalid dates';
  end if;
  if jsonb_array_length(p_dates) < 1 or jsonb_array_length(p_dates) > 14 then
    raise exception 'dates out of range';
  end if;
  for v_day in select * from jsonb_array_elements(p_dates) loop
    v_date := v_day->>'date';
    if v_date is null or v_date !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'invalid date value';
    end if;
    if to_date(v_date, 'YYYY-MM-DD') < current_date then
      raise exception 'past date not allowed';
    end if;
    v_windows := coalesce(v_day->'windows', '[]'::jsonb);
    if jsonb_typeof(v_windows) <> 'array' or jsonb_array_length(v_windows) < 1 then
      raise exception 'windows required';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(v_windows) w
      where w not in ('morning','afternoon','evening','flexible')
    ) then
      raise exception 'invalid window';
    end if;
    v_clean := v_clean || jsonb_build_object('date', v_date, 'windows', v_windows);
  end loop;

  -- Capture the favorited set AT SUBMIT TIME from the share itself (server truth,
  -- not client-supplied) — history/context only; never the authoritative live state.
  select coalesce(array_agg(i.sort_order order by i.sort_order), '{}'::int[]) into v_fav
  from public.client_recommendation_share_items i
  where i.share_id = v_share.id and i.favorited_at is not null;

  -- Upsert (one row per share; resubmit overwrites -> no duplicate/conflicting records).
  insert into public.client_tour_availability
    (share_id, tour_type, dates, favorited_indexes, status, submitted_at, updated_at)
  values
    (v_share.id, p_tour_type, v_clean, v_fav, 'submitted', now(), now())
  on conflict (share_id) do update set
    tour_type = excluded.tour_type,
    dates = excluded.dates,
    favorited_indexes = excluded.favorited_indexes,
    status = 'submitted',
    updated_at = now();

  -- Ensure the canonical setup_tour action is actionable, but ONLY at ready_to_tour
  -- (never reopen on done_touring/applied/closed -> no workflow regression).
  select l.id, l.crm_status, l.workspace_id, l.owner_user_id into v_lead
  from public.leads l where l.id = v_share.lead_id limit 1;

  if v_lead.crm_status = 'ready_to_tour' then
    select id into v_open_id from public.lead_next_actions
      where lead_id = v_lead.id and action_key = 'setup_tour' and status = 'open' limit 1;
    if v_open_id is null then
      select id into v_completed_id from public.lead_next_actions
        where lead_id = v_lead.id and action_key = 'setup_tour' and status = 'completed'
        order by id desc limit 1;
      if v_completed_id is not null then
        -- Reopen the completed one in place (mirrors cancelTour reopen semantics).
        update public.lead_next_actions
          set completed = false, completed_at = null, status = 'open', due_at = now()
        where id = v_completed_id;
      else
        begin
          insert into public.lead_next_actions
            (lead_id, title, due_at, priority, completed, action_type, origin, action_key,
             status, workflow_version, workspace_id, owner_user_id)
          values
            (v_lead.id, 'Setup Tour', now(), 'medium', false, 'workflow', 'workflow',
             'setup_tour', 'open', 1, v_lead.workspace_id, v_lead.owner_user_id);
        exception when unique_violation then null;
        end;
      end if;
    end if;
  end if;

  insert into public.lead_timeline (lead_id, type, method, metadata, occurred_at, workspace_id, owner_user_id)
  values (v_lead.id, 'availability_submitted', 'client_tour_availability',
          jsonb_build_object('tour_type', p_tour_type, 'date_count', jsonb_array_length(v_clean)),
          now(), v_lead.workspace_id, v_lead.owner_user_id);

  return jsonb_build_object('ok', true, 'tourType', p_tour_type, 'dates', v_clean);
end;
$$;

grant execute on function public.lb_set_client_tour_availability(text, text, jsonb) to anon, authenticated;

-- =====================================================================================
-- 5) RPC: read-only tour state for /r reload + Edit (keeps the core resolver stable).
-- =====================================================================================
create or replace function public.lb_get_client_tour_state(p_token_hash text)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to 'public'
as $$
declare
  v_share record;
  v_av record;
begin
  select s.id, s.done_selecting_at, s.disabled_at into v_share
  from public.client_recommendation_shares s
  where s.token_hash = p_token_hash and s.revoked_at is null limit 1;
  if v_share.id is null or v_share.disabled_at is not null then
    return jsonb_build_object('doneSelecting', false, 'availability', null);
  end if;

  select tour_type, dates into v_av
  from public.client_tour_availability where share_id = v_share.id limit 1;

  return jsonb_build_object(
    'doneSelecting', v_share.done_selecting_at is not null,
    'availability',
      case when v_av.tour_type is null then null
           else jsonb_build_object('tourType', v_av.tour_type, 'dates', v_av.dates) end
  );
end;
$$;

grant execute on function public.lb_get_client_tour_state(text) to anon, authenticated;
