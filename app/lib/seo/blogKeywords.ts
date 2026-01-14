// app/lib/seo/blogKeywords.ts

/* ================================
   TAG DICTIONARIES
   ================================ */

export const PROPERTY_TAGS = [
  "High-Rise",
  "Luxury",
  "Townhome",
  "Penthouse",
  "Loft",
  "Apartment",
  "All Bills Paid",
  "New Construction",
  "Second Chance",
  "2nd Chance",
];

export const LIFESTYLE_TAGS = [
  "Downtown",
  "Walkable",
  "Pet-Friendly",
  "Gated",
  "Student Friendly",
];

export const CITY_TAGS = ["San Antonio", "Austin", "Dallas", "Houston"];

export const SAN_ANTONIO_AREAS = [
  "Downtown San Antonio",
  "Downtown SA",
  "Pearl District",
  "River Walk",
  "La Cantera",
  "The Rim",
  "La Cantera/The Rim",
  "The Dominion",
  "Stone Oak",
  "Alamo Ranch",
  "Southtown",
  "UTSA",
  "Medical Center",
  "Universal City",
  "Converse",
  "Westover Hills",
  "Alamo Heights",
];

export const AUSTIN_AREAS = [
  "Downtown Austin",
  "South Congress",
  "East Austin",
  "Zilker",
  "Mueller",
  "Domain",
  "Barton Creek",
  "Westlake",
  "Riverside",
  "North Loop",
];

export const DALLAS_AREAS = [
  "Downtown Dallas",
  "Uptown",
  "Deep Ellum",
  "Bishop Arts District",
  "Knox-Henderson",
  "Oak Lawn",
  "Design District",
  "Victory Park",
  "Lower Greenville",
  "Trinity Groves",
];

export const HOUSTON_AREAS = [
  "Downtown Houston",
  "Midtown",
  "Montrose",
  "The Heights",
  "Museum District",
  "River Oaks",
  "Medical Center",
  "Galleria",
  "Washington Ave",
  "EaDo",
];

export const SUBURBS = ["New Braunfels", "Boerne", "Schertz"];

/* ================================
   NORMALIZATION HELPERS
   ================================ */

// Normalize text so:
// high-rise === high rise === High-Rise
const normalize = (str: string) =>
  str
    .toLowerCase()
    .replace(/[-–—/]/g, " ")   // normalize hyphens & slashes
    .replace(/\s+/g, " ")      // collapse whitespace
    .trim();

/* ================================
   TAG RESOLVER
   ================================ */

export function resolveBlogTags({
  title = "",
  keywords = "",
  city = "",
}: {
  title?: string;
  keywords?: string;
  city?: string;
}) {
  const normalizedHaystack = normalize(`${title} ${keywords}`);

  const findMatch = (list: string[]) =>
    list.find((tag) =>
      normalizedHaystack.includes(normalize(tag))
    );

  /* ----------------------------
     1️⃣ PROPERTY / INTENT
     ---------------------------- */
  const property =
    findMatch(PROPERTY_TAGS) ||
    (normalizedHaystack.includes("high rise") ? "High-Rise" : undefined) ||
    (normalizedHaystack.includes("second chance") ? "Second Chance" : undefined) ||
    "Apartments";

  /* ----------------------------
     2️⃣ LIFESTYLE
     ---------------------------- */
  const lifestyle =
    findMatch(LIFESTYLE_TAGS) || "Luxury";

  /* ----------------------------
     3️⃣ LOCATION
     ---------------------------- */
  const location =
    findMatch([
      ...SAN_ANTONIO_AREAS,
      ...AUSTIN_AREAS,
      ...DALLAS_AREAS,
      ...HOUSTON_AREAS,
      ...SUBURBS,
    ]) ||
    CITY_TAGS.find((c) => c === city) ||
    city ||
    "Texas";

  return [property, lifestyle, location];
}
