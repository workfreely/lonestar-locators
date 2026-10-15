// BUILDING TYPE — the hand-authored classification for the library.
//
// Every entry was read out of the property's own research record. The classifier in
// buildingTypeProposals.ts is used ONLY to surface candidates with their evidence quoted; none of
// its output is written, because it read "FOUR floor plans" as four storeys and counted the
// negation "describes detached homes, not townhomes" as evidence of townhomes.
//
// ── THE RULES, APPLIED IN THIS ORDER ────────────────────────────────────────────────────────
//  1. A VERIFIED HEIGHT WINS FOR A TOWER. Parkside Residences has "SIXTEEN TWO-STOREY
//     TOWNHOME-STYLE UNITS ON FLOORS 15 THROUGH 34" — townhome-style homes inside a 43-storey
//     building. It is a High-Rise. The same goes for every tower whose penthouses or lofts are a
//     product line rather than the building.
//  2. 12+ storeys is High-Rise, 4-11 is Mid-Rise. Both need a count someone actually published.
//  3. UNIT FORM decides low-density communities: detached is Rental Home, attached (townhome,
//     duplex, triplex, duet) is Townhome, and both together is Mixed.
//  4. MIXED ONLY WHEN THE SOURCE SAYS SO — two home TYPES in one community, not two plan sizes.
//  5. BLANK OTHERWISE. 43 of 125 end here and that is the honest number: a plan count, a unit
//     size, a list of amenities or a building's name settle nothing.
import type { BuildingType } from "@/lib/social/buildingTypes"

