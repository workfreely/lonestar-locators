-- Special badges: use the SPECIAL's own verification date as the freshness source.
--
-- ── THE BUG ─────────────────────────────────────────────────────────────────────────────────
-- A special entered through the owner's Property Intelligence editor did not appear anywhere.
-- The editor writes current_special (and the writer couples current_special_checked_at and
-- current_special_source), but BOTH freshness gates — the locator badge and this client
-- resolver — read the RECORD-level property_catalog.verified_at, which the editor never sets.
-- On a property whose verified_at was null, a freshly verified special was silently suppressed.
-- Observed on The Links on PGA Parkway and Waterford Market: current_special_checked_at =
-- today, verified_at = null, no badge.
--
-- ── WHY COALESCE AND NOT A REPLACEMENT ──────────────────────────────────────────────────────
-- Switching outright to current_special_checked_at would have HIDDEN four badges that work
-- today: the master-import rows (Oasis at Stone Oak, Preserve at Westover Hills, Los Cielos at
-- Brooks, Canyon Point) carry verified_at = 2026-09-23 and NO current_special_checked_at,
-- because their specials predate the per-field stamp. Preferring the special's own date and
-- falling back to the record's keeps both populations correct.
--
-- The 45-day policy is unchanged. Nothing writes verified_at here; this only changes which
-- timestamp is READ.
--
-- Two functions, one fix:
--   lb_property_catalog_by_ids        — return current_special_checked_at so the locator card
--                                       can apply the same rule (23 -> 24 columns, additive).
--   lb_resolve_client_recommendations — read coalesce(special_checked_at, verified_at).
--
-- Existing client snapshots are untouched: this gate only ever supplies a canonical special
-- when the FROZEN snapshot value is null, and it still never overrides one.

-- ── 1. lb_property_catalog_by_ids: +1 column ────────────────────────────────────────────────
-- Adding an OUT column changes the return type, so drop then recreate. Same signature, same
-- SECURITY DEFINER / search_path / 60-id cap; the grant below restores execute access.
drop function if exists public.lb_property_catalog_by_ids(text[]);

create function public.lb_property_catalog_by_ids(p_place_ids text[])
returns table (
  place_id                   text,
  property_name              text,
  neighborhood               text,
  location                   text,
  location_keywords          jsonb,
  zip                        text,
  website_url                text,
  google_rating              real,
  property_image_url         text,
  tour_url                   text,
  apply_url                  text,
  availability_url           text,
  property_image_url_backup  text,
  current_special            text,
  send_commission            text,
  escort_commission          text,
  bonus_flat                 text,
  google_review_count        integer,
  verified_at                timestamptz,
  onebr_starting_rent        numeric,
  twobr_starting_rent        numeric,
  threebr_starting_rent      numeric,
  pricing_last_verified      date,
  -- The SPECIAL's own verification timestamp — the freshness source for its badge.
  current_special_checked_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids text[];
  v_n   int;
begin
  select array_agg(distinct id) into v_ids
    from unnest(coalesce(p_place_ids, array[]::text[])) as id
   where id is not null and length(trim(id)) > 0;

  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then
    return;
  end if;

  if v_n > 60 then
    raise exception 'property_catalog request exceeds the 60-id limit (got %)', v_n
      using errcode = 'check_violation';
  end if;

  return query
    select c.place_id, c.property_name, c.neighborhood, c.location, c.location_keywords, c.zip,
           c.website_url, c.google_rating, c.property_image_url,
           c.tour_url, c.apply_url, c.availability_url,
           c.property_image_url_backup, c.current_special,
           c.send_commission, c.escort_commission, c.bonus_flat,
           c.google_review_count, c.verified_at,
           c.onebr_starting_rent, c.twobr_starting_rent, c.threebr_starting_rent,
           c.pricing_last_verified, c.current_special_checked_at
      from public.property_catalog c
     where c.place_id = any (v_ids);
end;
$$;

revoke all on function public.lb_property_catalog_by_ids(text[]) from public, anon;
grant execute on function public.lb_property_catalog_by_ids(text[]) to authenticated;

-- ── 2. lb_resolve_client_recommendations: same freshness rule ───────────────────────────────
-- Body identical to 20260923000005 except the one coalesce below.
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
                   case when coalesce(pc.current_special_checked_at, pc.verified_at)
                             > now() - interval '45 days' then pc.current_special end),
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
