-- Surface the client's submitted SEARCH city to the public Recommendations page
-- (/r/<token>) for PRESENTATION ONLY — it selects the hero skyline for the
-- client's market. The smallest additive change identified in the audit:
--
--   * The resolver ALREADY joins the lead (public.leads l on l.id = share.lead_id),
--     so no new join, and NO city is copied into the immutable recommendation
--     snapshot tables (client_recommendation_shares / _share_items are untouched).
--   * One new output column, `client_city` = the LIVE lead.city. It is used only
--     to resolve an existing theme image via the canonical market/theme catalog
--     (lib/markets/cityTheme + lib/themes); unknown/imageless cities fall back to
--     the generic SKYLINE_PATH client-side, so the hero is never broken.
--   * Immutable-snapshot semantics are unchanged: this reads the lead row the
--     resolver was already reading; it does not freeze, mutate, or expose any
--     new snapshot data, lead id, workspace id, or locator-only field.
--
-- Adding a column to the RETURNS TABLE changes the function's return type, so the
-- function must be dropped and recreated (create-or-replace cannot change it);
-- the execute grant is reapplied afterwards. Body is otherwise identical to
-- 20260918000001 (price/special/rating), with `client_city` inserted after
-- `client_first_name`.

drop function if exists public.lb_resolve_client_recommendations(text);

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
                 'imageUrl', i.property_image_url, 'websiteUrl', i.property_website_url,
                 'reasons', coalesce(i.reasons, '[]'::jsonb),
                 'startingPrice', i.starting_price,
                 'currentSpecial', i.current_special,
                 'googleRating', i.google_rating,
                 'index', i.sort_order, 'favorited', (i.favorited_at is not null)
               ) order by i.sort_order asc)
          from public.client_recommendation_share_items i where i.share_id = v_share.id
      ), '[]'::jsonb)
    end
  from public.leads l
  join public.workspaces w on w.id = l.workspace_id
  join public.profiles p on p.id = w.created_by
  where l.id = v_share.lead_id limit 1;
end $$;

grant execute on function public.lb_resolve_client_recommendations(text) to anon, authenticated;
