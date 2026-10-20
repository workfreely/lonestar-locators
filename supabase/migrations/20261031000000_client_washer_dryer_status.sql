-- Washer & Dryer: one status, confirmed per client, frozen into the list they are sent.
--
-- ── WHY IT IS PER CLIENT, NOT PER PROPERTY ──────────────────────────────────────────────────
-- property_catalog already records washer/dryer at the PROPERTY level, and the values it holds
-- are the reason that is not enough: 224 properties say "Select Units" and 3 say "Specific Floor
-- Plans". A property-level "Yes" is not a promise about the floor plan this client would lease.
-- So the client-facing answer lives on the (client, property) pair and is set by a person. This
-- migration reads nothing from property_catalog's washer_dryer columns, and nothing populates
-- the new column automatically.
--
-- ── WHERE IT LIVES ──────────────────────────────────────────────────────────────────────────
-- lead_property_reasons is already THE per-(client, property) record: unique on
-- (lead_id, canonical_property_key), and it already carries non-reason scalars (the commute
-- cache). One more scalar there inherits every property the reasons already have — it survives
-- reordering, it survives removing and re-adding a recommendation (there is no foreign key from
-- this table to lead_recommendations, and canonical_property_key is GENERATED, so a re-added
-- property computes the identical key), and lead_id is half the key so it cannot leak between
-- clients.
--
-- NULL is "not verified" and is the default: no backfill, no pill, and silence is never mistaken
-- for a claim.
--
-- ── THE FINGERPRINT ─────────────────────────────────────────────────────────────────────────
-- lb_prepare_client_share decides whether an unsent list can be reused. The status is now part
-- of that hash on BOTH sides, so confirming "Included" after preparing a list means the next
-- Send freezes a new snapshot instead of handing back one without the pill. Changing a status
-- still SENDS nothing by itself — it only stops a stale list being reused.
--
-- ── WHAT IS NOT TOUCHED ─────────────────────────────────────────────────────────────────────
-- All three functions are reproduced verbatim from the live catalog. Existing snapshots keep
-- washer_dryer_status NULL and render exactly as they do today. Reasons, commute cache, prices,
-- specials, commissions, favorites, ordering and every workflow are untouched.

-- The client-specific status. Two values; anything else is not verified.
alter table public.lead_property_reasons
  add column if not exists washer_dryer_status text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'lead_property_reasons_wd_status_chk') then
    alter table public.lead_property_reasons
      add constraint lead_property_reasons_wd_status_chk
      check (washer_dryer_status is null or washer_dryer_status in ('included','hookups'));
  end if;
end $$;

comment on column public.lead_property_reasons.washer_dryer_status is
  'Client-facing washer/dryer status the locator confirmed for THIS (client, property) pair: included | hookups. NULL = not verified, renders nothing. Never derived from property_catalog — floor plans differ.';

-- The frozen copy. Existing rows stay NULL, so every sent list renders as it did.
alter table public.client_recommendation_share_items
  add column if not exists washer_dryer_status text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_rec_share_items_wd_status_chk') then
    alter table public.client_recommendation_share_items
      add constraint client_rec_share_items_wd_status_chk
      check (washer_dryer_status is null or washer_dryer_status in ('included','hookups'));
  end if;
end $$;

comment on column public.client_recommendation_share_items.washer_dryer_status is
  'Frozen at send time from lead_property_reasons.washer_dryer_status. NULL on every snapshot created before this column existed.';

