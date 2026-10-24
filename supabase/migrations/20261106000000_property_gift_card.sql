-- GIFT CARD, as first-class property data — additive only.
--
-- WHY A STATUS COLUMN AND NOT JUST AN AMOUNT. Three states have to survive a round trip:
--
--   unknown / not researched   nobody has looked
--   yes, with an amount        a confirmed offer
--   no                         somebody looked and there is no gift card
--
-- An amount alone cannot express the third. "amount is null" would collapse "nobody checked"
-- and "checked, and there is none" into one value, which is the same mistake the commission
-- model exists to prevent (a null send_commission means nobody checked; an explicit "0%" means
-- somebody did). So the fact itself gets a column, and NULL means unknown — consistent with
-- every other property_catalog column, where null already means "not researched".
--
-- WHY NOT PROVENANCE ALONE. property_field_provenance records WHO wrote a field and WHEN, which
-- is exactly what it is for — but it cannot represent a confirmed negative. A provenance row
-- against a null amount says "an owner touched this", not "an owner confirmed there is none".
-- The two are different claims and only one of them is a fact about the property.
--
-- WHY NOT THE ATTRIBUTE TABLE. property_attribute_keys already has a tristate vocabulary and
-- would have given yes/no/unknown for free, but it holds PHYSICAL features (private_yard,
-- attached_garage, high_ceilings). A promotion is not a feature of the building, and every
-- reader of the map card, the Companion and Social Beast would need a join none of them do
-- today. The vocabulary is borrowed; the location is not.
--
-- GIFT CARD IS NOT THE AGENT BONUS. bonus_flat is compensation paid to the locator and stays
-- exactly where it is, under Commission. This is a resident-facing promotion and lives beside
-- current_special. They are separate columns precisely so one can never overwrite the other.

alter table public.property_catalog
  add column if not exists gift_card_status text,
  add column if not exists gift_card_amount numeric(10,2),
  add column if not exists gift_card_checked_at date;

-- The vocabulary, enforced. NULL stays legal and MEANS unknown — it is not a fourth state and
-- there is deliberately no 'unknown' token, because two spellings of the same state is how a
-- column starts disagreeing with itself.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.property_catalog'::regclass and conname = 'property_catalog_gift_card_status_check'
  ) then
    alter table public.property_catalog
      add constraint property_catalog_gift_card_status_check
      check (gift_card_status is null or gift_card_status in ('yes', 'no'));
  end if;
end $$;

-- THE THREE STATES, ENFORCED AS ONE RULE. An amount exists if and only if the offer is
-- confirmed, which is both halves of the model in a single constraint:
--
--   status null  → amount must be null   (nobody checked — an amount would be a claim)
--   status 'no'  → amount must be null   (confirmed none — an amount would contradict it)
--   status 'yes' → amount must be present and positive (a confirmed offer has a value)
--
-- Worth enforcing in the database rather than only in the writer: a stray amount under a 'no'
-- would be read by a card as a live offer, and a 'yes' with no amount would render an empty
-- badge. NOT VALID so the constraint applies to new and updated rows without scanning the
-- existing table — every existing row has all three columns null and satisfies it anyway, so it
-- can be validated whenever convenient:
--   alter table public.property_catalog validate constraint property_catalog_gift_card_amount_check;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.property_catalog'::regclass and conname = 'property_catalog_gift_card_amount_check'
  ) then
    alter table public.property_catalog
      add constraint property_catalog_gift_card_amount_check
      check (
        case
          when gift_card_status = 'yes' then gift_card_amount is not null and gift_card_amount > 0
          else gift_card_amount is null
        end
      ) not valid;
  end if;
end $$;

comment on column public.property_catalog.gift_card_status is
  'Resident gift-card offer: null = not researched, ''yes'' = confirmed offer, ''no'' = confirmed none. NOT the agent bonus (see bonus_flat).';
comment on column public.property_catalog.gift_card_amount is
  'Dollar value of the resident gift card. Only meaningful when gift_card_status = ''yes''.';
