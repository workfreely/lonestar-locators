// VERIFIED GEOGRAPHIC ENRICHMENT — the approved manifest, authored by hand, one entry per property.
//
// ── WHAT THIS FILE IS ───────────────────────────────────────────────────────────────────────
// The complete, reviewed list of geographic field changes approved for the Social Beast library.
// Nothing is computed from prose here: every value below was read out of the property's own
// social_property_research.stable.geography block and then JUDGED against four rules the operator
// set. The writer (applyGeoManifest.ts) refuses to write anything that is not in this file.
//
// ── THE FOUR RULES, AND WHY ENTRIES LOOK THE WAY THEY DO ────────────────────────────────────
//  1. MARKET IS SACRED. The library has exactly five market categories and they are how the
//     operator finds anything. A suburb does NOT move a video out of its metro: Plano, Frisco,
//     Irving and Arlington stay Dallas; Katy and Atascocita stay Houston; Schertz and Boerne stay
//     San Antonio. `market` appears below exactly ONCE — Enclave at Mason Creek, which was filed
//     under Dallas while sitting in Katy, and which the operator approved by name.
//  2. A CITY IN THE AREA FIELD IS NOT AN ERROR. "Plano", "Arlington", "Katy", "Allen" were read as
//     bugs in an earlier pass. They are not: the area field is the broader-area layer, and for a
//     suburban property the suburb IS that layer. Those entries therefore carry `area: null`
//     (= leave it alone) and only add the district the research established.
//  3. NEVER OVERWRITE A BROADER AREA WITH A NARROWER ONE. Where the specific name equals the area
//     it would replace (The Willow → Deep Ellum, Park at Stone Oak → Stone Oak), the district is
//     left blank: it would add nothing and cost the broader label.
//  4. A DISTRICT IS A PLACE NAME, NOT A LOCATION. The research prose produced plenty of true
//     statements that are not district names — "Ridgeview Drive corridor", "Noel Road at
//     Interstate 635", "Castroville area / Medina Valley ISD", "Next to Discovery Green". Streets,
//     corridors, ZIPs, school districts and landmarks are all rejected, and the property appears
//     in the `flagged` list at the bottom instead of getting a value it cannot support.
//
// A replacement AREA value is only ever (a) a canonical option from the market's own bank in
// lib/markets/catalog.ts, or (b) the research record's own `broaderArea` string verbatim. Nothing
// here is a name invented at write time.

/** One property. `area: null` means LEAVE THE STORED VALUE; `district: null` means leave blank. */
export type GeoEntry = {
  property: string          // social_property_research.property_name — must match exactly one record
  area: string | null
  district: string | null
  market?: string           // present on ONE entry only; the writer demands a per-entry approval flag
  marketApproved?: true
  // A video whose post is already PUBLISHED or READY is skipped by default. This flag is the only
  // way past that, and it exists for exactly one property the operator approved by name. Note what
  // it does and does not do: it corrects the VIDEO's own geography columns. The published post rows
  // — caption, hashtags, overlay headline, template — are never touched by this writer at all.
  publishedApproved?: true
  why: string
}

