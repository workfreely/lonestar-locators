-- Null-only canonical image fallback for the client Recommendations page (/r/<token>).
--
-- Problem (proven with Jones & Rio, place_id ChIJsxRYyfn1XIYRc44Uh_kyNWo): a
-- recommendation snapshotted BEFORE property_catalog had an image froze
-- property_image_url = NULL, so /r shows a blank card even though the live catalog
-- now has a valid photo (which the Map/Companion cards already display).
--
-- Smallest fix: in the resolver's per-item subquery, LEFT JOIN property_catalog by
-- the place_id the snapshot ALREADY stores, and resolve imageUrl as
--   COALESCE(snapshot.property_image_url, property_catalog.property_image_url)
-- so the catalog image is used ONLY when the snapshot image is NULL. It NEVER
-- overrides a frozen image, and NOTHING else changes — name, address, reasons,
-- price, special, rating, favorites all stay exactly as frozen. Return type is
-- unchanged, so this is a plain create-or-replace (no schema change, no re-mint).
-- Body is identical to 20260919120000 except the added LEFT JOIN + the COALESCE.

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
    -- Presentation-only: the client's submitted search city, for hero image only.
    nullif(trim(l.city), '')::text,
    case when v_status <> 'active' then null::jsonb
      else coalesce((
        select jsonb_agg(jsonb_build_object(
                 'name', i.property_name, 'address', i.property_address,
                 -- Null-only fallback: use the live canonical catalog image ONLY when
                 -- the frozen snapshot image is NULL. Never overrides a frozen image.
                 'imageUrl', coalesce(i.property_image_url, pc.property_image_url),
                 'websiteUrl', i.property_website_url,
                 'reasons', coalesce(i.reasons, '[]'::jsonb),
                 'startingPrice', i.starting_price,
                 'currentSpecial', i.current_special,
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