export const BUILDING_TYPE_MANIFEST: { property: string; type: BuildingType; evidence: string }[] = [
  // ── HIGH-RISE — a published count of 12 storeys or more ───────────────────────────────────
  { property: "Dallas Power and Light Flats", type: "High-Rise", evidence: "stories = 19" },
  { property: "AMLI Fountain Place", type: "High-Rise", evidence: "stories = 45" },
  { property: "The National", type: "High-Rise", evidence: "stories = 51 (adaptive reuse of a 1965 tower)" },
  { property: "8119", type: "High-Rise", evidence: "stories = 15; '15-storey tower'" },
  { property: "Hanover Turtle Creek", type: "High-Rise", evidence: "'21 STOREYS'" },
  { property: "Pearl Rosemont", type: "High-Rise", evidence: "'13 STOREYS: nine residential floors above four levels of parking'" },
  { property: "East Quarter Residences", type: "High-Rise", evidence: "'20 STOREYS'" },
  { property: "The Victor", type: "High-Rise", evidence: "'39 or 40 STOREYS — the tallest for-rent high-rise in Victory Park'" },
  { property: "1400HiLine", type: "High-Rise", evidence: "'23 STOREYS'; 'the first luxury high-rise in the Dallas Design District'" },
  { property: "Victory Place", type: "High-Rise", evidence: "'25 STOREYS'" },
  { property: "Forme", type: "High-Rise", evidence: "'33 STOREYS'" },
  { property: "Maple Terrace Residences", type: "High-Rise", evidence: "stories = 22; 'Historic 1931 landmark tower'" },
  { property: "300 Main", type: "High-Rise", evidence: "stories = 32; San Antonio's tallest residential building" },
  { property: "Atelier Dallas Apartments", type: "High-Rise", evidence: "stories = 41" },
  { property: "The Hamilton", type: "High-Rise", evidence: "'26 STOREYS'" },
  { property: "The Floodgate", type: "High-Rise", evidence: "'16 storeys (San Antonio Report) or 17 (Point2)' — both well above 12; a third source's 35 is the outlier" },
  { property: "Selene Luxury Residences", type: "High-Rise", evidence: "'12 STOREYS', 146 homes including 14 penthouse suites" },
  { property: "Residences at Park District", type: "High-Rise", evidence: "'34 STOREYS (one listing says 32)'" },
  { property: "The Oliver Dallas", type: "High-Rise", evidence: "'19 STOREYS'" },
  { property: "LVL29 Apartments", type: "High-Rise", evidence: "'29 STOREYS'" },
  { property: "The Monarch HALL Park", type: "High-Rise", evidence: "'19 STOREYS (the South Tower)'" },
  { property: "Thirty-One Eleven Sunset", type: "High-Rise", evidence: "'SIXTEEN STOREYS — a high-rise tower in Lakeside Village'" },
  { property: "One Uptown", type: "High-Rise", evidence: "'20 STOREYS'" },
  { property: "Eastline Residences", type: "High-Rise", evidence: "'28 STOREYS (Walsh Group says 29)'" },
  { property: "Parkside Residences", type: "High-Rise", evidence: "'43 STOREYS'. Its sixteen townhome-style units sit on floors 15-34 — a product line inside a tower, not a townhome community" },
  { property: "Mondrian West Village", type: "High-Rise", evidence: "'20 OR 21 STOREYS — sources disagree'; either way above 12" },
  { property: "Novel Turtle Creek", type: "High-Rise", evidence: "'20 STOREYS on a 0.9-acre site'" },
  { property: "The Christopher", type: "High-Rise", evidence: "'THIRTY-ONE STOREYS'" },
  { property: "Aster", type: "High-Rise", evidence: "'22 STOREYS'" },
  { property: "Residences at 6G", type: "High-Rise", evidence: "'THE TALLEST BUILDING IN AUSTIN — 865 FEET over 66 STOREYS'" },
  { property: "Carlisle & Vine Apartments", type: "High-Rise", evidence: "'15 STOREYS, of which TEN are residential'" },
  { property: "Cirque Residences", type: "High-Rise", evidence: "'28 FLOORS'" },

  // ── MID-RISE — a published count of 4 to 11, or the words themselves ──────────────────────
  { property: "Eighteen25 Downtown", type: "Mid-Rise", evidence: "'Mid-rise by Allied Orion Group'" },
  { property: "Infinity at the Rim", type: "Mid-Rise", evidence: "'Luxury mid-rise within The Rim'" },
  { property: "Moda", type: "Mid-Rise", evidence: "'6 STOREYS'" },
  { property: "Forth at Navigation", type: "Mid-Rise", evidence: "'8 STOREYS'" },
  { property: "Ashton on West Dallas Apartments", type: "Mid-Rise", evidence: "'FOUR STOREYS, GARDEN-STYLE — not a high-rise'" },
  { property: "CO/OP Heights", type: "Mid-Rise", evidence: "stories = 4" },
  { property: "555 Ross Apartments", type: "Mid-Rise", evidence: "'FIVE residential floors WRAPPING a six-storey garage'" },
  { property: "Alexan Junction Heights", type: "Mid-Rise", evidence: "'FIVE-STOREY apartment building wrapped around a seven-level parking garage'" },
  { property: "The Davy", type: "Mid-Rise", evidence: "'FOUR STOREYS with elevator'" },
  { property: "Peregrine", type: "Mid-Rise", evidence: "'Gated MID-RISE'" },
  { property: "Jefferson Railhead", type: "Mid-Rise", evidence: "'MID-RISE'" },
  { property: "Us 1604", type: "Mid-Rise", evidence: "'FOUR STOREYS'" },
  { property: "Encore Grayson", type: "Mid-Rise", evidence: "'FIVE STOREYS'" },
  { property: "The Mark at Midtown", type: "Mid-Rise", evidence: "'FOUR STOREYS'" },
  { property: "Luxia Midtown Park Apartments", type: "Mid-Rise", evidence: "'FIVE FLOORS'" },
  { property: "Coopers Row", type: "Mid-Rise", evidence: "'SEVEN STOREYS'" },
  { property: "The Parc on Jackson", type: "Mid-Rise", evidence: "'SEVEN STOREYS'" },
  { property: "Montrose at Buffalo Bayou", type: "Mid-Rise", evidence: "'EIGHT FLOORS'. Its stored Penthouse Unit Type is untouched — a top-floor home in an eight-storey building is still a penthouse" },

  // ── TOWNHOME COMMUNITY — attached homes, one product ──────────────────────────────────────
  { property: "The Standard at Legacy", type: "Townhome Community", evidence: "'TWO-STOREY TOWNHOMES'" },
  { property: "Enclave at Mason Creek", type: "Townhome Community", evidence: "'192 three- and four-bedroom townhomes'; explicitly 'not a traditional apartment complex'" },
  { property: "Oxenfree Stonebriar", type: "Townhome Community", evidence: "'95 custom-designed TOWNHOMES'" },
  { property: "BB Living The Tribute", type: "Townhome Community", evidence: "'All two-storey townhome-style homes with yards and attached garages'" },
  { property: "Brentwood at the Reserve", type: "Townhome Community", evidence: "'1 to 3-bedroom rental TOWNHOMES'" },
  { property: "Caliza at The Loop", type: "Townhome Community", evidence: "'EVERY HOME IS A 3-BEDROOM, 2.5-BATH TOWNHOME — a single-product community'" },
  { property: "Providence Estates Townhomes", type: "Townhome Community", evidence: "'1, 2 and 3-bedroom TOWNHOMES'" },
  { property: "Frame Med Center", type: "Townhome Community", evidence: "'174 DUPLEX TOWNHOMES'" },
  { property: "Collection Schertz Station", type: "Townhome Community", evidence: "'DUPLEX-STYLE TOWNHOMES', build-to-rent. Duplex means ATTACHED, which is a townhome, not a detached rental home" },
  { property: "Collection at Boerne", type: "Townhome Community", evidence: "'two attached ~1,000 sq ft homes presenting as one ~2,000 sq ft house, front doors on opposite sides' — attached" },
  { property: "Farm Haus Luxury Rental Homes", type: "Townhome Community", evidence: "'TWO-STOREY DUPLEXES — build-for-rent'. The name says rental homes; the structure is attached" },
  { property: "Bluewater at Balmoral Townhomes", type: "Townhome Community", evidence: "'92 homes across SIXTEEN BUILDINGS', 'DUPLEX and TRIPLEX configurations' — attached" },

  // ── RENTAL HOME COMMUNITY — detached ──────────────────────────────────────────────────────
  { property: "Tricon Viridian", type: "Rental Home Community", evidence: "'46 SINGLE-FAMILY RENTAL HOMES — Tricon describes detached homes, not townhomes'" },
  { property: "Altura Luxury Rental Homes", type: "Rental Home Community", evidence: "'Detached RENTAL HOMES'" },
  { property: "Ascend on Potranco", type: "Rental Home Community", evidence: "'SINGLE AND DOUBLE-STOREY CASITA-STYLE HOMES' plus a state filing calling it 'SINGLE-FAMILY-FOR-RENT'" },
  { property: "Mission at Davis Ranch | Homes for Rent", type: "Rental Home Community", evidence: "'2, 3 and 4-bedroom rental homes'; the community's own name is Homes for Rent" },
  { property: "Los Cielos at Brooks Luxury Rentals", type: "Rental Home Community", evidence: "'FOR-RENT SINGLE-FAMILY DETACHED AND DUET HOMES'. Both products are low-density rental homes, so this is not a Mixed Community" },

  // ── MIXED COMMUNITY — two home TYPES, stated by the source ────────────────────────────────
  { property: "Artesia at Medina Valley", type: "Mixed Community", evidence: "'Mix of apartments, cottages and TOWNHOMES'" },
  { property: "NOVEL River Oaks by Crescent Communities", type: "Mixed Community", evidence: "'1, 2 and 3-bedroom apartments PLUS TOWNHOME-STYLE layouts'; Hoar: 'INCLUDING TWO-STORY TOWNHOUSES'" },
  { property: "The Louise Apartments", type: "Mixed Community", evidence: "apartments 'PLUS 32 TOWNHOMES averaging 1,902 sq ft'" },
  { property: "Greenway Village at the Link", type: "Mixed Community", evidence: "'215 private rental residences across DETACHED HOMES AND TOWNHOMES'" },
  { property: "Lumen Residences", type: "Mixed Community", evidence: "'AN APARTMENT AND TOWNHOME COMMUNITY'" },
  { property: "Prose Riviana", type: "Mixed Community", evidence: "'1 and 2-bedroom apartments ... PLUS 2 and 3-bedroom TOWNHOMES'" },
  { property: "Birdsong Apartments at Leon Springs", type: "Mixed Community", evidence: "'TWO-STOREY FARMHOUSE-STYLE COTTAGES AND TOWNHOMES'" },
  { property: "Birdsong Sonoma Ranch", type: "Mixed Community", evidence: "official site: 'two-story townhomes and farmhouse cottages'" },

  // ── APARTMENT COMMUNITY — stated outright, with no other home type and no height ──────────
  { property: "Cortland M-Line", type: "Apartment Community", evidence: "official site: 'one- and two-bedroom apartments'. 'Formerly M-Line Tower' is a NAME, not a published height" },
  { property: "Botanica Oak Hills", type: "Apartment Community", evidence: "'2-BEDROOM, 2-BATH TOWNHOME-STYLE APARTMENTS' — apartments styled as townhomes, which is an apartment community" },
]