-- ── lb_create_client_share — verbatim, plus the frozen status ───────────────────────────
CREATE OR REPLACE FUNCTION public.lb_create_client_share(p_lead_id bigint, p_token_hash text, p_token_prefix text, p_raw_token text)
 RETURNS TABLE(share_id uuid, list_number integer, item_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ws        uuid;
  v_share_id  uuid;
  v_list_no   integer;
  v_count     integer;
  v_secret_id uuid;
begin
  select l.workspace_id
  into v_ws
  from public.leads l
  where l.id = p_lead_id;

  if v_ws is null then
    raise exception 'lb_create_client_share: lead % has no workspace', p_lead_id;
  end if;

  if not public.is_active_workspace_member(v_ws) then
    raise exception 'lb_create_client_share: not a member of this lead''s workspace';
  end if;

  select coalesce(max(s.list_number), 0) + 1
  into v_list_no
  from public.client_recommendation_shares s
  where s.lead_id = p_lead_id;

  insert into public.client_recommendation_shares (
    lead_id,
    token_hash,
    token_prefix,
    list_number
  )
  values (
    p_lead_id,
    p_token_hash,
    p_token_prefix,
    v_list_no
  )
  returning id into v_share_id;

  v_secret_id := vault.create_secret(
    p_raw_token,
    'client-share:' || v_share_id::text,
    'Raw client recommendation share token (Copy Link)'
  );

  update public.client_recommendation_shares
  set token_secret_id = v_secret_id
  where id = v_share_id;

  insert into public.client_recommendation_share_items (
    share_id,
    source_recommendation_id,
    property_name,
    property_address,
    property_image_url,
    property_website_url,
    reasons,
    sort_order,
    place_id,
    google_rating,
    current_special,
    washer_dryer_status
  )
  select
    v_share_id,
    r.id,
    r.property_name,
    r.property_address,
    r.property_image_url,
    r.property_website_url,
    public.lb_compose_recommendation_reasons(
      to_jsonb(pr.reasons), l.beds,
      pc.onebr_starting_rent, pc.twobr_starting_rent, pc.threebr_starting_rent
    ),
    (row_number() over (order by r.sort_order asc nulls last, r.created_at asc, r.id asc))::int,

    -- The snapshot's own copy of the routing identity.
    -- canonical_property_key is generated as 'pid:<place id>'
    -- for a Google-resolved property and 'url:<property_url>'
    -- for an unresolved one.
    nullif(
      substring(r.canonical_property_key from '^pid:(.*)$'),
      ''
    ),

    pc.google_rating,
    pc.current_special,

    -- The CLIENT-SPECIFIC status the locator confirmed for THIS pair. It comes from
    -- lead_property_reasons (already joined for the reasons), never from
    -- property_catalog.washer_dryer_included — a property-level 'Yes' is not a promise
    -- about the floor plan this client would lease.
    pr.washer_dryer_status

  from public.lead_recommendations r

  left join public.lead_property_reasons pr
    on pr.lead_id = r.lead_id
    and pr.canonical_property_key = r.canonical_property_key

  left join public.property_catalog pc
    on pc.place_id = nullif(
      substring(r.canonical_property_key from '^pid:(.*)$'),
      ''
    )

  left join public.leads l on l.id = r.lead_id

  where r.lead_id = p_lead_id;

  select count(*)::int
  into v_count
  from public.client_recommendation_share_items ci
  where ci.share_id = v_share_id;

  update public.client_recommendation_shares s
  set item_count = v_count
  where s.id = v_share_id;

  return query
  select v_share_id, v_list_no, v_count;
end
$function$;

-- ── lb_prepare_client_share — verbatim, plus the status on both sides of the hash ───────
CREATE OR REPLACE FUNCTION public.lb_prepare_client_share(p_lead_id bigint, p_token_hash text, p_token_prefix text, p_raw_token text)
 RETURNS TABLE(share_id uuid, list_number integer, item_count integer, reused boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ws       uuid;
  v_existing uuid;
  v_list_no  integer;
  v_count    integer;
  v_cur_fp   text;
  v_snap_fp  text;
begin
  select l.workspace_id into v_ws from public.leads l where l.id = p_lead_id;
  if v_ws is null then
    raise exception 'lb_prepare_client_share: lead % has no workspace', p_lead_id;
  end if;
  if not public.is_active_workspace_member(v_ws) then
    raise exception 'lb_prepare_client_share: not a member of this lead''s workspace';
  end if;

  select string_agg(
           coalesce(r.property_name,'')       || E'\x1f' ||
           coalesce(r.property_address,'')     || E'\x1f' ||
           coalesce(r.property_image_url,'')   || E'\x1f' ||
           coalesce(r.property_website_url,'') || E'\x1f' ||
           public.lb_compose_recommendation_reasons(
             to_jsonb(pr.reasons), l.beds,
             pc.onebr_starting_rent, pc.twobr_starting_rent, pc.threebr_starting_rent
           )::text || E'\x1f' ||
           coalesce(pr.washer_dryer_status, ''),
           E'\x1e' order by r.sort_order asc nulls last, r.created_at asc, r.id asc)
    into v_cur_fp
    from public.lead_recommendations r
    left join public.lead_property_reasons pr
           on pr.lead_id = r.lead_id
          and pr.canonical_property_key = r.canonical_property_key
    left join public.property_catalog pc
           on pc.place_id = nullif(substring(r.canonical_property_key from '^pid:(.*)$'), '')
    left join public.leads l on l.id = r.lead_id
   where r.lead_id = p_lead_id;

  select s.id, s.list_number
    into v_existing, v_list_no
    from public.client_recommendation_shares s
   where s.lead_id = p_lead_id
     and s.sent_at is null
     and s.disabled_at is null
     and s.revoked_at is null
   order by s.list_number desc
   limit 1;

  if v_existing is not null then
    select string_agg(
             coalesce(ci.property_name,'')       || E'\x1f' ||
             coalesce(ci.property_address,'')     || E'\x1f' ||
             coalesce(ci.property_image_url,'')   || E'\x1f' ||
             coalesce(ci.property_website_url,'') || E'\x1f' ||
             coalesce(ci.reasons, '[]'::jsonb)::text || E'\x1f' ||
             coalesce(ci.washer_dryer_status, ''),
             E'\x1e' order by ci.sort_order asc)
      into v_snap_fp
      from public.client_recommendation_share_items ci
     where ci.share_id = v_existing;

    if v_cur_fp is not distinct from v_snap_fp then
      select s.item_count into v_count
        from public.client_recommendation_shares s where s.id = v_existing;
      return query select v_existing, v_list_no, coalesce(v_count, 0), true;
      return;
    end if;
  end if;

  return query
    select c.share_id, c.list_number, c.item_count, false
      from public.lb_create_client_share(p_lead_id, p_token_hash, p_token_prefix, p_raw_token) c;
end $function$;

-- ── lb_resolve_client_recommendations — verbatim, plus one key for the client page ─────
CREATE OR REPLACE FUNCTION public.lb_resolve_client_recommendations(p_token_hash text)
 RETURNS TABLE(status text, agent_name text, agent_photo_url text, agent_title text, agent_phone text, agent_email text, agent_brokerage text, smart_form_config jsonb, client_first_name text, client_city text, properties jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_share record; v_status text;
begin
  select s.id, s.lead_id, s.disabled_at, s.revoked_at into v_share
    from public.client_recommendation_shares s
   where s.token_hash = p_token_hash and s.revoked_at is null limit 1;
  if v_share.id is null then return; end if;
  v_status := case when v_share.disabled_at is not null then 'disabled' else 'active' end;
  return query
  select
    v_status,
    coalesce(nullif(trim(concat_ws(' ', nullif(trim(p.preferred_first_name), ''), nullif(trim(p.preferred_last_name), ''))), ''),
      nullif(trim(p.preferred_name), ''), nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Your Locator')::text,
    p.profile_photo_url::text,
    'Licensed Apartment Locator'::text,
    nullif(trim(p.phone_number), '')::text,
    nullif(trim(p.email), '')::text,
    coalesce(nullif(trim(p.brokerage), ''), nullif(trim(p.business_name), ''))::text,
    w.smart_form_config,
    nullif(trim(l.first_name), '')::text,
    nullif(trim(l.city), '')::text,
    case when v_status <> 'active' then null::jsonb
      else coalesce((
        select jsonb_agg(jsonb_build_object(
                 'name', i.property_name, 'address', i.property_address,
                 'imageUrl', coalesce(i.property_image_url, pc.property_image_url),
                 'backupImageUrl', pc.property_image_url_backup,
                 'websiteUrl', coalesce(i.property_website_url, pc.website_url),
                 'reasons', coalesce(i.reasons, '[]'::jsonb),
                 'startingPrice', i.starting_price,
                 -- Snapshot-first; fall back to a FRESH canonical special only when the
                 -- snapshot has none. Stale/absent canonical special → nothing shown.
                 'currentSpecial', coalesce(
                   nullif(btrim(i.current_special), ''),
                   case when coalesce(pc.current_special_checked_at, pc.verified_at)
                             > now() - interval '45 days' then pc.current_special end),
                 'googleRating', i.google_rating,
                 'washerDryer', i.washer_dryer_status,
                 'index', i.sort_order, 'favorited', (i.favorited_at is not null)
               ) order by i.sort_order asc)
          from public.client_recommendation_share_items i
          left join public.property_catalog pc on pc.place_id = i.place_id
         where i.share_id = v_share.id
      ), '[]'::jsonb)
    end
  from public.leads l
  join public.workspaces w on w.id = l.workspace_id
  join public.profiles p on p.id = w.created_by
  where l.id = v_share.lead_id limit 1;
end $function$;
