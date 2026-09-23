-- Client Recommendations /r — surface a VERIFIED/CURRENT canonical special when the
-- frozen snapshot has none, mirroring the image/website fallbacks (20260923000004).
--
-- Rule (from the product owner): "if a verified/current special exists in canonical
-- data, it must render as the blue image-overlay pill; if none, render nothing —
-- never fabricate." The resolver fed 'currentSpecial' from the SNAPSHOT only, so a
-- property whose canonical property_catalog.current_special is set but whose frozen
-- snapshot special is NULL showed no pill. This adds a null-only, FRESHNESS-GATED
-- canonical fallback:
--   currentSpecial = COALESCE(snapshot special,
--                             canonical special WHEN verified_at is within 45 days)
-- It never overrides a frozen snapshot special, and a stale canonical special
-- (verified_at older than 45 days, or absent) is ignored — so only a genuinely
-- current special ever appears. Body identical to 20260923000004 except that one key.

create or replace function public.lb_resolve_client_recommendations(p_token_hash text)
 returns table(status text, agent_name text, agent_photo_url text, agent_title text, agent_phone text, agent_email text, agent_brokerage text, smart_form_config jsonb, client_first_name text, client_city text, properties jsonb)
 language plpgsql stable security definer set search_path to 'public'
as $$
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
                   case when pc.verified_at > now() - interval '45 days' then pc.current_special end),
                 'googleRating', i.google_rating,
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
end $$;

grant execute on function public.lb_resolve_client_recommendations(text) to anon, authenticated;
