-- 5-property canonical-enrichment CANARY (applied to LB prod 2026-09-23).
-- Verified LB/master intelligence (management_company, send/escort commission,
-- current_special) + first-party property-site data (property_name, address,
-- city/state/zip, phone, leasing_email). COALESCE = fill-if-null, so re-running
-- never overwrites existing/verified values. Google-owned fields (review count,
-- authoritative rating) are NOT set here (pending server Places key). Image fields
-- are handled by the first-party image-enrichment pipeline, not this seed.
-- Recorded so the prod data change has a matching committed artifact.

update public.property_catalog set
  property_name = coalesce(property_name, $lb$Oasis at Stone Oak$lb$),
  market        = coalesce(market, $lb$San Antonio$lb$),
  address       = coalesce(address, $lb$23609 Canyon Golf Rd, San Antonio, TX 78260$lb$),
  city          = coalesce(city, $lb$San Antonio$lb$),
  state         = coalesce(state, $lb$TX$lb$),
  zip           = coalesce(zip, $lb$78260$lb$),
  management_company = coalesce(management_company, $lb$Willow Bridge Property Company FKA Lincoln Property Company$lb$),
  send_commission   = coalesce(send_commission, $lb$115%$lb$),
  escort_commission = coalesce(escort_commission, $lb$115%$lb$),
  bonus_flat        = coalesce(bonus_flat, NULL),
  current_special   = coalesce(current_special, $lb$100% off rent for 2 month(s) on a 12 mo lease Other Concessions: Receive up to 2 Months Free $1500 credit when you t...$lb$),
  phone         = coalesce(phone, $lb$(210) 718-0400$lb$),
  leasing_email = coalesce(leasing_email, NULL),
  source        = $lb$lb_master_verified+web_research$lb$,
  verified_at   = now(),
  updated_at    = now()
where place_id = $lb$ChIJl-eBQwCJXIYRN-FpPSfKfgM$lb$;

update public.property_catalog set
  property_name = coalesce(property_name, $lb$Los Cielos at Brooks$lb$),
  market        = coalesce(market, $lb$San Antonio$lb$),
  address       = coalesce(address, $lb$7722 Calle Coyote, San Antonio, TX 78235$lb$),
  city          = coalesce(city, $lb$San Antonio$lb$),
  state         = coalesce(state, $lb$TX$lb$),
  zip           = coalesce(zip, $lb$78235$lb$),
  management_company = coalesce(management_company, $lb$Greystar$lb$),
  send_commission   = coalesce(send_commission, $lb$100%$lb$),
  escort_commission = coalesce(escort_commission, $lb$100%$lb$),
  bonus_flat        = coalesce(bonus_flat, NULL),
  current_special   = coalesce(current_special, $lb$Look & Lease: Look & Lease to Receive a $200 Gift Card ends 12/8/2026 Gift Card: Look & Lease to Receive a $200 Gift Ca...$lb$),
  phone         = coalesce(phone, $lb$(726) 227-3845$lb$),
  leasing_email = coalesce(leasing_email, NULL),
  source        = $lb$lb_master_verified+web_research$lb$,
  verified_at   = now(),
  updated_at    = now()
where place_id = $lb$ChIJ6ZZL8y_3XIYRHuewIdFxMZw$lb$;

update public.property_catalog set
  property_name = coalesce(property_name, $lb$Preserve at Westover Hills$lb$),
  market        = coalesce(market, $lb$San Antonio$lb$),
  address       = coalesce(address, $lb$1530 Northwest Crossroads, San Antonio, TX 78251$lb$),
  city          = coalesce(city, $lb$San Antonio$lb$),
  state         = coalesce(state, $lb$TX$lb$),
  zip           = coalesce(zip, $lb$78251$lb$),
  management_company = coalesce(management_company, $lb$Willow Bridge Property Company FKA Lincoln Property Company$lb$),
  send_commission   = coalesce(send_commission, $lb$100%$lb$),
  escort_commission = coalesce(escort_commission, $lb$100%$lb$),
  bonus_flat        = coalesce(bonus_flat, NULL),
  current_special   = coalesce(current_special, $lb$100% off rent for 2 month(s) on a 12 mo lease Other Concessions: 8 WEEKS FREE.$lb$),
  phone         = coalesce(phone, $lb$(833) 749-5941$lb$),
  leasing_email = coalesce(leasing_email, NULL),
  source        = $lb$lb_master_verified+web_research$lb$,
  verified_at   = now(),
  updated_at    = now()
where place_id = $lb$ChIJoU0gkedcXIYRnqkBHBjzl9Q$lb$;

update public.property_catalog set
  property_name = coalesce(property_name, $lb$The Floodgate$lb$),
  market        = coalesce(market, $lb$San Antonio$lb$),
  address       = coalesce(address, $lb$143 East Commerce St, San Antonio, TX 78205$lb$),
  city          = coalesce(city, $lb$San Antonio$lb$),
  state         = coalesce(state, $lb$TX$lb$),
  zip           = coalesce(zip, $lb$78205$lb$),
  management_company = coalesce(management_company, $lb$RPM Living$lb$),
  send_commission   = coalesce(send_commission, $lb$50%$lb$),
  escort_commission = coalesce(escort_commission, $lb$75%$lb$),
  bonus_flat        = coalesce(bonus_flat, NULL),
  current_special   = coalesce(current_special, NULL),
  phone         = coalesce(phone, $lb$(830) 580-3926$lb$),
  leasing_email = coalesce(leasing_email, $lb$thefloodgate@rpmliving.com$lb$),
  source        = $lb$lb_master_verified+web_research$lb$,
  verified_at   = now(),
  updated_at    = now()
where place_id = $lb$ChIJVTzV8wRZXIYR5VofQF2y2yE$lb$;

update public.property_catalog set
  property_name = coalesce(property_name, $lb$Canyon Point$lb$),
  market        = coalesce(market, $lb$San Antonio$lb$),
  address       = coalesce(address, $lb$16550 Henderson Pass, San Antonio, TX 78232$lb$),
  city          = coalesce(city, $lb$San Antonio$lb$),
  state         = coalesce(state, $lb$TX$lb$),
  zip           = coalesce(zip, $lb$78232$lb$),
  management_company = coalesce(management_company, $lb$Churchill Forge Properties$lb$),
  send_commission   = coalesce(send_commission, $lb$125%$lb$),
  escort_commission = coalesce(escort_commission, $lb$125%$lb$),
  bonus_flat        = coalesce(bonus_flat, NULL),
  current_special   = coalesce(current_special, $lb$100% off rent for 1 month(s) on a 12 mo lease Look & Lease: PLUS UP TO an additional TWO WEEKS of FREE RENT When You LO...$lb$),
  phone         = coalesce(phone, NULL),
  leasing_email = coalesce(leasing_email, NULL),
  source        = $lb$lb_master_verified+web_research$lb$,
  verified_at   = now(),
  updated_at    = now()
where place_id = $lb$ChIJqRkNDzeKXIYRN-GXnUuVnqw$lb$;