export const GEO_MANIFEST: GeoEntry[] = [
  // ── BARE "Downtown" → THE MARKET'S CANONICAL DOWNTOWN ─────────────────────────────────────
  // The stored value is RIGHT and only unqualified. Normalising it is what makes a Dallas
  // downtown video and a Houston downtown video stop sharing one meaningless label.
  { property: "Dallas Power and Light Flats", area: "Downtown Dallas", district: null,
    why: "Downtown Dallas verified; the sub-district is not — 222 Browder is not confirmed inside the Main Street District." },
  { property: "The National", area: "Downtown Dallas", district: null,
    why: "1401 Elm is in the downtown core but one block north of the Main Street District's Elm Street boundary." },
  { property: "Atelier Dallas Apartments", area: "Downtown Dallas", district: "Dallas Arts District",
    why: "The case the district field was built for: Downtown Dallas AND the Arts District are both true (1801 N Pearl St)." },
  { property: "AMLI Fountain Place", area: "Downtown Dallas", district: "Dallas Arts District",
    why: "Same overlap as Atelier — 1800 N Field St is downtown and in the Arts District." },
  { property: "Eighteen25 Downtown", area: "Downtown Houston", district: null,
    why: "1825 San Jacinto St, 77002 — the downtown core." },
  { property: "Elev8", area: "Downtown Houston", district: "Skyline District",
    why: "Greystar's own copy says Downtown Houston; the Skyline District is the named sub-district." },
  { property: "The Rice", area: "Downtown Houston", district: null,
    why: "On the METRO Rail line by the convention centre. 'Downtown core' is not a district name." },
  { property: "City View Lofts", area: "Downtown Houston", district: null,
    why: "Downtown Houston confirmed; AptAmigo's 'Downtown/Midtown' is a two-name straddle, not a district." },
  { property: "Parkside Residences", area: "Downtown Houston", district: null,
    why: "Area was empty. Discovery Green is a LANDMARK, not the property's district." },
  { property: "300 Main", area: "Downtown San Antonio", district: null,
    why: "N Main Ave at E Travis St, 78205 — the downtown core. The intersection is not a district." },
  { property: "The Floodgate", area: "Downtown San Antonio", district: "River Walk",
    why: "Directly on the River Walk, between the Witte Building and the Esquire Tavern." },

  // ── THE STORED AREA IS WRONG, AND A CANONICAL OPTION FITS ─────────────────────────────────
  { property: "The Hamilton", area: "Deep Ellum", district: null,
    why: "Stored bare 'Downtown' is wrong — inside THE EPIC in Deep Ellum, which is canonical." },
  { property: "Hanover Turtle Creek", area: "Oak Lawn", district: "Turtle Creek",
    why: "Stored 'Downtown' is wrong. 2525 Turtle Creek Blvd is Oak Lawn; Turtle Creek is the district." },
  { property: "3700M", area: "Uptown", district: "West Village",
    why: "Greystar's own wording: Uptown, West Village. Not Downtown." },
  { property: "The Victor", area: "Victory Park", district: null,
    why: "Stored 'Downtown' is wrong; Victory Park is canonical and is the whole answer." },
  { property: "Moda", area: "Victory Park", district: null,
    why: "Area was empty. Walking distance to the Victory Park DART station." },
  { property: "Victory Place", area: "Victory Park", district: null,
    why: "Area was empty. Across from American Airlines Center." },
  { property: "Cirque Residences", area: "Victory Park", district: null,
    why: "Stored 'Downtown Dallas' is wrong — sources say Victory Park, which is canonical." },
  { property: "1400HiLine", area: "Design District", district: null,
    why: "Stored 'Downtown' is wrong. Design District is canonical; 'Hi Line Drive' is a street." },
  { property: "Maple Terrace Residences", area: "Uptown", district: null,
    why: "Stored 'Downtown Dallas' is wrong — 3003 Maple Ave at Wolf St is Uptown." },
  { property: "Mondrian West Village", area: "Uptown", district: "West Village",
    why: "Stored 'Downtown Dallas' is wrong. The tower rises above the West Village district in Uptown." },
  { property: "The Christopher", area: "Uptown", district: "The Union",
    why: "Stored 'Downtown Dallas' is wrong — THE UNION is in Uptown." },
  { property: "Broadstone Sora", area: "Uptown", district: null,
    why: "Area was empty. 3324 McKinney Ave is Uptown; 'McKinney Avenue corridor' is not a district." },
  { property: "Cortland M-Line", area: "Uptown", district: null,
    why: "Area was empty. Uptown is canonical; the M-Line corridor is a streetcar route, not a district." },
  { property: "Carlisle & Vine Apartments", area: "Uptown", district: null,
    why: "Area was empty. 'Carlisle Street' is a street, not a district." },
  { property: "Residences at Park District", area: "Uptown", district: null,
    why: "Area was empty. Klyde Warren Park is a LANDMARK and the developer claims a four-way overlap." },
  { property: "Cantabria at Turtle Creek", area: "Oak Lawn", district: null,
    why: "Stored 'Downtown Dallas' is wrong. 'Hood Street' is a street, not a district." },
  { property: "Aster", area: "Oak Lawn", district: null,
    why: "Stored 'Downtown Dallas' is wrong — Turtle Creek / Oak Lawn. The Congress Ave locator is not a district." },
  { property: "Novel Turtle Creek", area: "Oak Lawn", district: null,
    why: "Area was empty. The NAME says Turtle Creek; every source says Oak Lawn." },
  { property: "The Oliver Dallas", area: "Knox-Henderson", district: null,
    why: "Area was empty. Knox-Henderson is canonical; THE CENTRAL is the development, not a district." },
  { property: "The 23", area: "Victory Park", district: null,
    why: "Stored bare 'Downtown' is wrong; Victory Park is the best-supported name." },
  { property: "555 Ross Apartments", area: "Downtown Dallas", district: "West End",
    why: "Area was empty. Both are true — downtown, and the West End historic district." },
  { property: "East Quarter Residences", area: "Downtown Dallas", district: "East Quarter",
    why: "Area was empty. An eight-block named district inside downtown." },
  { property: "24Eleven Washington", area: "Washington Ave", district: null,
    why: "Stored 'Downtown' is wrong. Washington Ave is canonical and matches 77007." },
  { property: "Maxwell Memorial", area: "Washington Ave", district: "Rice Military",
    why: "Area was empty. Washington Ave is the canonical option; Rice Military is the specific district." },
  { property: "Forth at Navigation", area: "East Downtown (EaDo)", district: "Second Ward",
    why: "Stored 'Downtown' is wrong. EaDo is canonical; Second Ward is the district." },
  { property: "Forme", area: "Museum District", district: null,
    why: "Stored 'Downtown' is wrong — walking distance to the MFA and Hermann Park." },
  { property: "The Museum Tower Museum District Apartments", area: "Museum District", district: null,
    why: "Area was empty. Museum District is canonical and is the whole answer." },
  { property: "NOVEL River Oaks by Crescent Communities", area: "River Oaks", district: null,
    why: "Stored 'Downtown' is wrong. River Oaks is canonical (Willowick at Westheimer)." },
  { property: "Pearl Rosemont", area: "Montrose", district: null,
    why: "Area was empty. The official site says 'Houston's Montrose District'." },
  { property: "Modera Waugh", area: "Montrose", district: null,
    why: "Area was empty. 716 Waugh Dr, 77019. 'Neartown' is a synonym for Montrose, not a sub-district." },
  { property: "Luminary Residences", area: "Midtown", district: null,
    why: "Stored 'Downtown Houston' is wrong — Midtown, which is canonical." },

  // ── THE STORED AREA IS WRONG AND NO CANONICAL OPTION FITS ─────────────────────────────────
  // The replacement is the research record's own verified broaderArea, verbatim.
  { property: "EastEnder", area: "East Dallas", district: "Old East Dallas",
    why: "Stored 'Downtown' is wrong, and explicitly NOT Deep Ellum. No canonical option covers East Dallas." },
  { property: "Expo Park | Lofts", area: "East Dallas", district: "Exposition Park",
    why: "Stored 'Downtown' is wrong. Exposition Park sits between Deep Ellum and Fair Park." },
  { property: "Hazel by the Galleria", area: "Far North Dallas", district: null,
    why: "Stored 'Galleria' is a HOUSTON canonical option on a Dallas video, and a mall name. The City of Dallas's 'Dallas Midtown' is contradicted by two listings." },
  { property: "The Sevens", area: "North Dallas", district: null,
    why: "Area was empty. The neighbourhood name is contested three ways (Vickery Meadow / Preston Hollow / Midtown)." },
  { property: "Hanover Preston Hollow", area: "North Dallas", district: "Preston Hollow",
    why: "Area was empty. A real Dallas neighbourhood here (6255 W Northwest Hwy), unlike The Sevens where it is marketing." },
  { property: "Los Cielos at Brooks Luxury Rentals", area: "Southeast San Antonio", district: "Brooks",
    why: "Stored 'Southtown' is wrong — Brooks is the former air force base redevelopment, miles south-east." },
  { property: "Birdsong Apartments at Leon Springs", area: "Far Northwest San Antonio", district: "Leon Springs",
    why: "Stored 'The Dominion' is an ADJACENT but separate gated community." },
  { property: "Mission at Davis Ranch | Homes for Rent", area: "Far Northwest San Antonio", district: "Davis Ranch",
    why: "Stored 'Westover Hills' is 78251; this address is 78254, several miles north-west." },
  { property: "Istana at Wurzbach", area: "Northwest San Antonio", district: null,
    why: "Stored 'Medical Center' is 78229; this address is 78238 near Leon Valley. 'Wurzbach Road' is a street." },
  { property: "Caliza at The Loop", area: "Far North Central San Antonio", district: null,
    why: "Stored 'Stone Oak' is further north-west; 78247 on Loop 1604 E is Far North Central." },
  { property: "Lumen Residences", area: "Northwest San Antonio", district: "Champions Gate",
    why: "Stored 'UTSA' has the right ZIP but no source places it near the campus, and walk scores are low." },
  { property: "Ascend on Potranco", area: "Far West San Antonio", district: null,
    why: "Stored 'Northwest' is imprecise — sources say Far West. 'Potranco Road corridor' is a road." },
  { property: "Arbolada", area: "Far Northwest San Antonio", district: null,
    why: "Stored 'La Cantera/The Rim' is adjacent; 78255 is further out. 'Babcock Road corridor' is a road." },
  { property: "Freestone Ladera", area: "Far West San Antonio", district: "Ladera",
    why: "Area was empty. Ladera is the master-planned community; 'Medina Valley' on Redfin is a SCHOOL DISTRICT." },
  { property: "Emerald Townes", area: "Far North Central San Antonio", district: null,
    why: "Area was empty. 'Loop 1604 at Bulverde Road' is an intersection; another video wrongly says Stone Oak." },
  { property: "ALARO", area: "Far Northwest San Antonio", district: null,
    why: "Area was empty. 'Culebra / Northside ISD' is a road and a SCHOOL DISTRICT." },
  { property: "Lenox Grandview", area: "Northwest San Antonio", district: null,
    why: "Area was empty — Greystar's own wording. AptAmigo's 'near La Cantera and The Rim' is NEARBY-LANDMARK framing." },
  { property: "Iron Rock Ranch", area: "South Austin", district: null,
    why: "Area was empty. No canonical Austin option covers South Austin; 'West Slaughter Lane corridor' is a road." },

  // ── AREA IS CORRECT AND STAYS; ONLY THE DISTRICT IS ADDED ─────────────────────────────────
  // Every suburb-as-area entry lives here. The suburb IS the broader-area layer.
  { property: "One Rangers Way", area: null, district: "Entertainment District",
    why: "Arlington stays as the area; the Entertainment District beside Globe Life Field is the district." },
  { property: "LVL29 Apartments", area: null, district: "Legacy West",
    why: "Plano stays as the area; Legacy West is the district." },
  { property: "Instrata at Legacy West", area: null, district: "Legacy West",
    why: "Plano stays as the area; Legacy West is the district." },
  { property: "The Louise Apartments", area: null, district: "Viridian",
    why: "Arlington stays; Viridian is the master-planned community — explicitly NOT the Entertainment District." },
  { property: "Tricon Viridian", area: null, district: "Viridian",
    why: "Arlington stays; the same Viridian district as The Louise." },
  { property: "The Mustang", area: null, district: "Las Colinas",
    why: "Irving stays; Las Colinas is the master-planned waterfront district." },
  { property: "Peregrine", area: null, district: "Las Colinas",
    why: "Irving stays; the sky lounge overlooks Las Colinas." },
  { property: "The Monarch HALL Park", area: null, district: "Hall Park",
    why: "Frisco stays; the tower fronts Hall Park's central park." },
  { property: "Oxenfree Stonebriar", area: null, district: "Stonebriar",
    why: "Frisco stays; Stonebriar at Warren Pkwy and Ohio Dr." },
  { property: "Jefferson Railhead", area: null, district: "Frisco Railhead",
    why: "Frisco stays; Frisco Railhead is the 80-acre mixed-use development." },
  { property: "Greenway Village at the Link", area: null, district: "The Link",
    why: "Frisco stays; The Link at PGA Parkway is the development name." },
  { property: "BB Living The Tribute", area: null, district: "The Tribute",
    why: "The Colony stays; The Tribute is the master-planned community." },
  { property: "Thirty-One Eleven Sunset", area: null, district: "Lakeside Village",
    why: "Flower Mound stays; Lakeside Village is the development the tower sits in." },
  { property: "Brentwood at the Reserve", area: null, district: "The Reserve",
    why: "Mansfield stays; The Reserve is the community." },
  { property: "The Davy", area: null, district: "The Grid",
    why: "Stafford stays; The Grid is the development on the former Texas Instruments campus." },
  { property: "Prose Riviana", area: null, district: "Riviana",
    why: "Katy stays, and so does the Houston market — unlike Enclave, this one was filed correctly." },
  { property: "Bluewater at Balmoral Townhomes", area: null, district: "Balmoral",
    why: "Atascocita stays; Balmoral is the Land Tejas master-planned development." },
  { property: "Birdsong Sonoma Ranch", area: null, district: "Sonoma Ranch",
    why: "Helotes stays; Sonoma Ranch is the community." },
  { property: "Allora Kinder Ranch", area: null, district: "Kinder Ranch",
    why: "Stone Oak stays (78260, as with Oasis Stone Oak); Kinder Ranch is the community. NOT Bulverde." },
  { property: "The Tobin Estate", area: null, district: "Oakwell",
    why: "'Alamo Heights' is a marketing area for 78218 and is preserved as stored; Oakwell is the address's own district." },
  { property: "Alexan Junction Heights", area: null, district: "The Heights",
    why: "Area was empty and Redfin files the address under BOTH The Heights and Washington Ave; the district records the better-named one without choosing an area." },
  { property: "Eastline Residences", area: null, district: "Eastline District",
    why: "Area left empty — 'East Dallas / Mockingbird' is a two-name straddle. The building anchors the named Eastline District." },
  { property: "Tin Top Flats at the Creamery", area: null, district: "Tobin Hill",
    why: "Tobin Hill is certain; the area is NOT — 'Midtown / Near North San Antonio' is a straddle and no canonical option fits. Area held for review." },
  { property: "Coopers Row", area: null, district: "The Pearl",
    why: "The Pearl is certain; the area replacement is a straddle, so 'Downtown San Antonio' is held for review." },
  { property: "Encore Grayson", area: null, district: "Government Hill",
    why: "Government Hill (78208) is certain; the area replacement is a straddle, so the stored value is held for review." },
  { property: "Residences at Grayson Heights", area: null, district: "Government Hill",
    why: "Government Hill (78208) is certain; same held area as Encore Grayson." },
  { property: "Altura Luxury Rental Homes", area: null, district: "Northeast Valley Forge",
    why: "'Live Oak' stays as the area. Northeast Valley Forge is the indexed neighbourhood for Toepperwein Rd, 78233." },
  { property: "YardHomes Juniper Pointe", area: null, district: "Alamo Ranch",
    why: "'Far West' is accurate as the broader area and stays; Alamo Ranch is the specific district." },
  { property: "The Residences at Landon Ridge", area: null, district: "Landon Ridge",
    why: "'Far West' stays; Landon Ridge is the community (78253)." },
  { property: "Botanica Oak Hills", area: null, district: "Oak Hills",
    why: "'Medical Center' is correct for 78229 and stays; Oak Hills is the specific neighbourhood." },
  { property: "Tribute at the Rim", area: null, district: "The Rim",
    why: "'La Cantera/The Rim' stays; the district pins it to The Rim half of that pair." },
  { property: "Berkshire at the Rim Apartments", area: null, district: "The Rim",
    why: "'La Cantera/The Rim' stays; direct pedestrian access to The Rim." },
  { property: "Reveal Skyline Apartments", area: null, district: "La Cantera",
    why: "'La Cantera/The Rim' stays; the district pins it to the La Cantera half." },
  { property: "Ascent Cresta Bella", area: null, district: "Cresta Bella",
    why: "'La Cantera/The Rim' is adjacent and stays; Redfin indexes a Cresta Bella neighbourhood at this address." },
  { property: "The Mark at Midtown", area: null, district: "Midtown Park",
    why: "'Midtown' stays; Midtown Park is the development on the east side of N Central Expwy." },
  { property: "Luxia Midtown Park Apartments", area: null, district: "Midtown Park",
    why: "'Midtown' stays; the same Midtown Park development." },

  // ── THE OTHER OPERATOR-APPROVED CORRECTION ───────────────────────────────────────────────
  // The worst stored value in the library: a Dallas video labelled with a San Antonio downtown.
  // Its one video carries two PUBLISHED posts, so it needs the explicit publishedApproved flag.
  { property: "Selene Luxury Residences", area: "Uptown", district: null, publishedApproved: true,
    why: "Stored area 'Downtown San Antonio' is from the wrong metro entirely. The property is in Uptown Dallas, steps from Klyde Warren Park; 'Uptown' is canonical and the Dallas market is unchanged. Operator-approved by name." },

  // ── THE ONE APPROVED MARKET CHANGE ────────────────────────────────────────────────────────
  // Katy is in the Houston metro. This is the only entry carrying a market, and the writer
  // requires marketApproved on any entry that does.
  { property: "Enclave at Mason Creek", market: "Houston", marketApproved: true,
    area: null, district: "Mason Creek",
    why: "Filed under Dallas while sitting at 21455 Merchants Way, Katy, TX 77449 — the Houston metro. 'Katy' stays as the area; Mason Creek is the district. Operator-approved by name." },
]

