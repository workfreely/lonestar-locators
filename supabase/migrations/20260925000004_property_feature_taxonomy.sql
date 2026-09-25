-- Property Intelligence structured feature taxonomy (searchable).
--
-- Building/Community Style is kept SEPARATE from Residential Types Offered
-- (multi-value). Furnished Units is modeled as an OFFERING/availability attribute,
-- not a residential type. All structured intelligence is stored as tri-state
-- (yes/no/unknown) attributes with per-attribute provenance + floorplan-specific
-- evidence; Unknown is never coerced to No. The curated 3 amenity + 3 location
-- keywords remain a SEPARATE ranking layer (not a replacement). Additive only —
-- no existing property value changes. Service-role only.

-- Controlled vocabulary (prevents key drift; seedable from the Canonical Field Inventory).
create table if not exists public.property_attribute_keys (
  attribute_key text primary key,
  category      text not null,   -- building_style|residential_type|offering|windows|views|outdoor|parking|amenity|finish|dimension
  label         text not null,
  value_kind    text not null default 'tristate' check (value_kind in ('tristate','text'))
);

-- One row per (property, attribute). Multi-value facts (e.g. several residential
-- types) are simply multiple rows for the same place_id.
create table if not exists public.property_attributes (
  place_id            text not null references public.property_catalog(place_id) on delete cascade,
  attribute_key       text not null references public.property_attribute_keys(attribute_key),
  value               text check (value in ('yes','no','unknown')),  -- for tristate keys
  value_text          text,                                          -- for text keys (ceiling height, style, color scheme)
  floorplan_specific  boolean not null default false,                -- true = only some floorplans
  source_type         text,
  source_reference    text,
  verification_status text check (verification_status in ('verified','inferred','unverified','unknown')),
  checked_at          timestamptz,
  merge_run_id        uuid,
  updated_at          timestamptz not null default now(),
  primary key (place_id, attribute_key)
);
comment on table public.property_attributes is
  'Structured, searchable property intelligence (tri-state + provenance). Residential types are multiple residential_type:* rows; building_style is a separate text attribute; furnished is offering:furnished_units. Unknown != No.';

-- Search indexes: attribute-first for filter intersects; place-first for a property''s full profile.
create index if not exists property_attributes_key_value_idx on public.property_attributes (attribute_key, value);
create index if not exists property_attributes_key_text_idx  on public.property_attributes (attribute_key, value_text);
create index if not exists property_attributes_place_idx     on public.property_attributes (place_id);

drop trigger if exists property_attributes_touch on public.property_attributes;
create trigger property_attributes_touch before update on public.property_attributes
  for each row execute function public.set_updated_at();

alter table public.property_attribute_keys enable row level security;
alter table public.property_attributes     enable row level security;

-- Curated 3 amenity keywords (separate ranking layer). location_keywords already
-- exists on property_catalog for the 3 location keywords.
alter table public.property_catalog
  add column if not exists amenity_keywords jsonb not null default '[]'::jsonb;
comment on column public.property_catalog.amenity_keywords is
  'Exactly up to 3 curated feature/amenity keywords for recommendation/ranking. A SEPARATE layer from property_attributes; does not replace structured intelligence. (location_keywords holds the 3 location keywords.)';