comment on column public.property_catalog.gift_card_checked_at is
  'Date the gift-card status was last verified by an owner. Mirrors pricing_last_verified (date, not timestamptz).';

-- ── THE READ PATH ───────────────────────────────────────────────────────────────────────────
-- Columns alone are not enough: every card reads the catalog through lb_property_catalog_by_ids,
-- so three new columns are invisible until the function returns them. Additive, following the
-- precedent set by 20261028000000 (adding an OUT column changes the return type, so drop and
-- recreate; same signature, same SECURITY DEFINER / search_path / 60-id cap, grant restored).
--
-- 25 → 28 columns. Nothing existing is reordered or removed, so every current caller keeps
-- working unchanged; the client reader maps by NAME, not position.
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
  current_special_checked_at timestamptz,
  -- The GIFT CARD's own state and its OWN verification date. Separate from the special's,
  -- because the two incentives are confirmed on different days and each badge is judged by its
  -- own clock. bonus_flat stays above, where it always was: it is locator pay, not a resident
  -- incentive, and nothing on a card may render it as one.
  gift_card_status           text,
  gift_card_amount           numeric,
  gift_card_checked_at       date
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
           c.pricing_last_verified, c.current_special_checked_at,
           c.gift_card_status, c.gift_card_amount, c.gift_card_checked_at
      from public.property_catalog c
     where c.place_id = any (v_ids);
end;
$$;

grant execute on function public.lb_property_catalog_by_ids(text[]) to anon, authenticated;

-- ── THE CLIENT-FACING READ PATH ─────────────────────────────────────────────────────────────
-- lb_resolve_client_recommendations is the ONLY way a property reaches the /r page, so the gift
-- card has to travel through it too. Verbatim re-creation of the 20261101000000 definition plus
-- four keys; every existing key, join and ordering is byte-identical.
--
-- NO AGE RULE, AND NO INVENTED DATES. Two things change here, both removals:
--
--   • the 45-day window around the CANONICAL special fallback is dropped, matching the cards;
--   • no "currentSpecialCheckedAt" is sent, because there is no honest value for one. A frozen
--     snapshot has no verification date of its own, and the candidates — the share's created_at,
--     or the property's general verified_at — record when the LIST WAS BUILT or when the ROW was
--     touched. Neither is anyone confirming an offer.
--
-- A special leaves a client page when an agent changes it to No Special or clears it. The gift
-- card's checked_at is likewise not sent: it gates nothing, and is shown as an age in the
-- agent-facing editor, which is where knowing it is useful.
--
-- THE GIFT CARD IS CANONICAL-ONLY, and deliberately so. Share snapshots predate the column, so
-- there is nothing frozen to prefer; it is read live from the catalog with its OWN checked-at
-- date. bonus_flat is not exposed here and never will be — a client page must never learn what
-- the locator is paid.
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
                 -- Snapshot-first; fall back to the canonical special when the snapshot has
                 -- none. NO AGE CUTOFF — the 45-day window that used to wrap this fallback is
                 -- gone, for the same reason it is gone from the cards: a promotion does not
                 -- stop existing because nobody re-checked it, and blanking one made a real
                 -- concession look like a property that had none. A special leaves the page
                 -- when an agent changes it to No Special or clears it, which normalizeShortSpecial
                 -- already renders as nothing.
                 'currentSpecial', coalesce(
                   nullif(btrim(i.current_special), ''),
                   pc.current_special),
                 'giftCardStatus', pc.gift_card_status,
                 'giftCardAmount', pc.gift_card_amount,
                 'googleRating', i.google_rating,
                 'washerDryer', i.washer_dryer_status,
                 'averageRent', public.lb_compose_average_rent(
                                  i.avg_rent_quoted_rent, i.avg_rent_concession_weeks,
                                  i.avg_rent_concession_months, i.avg_rent_lease_months,
                                  i.avg_rent_show),
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

grant execute on function public.lb_resolve_client_recommendations(text) to anon, authenticated;