/** Properties deliberately left ALONE, with the reason. Reported, never written. */
export const FLAGGED: { property: string; reason: string }[] = [
  { property: "Ashton on West Dallas Apartments", reason: "Stored 'Downtown' is wrong, but the sources split three ways — Fourth Ward, Montrose, Midtown. No supported replacement." },
  { property: "8119", reason: "Area empty; broader area is a 'Preston Hollow / Park Cities' straddle. Its research record also carries market 'Dallas–Fort Worth', which is NOT one of the five library markets — see the report." },
  { property: "Us 1604", reason: "Area empty; no canonical option covers the North Loop 1604 corridor, and the only district text is a drive-time to the airport." },
  { property: "Seven17 Lehman Apartments", reason: "Area empty; 'Inwood' rests on a single aggregator. Also the library's one READY post — held on both counts." },
  { property: "La Tierna", reason: "Area is accurate; the district is a 'La Cantera / Chase Hill' straddle." },
  { property: "Infinity at the Rim", reason: "Area is accurate; the district text resolves to Talavera Ridge beside The Rim, which is already the stored area." },
  { property: "Montrose at Buffalo Bayou", reason: "Area is accurate; 'Montrose / Neartown' is a synonym pair, not a sub-district." },
  { property: "Residences at 6G", reason: "Area is accurate; 'Sixth and Guadalupe' is the tower's own name and an intersection." },
  { property: "Artesia at Medina Valley", reason: "Area is accurate; the district text is 'Castroville area / Medina Valley ISD' — a SCHOOL DISTRICT." },
  { property: "Merrick On Midway", reason: "'Farmers Branch' stays; 'Midway Road corridor' is a road, not a district." },
  { property: "Watterscape Urban Residential", reason: "'Allen' stays; 'Ridgeview Drive corridor' is a road, not a district." },
  { property: "Casona", reason: "'Grand Prairie' stays; no finer district is established for this address." },
  { property: "Farm Haus Luxury Rental Homes", reason: "'UTSA' is defensible (78249, UTSA named as a nearby employer); 'Hausman Road' is a street." },
  { property: "Oasis Stone Oak", reason: "'Stone Oak' is accurate for 78260; 'Canyon Golf Road' is a street." },
  { property: "Park at Stone Oak Apartments", reason: "'Stone Oak' is accurate and the district would duplicate it." },
  { property: "The Standard at Legacy", reason: "'Stone Oak' is accurate and the district would duplicate it." },
  { property: "The Willow", reason: "'Deep Ellum' is accurate and the district would duplicate it." },
  { property: "CO/OP Heights", reason: "'The Heights' is accurate and the district would duplicate it." },
  { property: "Providence Estates Townhomes", reason: "'Medical Center' is accurate; the district text repeats it." },
  { property: "Frame Med Center", reason: "'Medical Center' is accurate; the district text repeats it." },
  { property: "The Sinclair", reason: "'Downtown Dallas' is accurate (405 N Ervay); no finer district established." },
  { property: "The Drakestone Apartments", reason: "'Downtown Dallas' is accurate; 'Main Street' is a street." },
  { property: "The Parc on Jackson", reason: "'Downtown Dallas' is accurate; the district text is a street corner." },
  { property: "One Uptown", reason: "'Uptown' is accurate; the district text is an intersection." },
  { property: "Remi Apartments", reason: "'Uptown' is accurate; 'Ivan Street' is a street. Also carries published posts." },
  { property: "Collection Schertz Station", reason: "'Schertz' is a canonical San Antonio submarket and is accurate; no district established." },
  { property: "Collection at Boerne", reason: "'Boerne' is a canonical San Antonio submarket and is accurate; no district established." },
]
