-- Reverses 20261115000000_washer_dryer_by_ids.sql and nothing else.
-- Nothing else referenced this function, so dropping it removes the whole change. The card
-- falls back to the lookup returning nothing, which renders no washer/dryer line.
drop function if exists public.lb_property_washer_dryer_by_ids(text[]);
