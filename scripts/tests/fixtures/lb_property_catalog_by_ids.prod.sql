CREATE OR REPLACE FUNCTION public.lb_property_catalog_by_ids(p_place_ids text[])
 RETURNS TABLE(place_id text, property_name text, neighborhood text, location text, location_keywords jsonb, zip text, website_url text, google_rating real, property_image_url text, tour_url text, apply_url text, availability_url text, property_image_url_backup text, current_special text, send_commission text, escort_commission text, bonus_flat text, google_review_count integer, verified_at timestamp with time zone, onebr_starting_rent numeric, twobr_starting_rent numeric, threebr_starting_rent numeric, pricing_last_verified date, current_special_checked_at timestamp with time zone, gift_card_status text, gift_card_amount numeric, gift_card_checked_at date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
