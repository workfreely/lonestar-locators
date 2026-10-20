-- SEND LIST MUST NOT HAND BACK A FINISHED SHARE.
--
-- lb_prepare_client_share reuses the newest draft share when the list's contents are unchanged,
-- which is right: it keeps one stable link per unchanged list instead of a new URL per press.
-- But "draft" was defined only as not sent, not disabled and not revoked. A share the client had
-- already completed -- hearts chosen, Done Selecting tapped -- still matched, so pressing Send
-- List returned it, and the page opened with the favourites bar hidden because that share's
-- selection step was over. For lead 94 this returned list #16 (done_selecting_at 15:41:10)
-- instead of creating #17, and no amount of re-sending could produce a selectable list.
--
-- The fix is one predicate. Everything else is unchanged: the fingerprint comparison, the
-- snapshots, list numbering, and lb_create_client_share all behave exactly as before. A
-- completed share now simply falls through to the create path, which is what it should always
-- have done.
--
-- Regenerated from the live pg_get_functiondef output, so nothing else can drift.

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
             pc.onebr_starting_rent, pc.twobr_starting_rent, pc.threebr_starting_rent,
             3,
             public.lb_average_rent_quote(pr.avg_rent_quoted_rent, pr.avg_rent_concession_weeks,
                                          pr.avg_rent_concession_months, pr.avg_rent_lease_months,
                                          pr.avg_rent_show)
           )::text || E'\x1f' ||
           coalesce(pr.washer_dryer_status, '') || E'\x1f' ||
           coalesce(pr.avg_rent_quoted_rent::text, '') || '~' ||
           coalesce(pr.avg_rent_concession_weeks::text, '') || '~' ||
           coalesce(pr.avg_rent_concession_months::text, '') || '~' ||
           coalesce(pr.avg_rent_lease_months::text, '') || '~' ||
           coalesce(pr.avg_rent_show::text, 'false'),
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
     -- A share the CLIENT HAS ALREADY FINISHED WITH is not a draft. Reusing one hands the
     -- next list back on a page whose selection step is over: done_selecting_at drives
     -- initialDoneSelecting, which hides the sticky "Done Selecting Favorites" bar, so the
     -- client is shown a list they cannot choose from. sent_at did not catch this -- it is
     -- only stamped by some send paths, so a completed-but-unstamped share stayed the newest
     -- reuse candidate forever once its contents settled.
     and s.done_selecting_at is null
   order by s.list_number desc
   limit 1;

  if v_existing is not null then
    select string_agg(
             coalesce(ci.property_name,'')       || E'\x1f' ||
             coalesce(ci.property_address,'')     || E'\x1f' ||
             coalesce(ci.property_image_url,'')   || E'\x1f' ||
             coalesce(ci.property_website_url,'') || E'\x1f' ||
             coalesce(ci.reasons, '[]'::jsonb)::text || E'\x1f' ||
             coalesce(ci.washer_dryer_status, '') || E'\x1f' ||
             coalesce(ci.avg_rent_quoted_rent::text, '') || '~' ||
             coalesce(ci.avg_rent_concession_weeks::text, '') || '~' ||
             coalesce(ci.avg_rent_concession_months::text, '') || '~' ||
             coalesce(ci.avg_rent_lease_months::text, '') || '~' ||
             coalesce(ci.avg_rent_show::text, 'false'),
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
