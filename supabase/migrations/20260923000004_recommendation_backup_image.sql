-- Client Recommendations /r — add the canonical BACKUP image to the resolver so
-- the card can chain snapshot → canonical primary → canonical backup → neutral
-- fallback (pairs with the <img> onError chain in RecommendationList).
--
-- Builds on 20260923000001 (the null-only canonical primary fallback). The
-- property_catalog LEFT JOIN by place_id is already present; this adds ONE key:
--   'backupImageUrl' ← pc.property_image_url_backup
-- The backup is the LIVE canonical backup (like the primary fallback, it is used
-- only if the resolved primary fails to LOAD in the browser). It never overrides
-- the frozen snapshot image, changes no other field, and keeps the return type's
-- properties jsonb shape (additive key). Commission is NOT added — /r is the
-- client page and must never show locator commission. Body identical to
-- 20260923000001 except the added jsonb key.

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
                 -- Canonical backup photo — tried by the card only if the primary
                 -- fails to LOAD (browser onError), before the neutral fallback.
                 'backupImageUrl', pc.property_image_url_backup,
                 -- Verified property website (snapshot-first, canonical fallback) — the
                 -- card makes the image + name open it in a new tab; non-clickable when null.
                 'websiteUrl', coalesce(i.property_website_url, pc.website_url),
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
