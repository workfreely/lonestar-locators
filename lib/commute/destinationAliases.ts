// San Antonio destination DISPLAY labels.
//
// Google Places and Routes stay the canonical source for resolution and routing:
// leads.commute_anchor_place_id is never read, written or second-guessed here. This
// module only decides what a human SEES, because Google's display names are built
// for disambiguation, not for a sentence on a property card:
//
//   "Joint Base San Antonio: Fort Sam Houston"   →  "Fort Sam"
//   "Brooke Army Medical Center (BAMC)"          →  "BAMC"
//   "The University of Texas at San Antonio"     →  "UTSA"
//
// The patterns below were built against what the Places API ACTUALLY returns for
// each destination, not against guesses — every "seen" comment is a real observed
// displayName. That matters because several are counter-intuitive: "Lackland AFB"
// resolves to "Lackland Air Force Base", "River Walk" to "San Antonio River Walk",
// and "Fort Sam Houston" and "Fort Sam" are two DIFFERENT places with different ids.
//
// NO BAKED PLACE IDS. Matching is on the name alone. A place-id table would be a
// second source of truth that goes stale silently when Google re-issues an id, and
// it buys nothing: every real name observed for these sixteen destinations is
// already covered by the patterns, and several destinations have multiple ids
// (Fort Sam has at least three) that would all need maintaining.

/** The approved San Antonio labels. Display text only — never a routing input. */
export const SAN_ANTONIO_DESTINATION_LABELS = [
  "Lackland AFB",
  "Randolph AFB",
  "Camp Bullis",
  "Brooks City Base",
  "BAMC",
  "Fort Sam",
  "Downtown",
  "UTSA",
  "Six Flags",
  "SeaWorld",
  "North Star Mall",
  "River Walk",
  "Pearl District",
  "San Antonio Zoo",
  "Botanical Garden",
  "Tower of Americas",
] as const

export type DestinationLabel = (typeof SAN_ANTONIO_DESTINATION_LABELS)[number]

type AliasEntry = {
  label: DestinationLabel
  /** Whole normalized name must EQUAL one of these. For words too generic to
   *  substring-match — "pearl" would otherwise capture "Pearl Apartments". */
  exact?: string[]
  /** Normalized name must CONTAIN one of these. */
  contains?: string[]
}

// Every `exact` entry is tried before any `contains` entry, which is what keeps the
// generic labels safe — NOT the order of this list. "UTSA Downtown Campus" reads as
// UTSA because "Downtown" is exact-only, not because UTSA appears first; verified by
// reordering the list and watching the tests stay green.
const ALIASES: AliasEntry[] = [
  // seen: "Lackland Air Force Base"
  { label: "Lackland AFB", contains: ["lackland"] },
  // seen: "Randolph Air Force Base"
  { label: "Randolph AFB", contains: ["randolph air force", "randolph afb"] },
  // seen: "Joint Base Camp Bullis"
  { label: "Camp Bullis", contains: ["camp bullis"] },
  // seen: "Brooks City Base"
  { label: "Brooks City Base", contains: ["brooks city base", "brooks city-base"] },
  // seen: "Brooke Army Medical Center (BAMC)", "BAMC Visitor Center"
  { label: "BAMC", contains: ["brooke army medical", "bamc"] },
  // seen: "Fort Sam Houston", "Joint Base San Antonio: Fort Sam Houston", "JBSA-Sam Houston"
  { label: "Fort Sam", contains: ["fort sam", "ft sam", "jbsa sam houston", "jbsa-sam houston"] },
  // seen: "The University of Texas at San Antonio"
  { label: "UTSA", contains: ["university of texas at san antonio", "utsa"] },
  // seen: "Six Flags Fiesta Texas"
  { label: "Six Flags", contains: ["six flags"] },
  // seen: "SeaWorld San Antonio"
  { label: "SeaWorld", contains: ["seaworld", "sea world"] },
  // seen: "North Star Mall"
  { label: "North Star Mall", contains: ["north star mall", "northstar mall"] },
  // seen: "San Antonio River Walk"
  { label: "River Walk", contains: ["river walk", "riverwalk"] },
  // seen: "Pearl", "San Antonio Pearl District". Bare "pearl" is EXACT-only.
  { label: "Pearl District", exact: ["pearl", "the pearl"], contains: ["pearl district", "pearl brewery"] },
  // seen: "San Antonio Zoo" — this label deliberately KEEPS "San Antonio".
  { label: "San Antonio Zoo", contains: ["san antonio zoo"] },
  // seen: "San Antonio Botanical Garden"
  { label: "Botanical Garden", contains: ["botanical garden"] },
  // seen: "Tower of the Americas"
  { label: "Tower of Americas", contains: ["tower of the americas", "tower of americas"] },
  // seen: "Downtown". Generic, so EXACT-only and LAST — "Downtown Grill" must not
  // become "Downtown".
  { label: "Downtown", exact: ["downtown", "downtown san antonio", "san antonio downtown"] },
]

/** Longest label that keeps "N min to <label>" on one line on the client card. */
const MAX_LABEL_CHARS = 28

/** Case/punctuation/spacing-insensitive form used for every comparison. */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[().,:;'"]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
}

/** The approved label for a Google place name, or null when none applies. */
export function aliasForName(name: string | null | undefined): DestinationLabel | null {
  const n = normalize(name ?? "")
  if (!n) return null
  for (const a of ALIASES) if (a.exact?.some((e) => n === e)) return a.label
  for (const a of ALIASES) if (a.contains?.some((c) => n.includes(c))) return a.label
  return null
}

/**
 * Shorten a name the bank does not know.
 *
 * Only removes the noise Google adds for disambiguation — a "Joint Base San
 * Antonio:" prefix, a trailing city/state, a redundant "San Antonio" qualifier —
 * and never invents wording. A name still too long after that is cut at a word
 * boundary with an ellipsis, because wrapping onto a second line is worse on the
 * card than an honest truncation.
 */
export function shortenDestinationLabel(name: string): string {
  let s = name.trim()
  s = s.replace(/^joint base san antonio\s*[:\-]\s*/i, "")
  s = s.replace(/^jbsa\s*[-:]\s*/i, "")
  s = s.replace(/,\s*(san antonio)?[,\s]*(tx|texas)\b.*$/i, "")
  s = s.replace(/\s*,\s*san antonio\s*$/i, "")
  s = s.replace(/\s+san antonio\s*$/i, "")
  s = s.replace(/\s+/g, " ").trim()
  if (s.length <= MAX_LABEL_CHARS) return s
  const cut = s.slice(0, MAX_LABEL_CHARS)
  const atSpace = cut.lastIndexOf(" ")
  return `${(atSpace > 12 ? cut.slice(0, atSpace) : cut).trim()}…`
}

/**
 * THE display label for a client's commute destination.
 *
 * Precedence, per the approved rules:
 *   1. an approved San Antonio alias, when the stored wording matches one
 *   2. otherwise the stored label — which is whatever the locator last typed
 *      — shortened only if it is too long for the card
 *
 * Idempotent: an already-aliased label ("Fort Sam") matches its own entry and
 * comes back unchanged, so this is safe to apply on every read and every write.
 *
 * The place id is deliberately NOT a parameter. Nothing about display should be
 * able to touch routing identity, and this signature makes that impossible.
 */
export function displayDestinationLabel(storedLabel: string | null | undefined): string {
  const raw = (storedLabel ?? "").trim()
  if (!raw) return ""
  return aliasForName(raw) ?? shortenDestinationLabel(raw)
}
