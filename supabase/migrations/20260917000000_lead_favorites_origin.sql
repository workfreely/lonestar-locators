-- Favorite provenance — separate "property identity" from "client favorite".
--
-- lead_favorites has always done double duty: it is BOTH the canonical property
-- registry that every property_id FK points at (start_application / check_application
-- / email_guest_card / confirm_lease / send_invoice on lead_next_actions, plus
-- leads.top_pick_favorite_id and lead_tours.property_id) AND the data source for the
-- visible "Favorite Properties" section. That conflation meant a property chosen only
-- to anchor an Applied/guest-card workflow appeared as if the client had favorited it.
--
-- `origin` records why a row exists WITHOUT introducing a second identity table:
--   • null / 'favorite'  = a genuine Client Favorite. Shown in Favorite Properties.
--   • 'application'       = a property-identity anchor created only for an Applied/
--                           guest-card workflow. Hidden from Favorite Properties; still
--                           the target of every property_id FK.
--
-- Backward compatible: existing rows keep origin = null and are therefore treated as
-- genuine favorites, so all current data and every FK behave exactly as before.
-- Promotion is ONE-WAY (application -> favorite, in place, same id) when a client later
-- genuinely favorites the property; a genuine favorite is never demoted to application.

alter table public.lead_favorites
  add column if not exists origin text
    check (origin is null or origin in ('favorite', 'application'));

comment on column public.lead_favorites.origin is
  'Provenance. null/''favorite'' = genuine Client Favorite (shown in Favorite Properties). ''application'' = property-identity anchor for an Applied/guest-card workflow (hidden from Favorite Properties, still referenced by property_id FKs). Promotion is one-way: never overwrite ''favorite'' with ''application''.';
