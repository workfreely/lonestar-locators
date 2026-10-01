// MATCHING REGRESSION FIXTURES — the known-good baseline's inputs.
//
// Purpose: before any commute-priority or area-limit experiment, capture enough
// real client shapes that a future change can be judged across ALL of them. The
// failure mode to prevent is a change that visibly improves one client while
// quietly degrading the others — which is invisible unless several are compared
// at once.
//
// DERIVED FROM REAL PRODUCTION LEADS, ANONYMISED. Names are replaced with scenario
// labels and the lead id is kept only as a provenance note; no contact details,
// no surnames, nothing a fixture does not need. The geography, budget, bed/bath,
// property type and commute anchor are REAL, because those are exactly what the
// matching algorithm consumes — inventing them would make the baseline worthless.
//
// Baseline commit: 3bdf0da  ·  tag matching-baseline-2026-10-01
// Deployed as:     locatorbeast-bibu2w1yh

export type MatchingFixture = {
  /** Scenario label — what this fixture exists to protect. */
  id: string
  /** Why this shape matters to the algorithm. */
  scenario: string
  /** Provenance: the real lead this was taken from (id only). */
  fromLeadId: number
  city: string
  /** leads.neighborhoods, in stored order. */
  neighborhoods: string[]
  /** leads.submarkets ("Nearby Areas"), in stored order. */
  submarkets: string[]
  desiredRent: string | null
  beds: string | null
  baths: string | null
  propertyType: string | null
  mustHaveAmenities: string[]
  /** leads.commute_anchor_label / _place_id — 0 or 1 structured anchor. */
  commuteLabel: string | null
  commutePlaceId: string | null
}

export const MATCHING_FIXTURES: MatchingFixture[] = [
  {
    id: "one-area",
    scenario: "A single clear desired area — the cleanest geographic signal there is.",
    fromLeadId: 84,
    city: "San Antonio",
    neighborhoods: ["Southtown"],
    submarkets: [],
    desiredRent: "$1,600–$1,700",
    beds: "2",
    baths: "2",
    propertyType: "Apartment",
    mustHaveAmenities: [],
    commuteLabel: "Fort Sam",
    commutePlaceId: "ChIJVVVVVbH1XIYRWGJNMlLVyoc",
  },
  {
    id: "two-areas",
    scenario: "Two desired neighborhoods — the shape the proposed 2-area cap would make the maximum.",
    fromLeadId: 58,
    city: "San Antonio",
    neighborhoods: ["Alamo Heights", "Stone Oak"],
    submarkets: [],
    desiredRent: "$1,500 - $1,900",
    beds: "2",
    baths: "2",
    propertyType: "Apartment",
    mustHaveAmenities: [],
    commuteLabel: null,
    commutePlaceId: null,
  },
  {
    id: "two-areas-plus-nearby",
    scenario:
      "The SAME lead as above, exactly as stored: two neighborhoods PLUS a Nearby Area. Three geographic signals today, and precisely the case a single shared limit of 2 would change.",
    fromLeadId: 58,
    city: "San Antonio",
    neighborhoods: ["Alamo Heights", "Stone Oak"],
    submarkets: ["Boerne"],
    desiredRent: "$1,500 - $1,900",
    beds: "2",
    baths: "2",
    propertyType: "Apartment",
    mustHaveAmenities: [],
    commuteLabel: null,
    commutePlaceId: null,
  },
  {
    id: "commute-vs-areas",
    scenario:
      "THE JERRY CASE. Three desired areas pulling west/southwest and a commute anchor ~9.9 miles north of their centroid (measured). The signals genuinely disagree, so this fixture is the one that will expose any commute-priority change. Also the only fixture carrying must-have amenities.",
    fromLeadId: 57,
    city: "San Antonio",
    neighborhoods: ["Downtown San Antonio", "Alamo Ranch", "Westover Hills"],
    submarkets: [],
    desiredRent: "$1,600–$1,700",
    beds: "1",
    baths: "1",
    propertyType: "Apartment",
    mustHaveAmenities: ["floor_to_ceiling_windows", "attached_garage", "detached_garage"],
    commuteLabel: "Six Flags",
    commutePlaceId: "ChIJN55XmxZlXIYRnc6SjJPAXyM",
  },
  {
    id: "broad-many-areas",
    scenario:
      "A select-everything client: 12 areas including the catch-all 'All of Houston'. THREE production leads share this exact shape, so it is not an outlier — it is what the form currently permits.",
    fromLeadId: 62,
    city: "Houston",
    neighborhoods: [
      "All of Houston", "Downtown Houston", "Midtown", "Montrose", "The Heights",
      "Medical Center", "Museum District", "River Oaks", "Galleria",
      "Washington Ave", "East Downtown (EaDo)", "Greenway / Upper Kirby",
    ],
    submarkets: [],
    desiredRent: "$900–$1,000",
    beds: "1",
    baths: "1",
    propertyType: "Apartment",
    mustHaveAmenities: [],
    commuteLabel: null,
    commutePlaceId: null,
  },
  {
    id: "no-areas",
    scenario:
      "No geographic preference at all — 8 of 26 production leads look like this. The market envelope is the ONLY geographic signal, so it is the control case for any geography change.",
    fromLeadId: 60,
    city: "San Antonio",
    neighborhoods: [],
    submarkets: [],
    desiredRent: "1500",
    beds: "1",
    baths: "1",
    propertyType: null,
    mustHaveAmenities: [],
    commuteLabel: null,
    commutePlaceId: null,
  },
  {
    id: "tight-budget",
    scenario:
      "Lead 62's real narrow band ($900–$1,000) against a 12-area Houston profile — the case where loosening a filter to reach 8 matches would be most tempting and most wrong.",
    fromLeadId: 62,
    city: "Houston",
    neighborhoods: ["Downtown Houston", "Midtown"],
    submarkets: [],
    desiredRent: "$900–$1,000",
    beds: "1",
    baths: "1",
    propertyType: "Apartment",
    mustHaveAmenities: [],
    commuteLabel: null,
    commutePlaceId: null,
  },
  {
    id: "broad-budget",
    scenario:
      "The SAME areas and bed/bath as tight-budget, with lead 82's wider real band — isolates budget from geography when comparing result counts. 'Open to All' property type is also real (lead 82).",
    fromLeadId: 82,
    city: "Houston",
    neighborhoods: ["Downtown Houston", "Midtown"],
    submarkets: [],
    desiredRent: "$1,500 - $1,900",
    beds: "1",
    baths: "1",
    propertyType: "Open to All",
    mustHaveAmenities: [],
    commuteLabel: null,
    commutePlaceId: null,
  },
]

/** The shape a baseline run records, so two runs can be diffed property-by-property. */
export type FixtureBaseline = {
  fixtureId: string
  /** Ranked place ids — ORDER is the thing most likely to regress silently. */
  rankedPlaceIds: string[]
  /** Parallel to rankedPlaceIds: the property names, for a readable diff. */
  rankedNames: string[]
  /** How many candidates survived every filter. */
  resultCount: number
  /** Per-property location verdict, so a geography change is attributable. */
  locationTones: Array<string | null>
}
