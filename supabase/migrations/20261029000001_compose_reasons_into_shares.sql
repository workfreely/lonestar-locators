-- Compose the bedroom starting price into CLIENT snapshots.
--
-- Both call sites, because they must agree:
--   lb_prepare_client_share  — the reuse FINGERPRINT. Without composing here, a price change
--                              would not invalidate an UNSENT share and a re-send would hand
--                              back stale composed reasons.
--   lb_create_client_share   — the snapshot INSERT, which freezes what the client will see.
--
-- Both bodies are the LIVE definitions, transformed only at those two points plus the joins the
-- helper needs (property_catalog for the rents, leads for the saved bedroom preference).
-- Signatures, SECURITY DEFINER, search_path and grants are unchanged, so every existing caller
-- is unaffected. lead_property_reasons is never written. Existing snapshots are never revisited:
-- only a newly minted share composes.

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
           )::text,
           E'\x1e' order by r.created_at asc)
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
             coalesce(ci.reasons, '[]'::jsonb)::text,
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
    current_special
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
    (row_number() over (order by r.created_at asc))::int,

    -- The snapshot's own copy of the routing identity.
    -- canonical_property_key is generated as 'pid:<place id>'
    -- for a Google-resolved property and 'url:<property_url>'
    -- for an unresolved one.
    nullif(
      substring(r.canonical_property_key from '^pid:(.*)$'),
      ''
    ),

    pc.google_rating,
    pc.current_special

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