-- Seed the controlled vocabulary (idempotent).
insert into public.property_attribute_keys (attribute_key, category, label, value_kind) values
  ('building_style','building_style','Building / Community Style','text'),
  ('residential_type:apartments','residential_type','Apartments','tristate'),
  ('residential_type:townhome','residential_type','Townhomes','tristate'),
  ('residential_type:loft','residential_type','Lofts','tristate'),
  ('residential_type:split_level','residential_type','Split-Level Units','tristate'),
  ('residential_type:penthouse','residential_type','Penthouses','tristate'),
  ('residential_type:rental_home','residential_type','Rental Homes','tristate'),
  ('offering:furnished_units','offering','Furnished Units Available','tristate'),
  ('floorplan:townhome','offering','Townhome Floorplans Offered','tristate'),
  ('floorplan:split_level','offering','Split-Level Floorplans Offered','tristate'),
  ('windows:floor_to_ceiling','windows','Floor-to-Ceiling Windows','tristate'),
  ('windows:large','windows','Large / Oversized Windows','tristate'),
  ('features:high_ceilings','dimension','High Ceilings','tristate'),
  ('dimension:ceiling_height','dimension','Ceiling Height (published)','text'),
  ('views:skyline','views','Skyline / City Views','tristate'),
  ('views:downtown','views','Downtown Views','tristate'),
  ('views:water','views','Water Views','tristate'),
  ('views:hill_canyon_natural','views','Hill / Canyon / Natural Views','tristate'),
  ('outdoor:private_yard','outdoor','Private Yard','tristate'),
  ('outdoor:fenced_yard','outdoor','Fenced Yard','tristate'),
  ('outdoor:private_patio','outdoor','Private Patio','tristate'),
  ('outdoor:private_balcony','outdoor','Private Balcony','tristate'),
  ('outdoor:rooftop_terrace','outdoor','Rooftop Terrace','tristate'),
  ('outdoor:oversized_balcony','outdoor','Large / Oversized Balcony','tristate'),
  ('parking:attached_garage','parking','Attached Garage','tristate'),
  ('parking:detached_private_garage','parking','Detached / Private Garage','tristate'),
  ('parking:direct_access_garage','parking','Direct-Access Garage','tristate'),
  ('parking:reserved','parking','Reserved / Assigned Parking','tristate'),
  ('parking:ev_charging','parking','EV Charging','tristate'),
  ('parking:controlled_access','parking','Controlled-Access Parking','tristate'),
  ('amenity:infinity_pool','amenity','Infinity Pool','tristate'),
  ('amenity:rooftop_pool','amenity','Rooftop Pool','tristate'),
  ('amenity:resort_style_pool','amenity','Resort-Style Pool','tristate'),
  ('amenity:sky_deck','amenity','Sky Deck','tristate'),
  ('amenity:rooftop_lounge','amenity','Rooftop Lounge','tristate'),
  ('amenity:observation_deck','amenity','Observation Deck','tristate'),
  ('amenity:private_cabanas','amenity','Private Cabanas','tristate'),
  ('amenity:coworking','amenity','Co-Working Space','tristate'),
  ('amenity:private_offices','amenity','Private Offices','tristate'),
  ('amenity:golf_simulator','amenity','Golf Simulator','tristate'),
  ('amenity:sports_simulator','amenity','Sports Simulator','tristate'),
  ('amenity:pickleball','amenity','Pickleball','tristate'),
  ('amenity:dog_park','amenity','Dog Park','tristate'),
  ('amenity:dog_wash_pet_spa','amenity','Dog Wash / Pet Spa','tristate'),
  ('amenity:concierge','amenity','Concierge','tristate'),
  ('amenity:doorman','amenity','Doorman','tristate'),
  ('amenity:valet','amenity','Valet','tristate'),
  ('amenity:package_room','amenity','Package Lockers / Room','tristate'),
  ('finish:black','finish','Black Finishes / Hardware','tristate'),
  ('finish:stainless_appliances','finish','Stainless Appliances','tristate'),
  ('finish:quartz','finish','Quartz Countertops','tristate'),
  ('finish:granite','finish','Granite Countertops','tristate'),
  ('finish:gas_range','finish','Gas Range','tristate'),
  ('finish:kitchen_island','finish','Kitchen Island','tristate'),
  ('finish:built_in_desk','finish','Built-In Desk','tristate'),
  ('finish:smart_home','finish','Smart-Home Features','tristate'),
  ('finish:hardwood','finish','Hardwood / Wood-Style Flooring','tristate'),
  ('finish:color_scheme','finish','Finish / Color Scheme','text')
on conflict (attribute_key) do nothing;
