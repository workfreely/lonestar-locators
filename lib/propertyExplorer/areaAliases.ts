/**
 * CURATED AREA ALIASES — accepted catalog spellings for a client's chosen area.
 *
 * WHAT PROBLEM THIS SOLVES. assessLocationFit's keyword tier (rank 2) compares a
 * client's saved area label to a property's `location_keywords` by EXACT equality
 * after normalisation. The catalog, written by hand over time, spells the same place
 * several ways — "uptown dallas" for Uptown, "the domain" for Domain, "texas medical
 * center" for Houston's Medical Center — so a property genuinely in the client's area
 * failed to qualify on spelling alone. Measured on the live catalog: 232 property-rows
 * qualified, while 122 more named the right place in a different way.
 *
 * WHY AN EXPLICIT TABLE AND NOT A RULE. Every entry below was read and reviewed
 * individually. The alternative — substring or regex matching — was measured and
 * rejected: it would have admitted 20,095 keyword values that assert PROXIMITY rather
 * than membership. "minutes from southtown", "15 minutes to uptown dallas", "near
 * texas medical center" and "walking distance to utsa" all describe a property that is
 * NOT in the area, and starring them is exactly the "pad with weak matches" failure the
 * suggestion cap is designed to avoid.
 *
 * So matching here is EXACT EQUALITY against an allowlist. A proximity phrase cannot
 * qualify because it is not in the table, not because a filter caught it — there is no
 * filter to get wrong. scripts/matching/areaAliases.test.ts asserts that property
 * directly, including the two cases called out as critical:
 *     "minutes from Southtown"      must NOT satisfy  Southtown
 *     "near Texas Medical Center"   must NOT satisfy  Medical Center
 *
 * SCOPE. This feeds the rank-2 keyword comparison and nothing else. It does not touch
 * scoring, ranking, tier order, candidate generation, commute or Map search. The
 * neighborhood (rank 1) and location (rank 3) tiers are deliberately NOT aliased:
 * every mapping here was measured against `location_keywords`, and those two columns
 * are populated on just 7 and 10 of 4,202 catalogued rows respectively, so there is
 * nothing to alias there yet.
 *
 * KEYED BY MARKET DISPLAY NAME, which is exactly what `leads.city` stores and what
 * assessLocationFit already receives as `client.city`. Market scoping is essential:
 * "midtown houston" means Houston's Midtown and must never satisfy a Dallas client who
 * chose Midtown.
 *
 * HOW TO ADD AN ENTRY. Read the actual keyword values first
 * (`npx tsx scripts/matching/auditAliasOptions.ts`), confirm the spelling asserts the
 * property IS in the area, and add it here. Never add a phrase containing near / close
 * to / minutes / miles / walking distance / from / access / proximity / adjacent /
 * between — those are proximity, and the test suite will reject them.
 */

/** Normalisation IDENTICAL to assessLocationFit's, so comparisons agree exactly. */
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()

/**
 * market display name → client area label → accepted catalog keyword spellings.
 *
 * Each list holds spellings OTHER than the label itself; the label always matches on
 * its own and is never repeated here. Row counts are from the live catalog on
 * 2026-10-01 and are documentation, not logic — an entry with 0 rows today is
 * harmless and starts working if the catalog later uses that spelling.
 */
export const AREA_ALIASES: Record<string, Record<string, string[]>> = {
  // ── Rule A: the keyword carries a market qualifier or a leading "the" ──────
  // ── Rule B: the label's own parenthetical / slash parts ───────────────────
  // ── Rule C: an individually reviewed local prefix ─────────────────────────
  Austin: {
    // Rule A — "the domain" (7 rows) is the standard local name for The Domain.
    Domain: ["the domain"],
    // Rule B — the label carries the local nickname in parentheses.
    "South Congress (SoCo)": ["south congress", "soco"],
    // Rule C (reviewed) — Austin's Riverside area is East Riverside; the two names
    // refer to the same place, not to a neighbouring one. 8 rows.
    Riverside: ["east riverside", "east riverside austin"],
  },

  Dallas: {
    // Rule A — 60 rows, the single largest gap in the catalog.
    Uptown: ["uptown dallas"],
    Midtown: ["midtown dallas"],
    "Medical District": ["medical district dallas", "dallas medical district"],
    "Oak Lawn": ["oak lawn dallas"],
    "Design District": ["dallas design district"],
    "Victory Park": ["victory park dallas"],
  },

  "Fort Worth": {
    // Rule A.
    "Cultural District": ["fort worth cultural district"],
    // Rule B — only the unambiguous half. "near southside" is DELIBERATELY ABSENT:
    // the Fort Worth neighbourhood really is called Near Southside, but the string is
    // indistinguishable from proximity language, and the standing guardrail is that
    // proximity is never membership. One catalog row is affected; a reviewer who wants
    // it should add the spelling knowingly rather than have a rule infer it.
    "Near Southside (Magnolia)": ["magnolia"],
    "TCU / Westcliff": ["tcu", "westcliff"],
    "Stockyards / North Side": ["stockyards", "north side"],
  },

  Houston: {
    // Rule A.
    Midtown: ["midtown houston"],
    "River Oaks": ["river oaks houston"],
    Galleria: ["the galleria"],
    // Rule A + Rule B on the same label.
    "East Downtown (EaDo)": ["east downtown eado houston", "east downtown", "eado"],
    // Rule A ("houston medical center") plus Rule C: in Houston, "Medical Center" IS
    // the Texas Medical Center — one place under two names, 8 rows combined.
    "Medical Center": ["houston medical center", "texas medical center"],
    // Rule B.
    "Greenway / Upper Kirby": ["greenway", "upper kirby"],
  },

  "San Antonio": {
    // Rule A.
    "Stone Oak": ["stone oak san antonio"],
    "Medical Center": ["san antonio medical center"],
    // Rule B.
    "La Cantera/The Rim": ["la cantera", "the rim"],
    "Universal City/Converse": ["universal city", "converse"],
  },
}

/** Pre-normalised lookup, built once. */
const INDEX: Map<string, Map<string, Set<string>>> = (() => {
  const out = new Map<string, Map<string, Set<string>>>()
  for (const [city, labels] of Object.entries(AREA_ALIASES)) {
    const byLabel = new Map<string, Set<string>>()
    for (const [label, spellings] of Object.entries(labels)) {
      byLabel.set(norm(label), new Set(spellings.map(norm).filter(Boolean)))
    }
    out.set(norm(city), byLabel)
  }
  return out
})()

/**
 * Does `keyword` (a catalog `location_keywords` value) name the same place as
 * `clientArea` (the client's saved label), within `city`?
 *
 * Exact equality against the curated spellings — no substring, no fuzzy matching, so a
 * phrase that merely CONTAINS the area name can never satisfy it. Both arguments may
 * arrive already normalised or not; both are normalised here.
 */
export function isAreaAlias(keyword: string, clientArea: string, city: string | null | undefined): boolean {
  if (!city) return false
  const spellings = INDEX.get(norm(city))?.get(norm(clientArea))
  if (!spellings) return false
  return spellings.has(norm(keyword))
}

/** Every accepted spelling for a client's area in a market — the label itself first. */
export function acceptedSpellings(clientArea: string, city: string | null | undefined): string[] {
  const self = norm(clientArea)
  if (!city) return [self]
  return [self, ...(INDEX.get(norm(city))?.get(self) ?? [])]
}
