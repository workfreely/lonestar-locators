/**
 * THE VOICE CLIP LIBRARY — what each recording is, and what it may be paired with.
 *
 * 58 recordings of Jay's own voice, organised into four folders and named by hand. This reads
 * that naming rather than asking anyone to re-enter it, and REFUSES to guess when a name does
 * not say enough. A clip that cannot be classified confidently is flagged for review, because
 * the cost of a wrong market or a wrong price is a video that makes a false claim about a
 * property.
 */

export const VOICE_MARKETS = ["SATX", "DAL", "HOU", "GENERAL"] as const
export type VoiceMarket = (typeof VOICE_MARKETS)[number]

export const MARKET_LABEL: Record<VoiceMarket, string> = {
  SATX: "San Antonio",
  DAL: "Dallas",
  HOU: "Houston",
  GENERAL: "All markets",
}

export const VOICE_CATEGORIES = [
  "conversational_hook",
  "social_proof",
  "best_deals",
  "luxury_lifestyle",
  "price_hook",
  "call_to_action",
] as const
export type VoiceCategory = (typeof VOICE_CATEGORIES)[number]

export const CATEGORY_LABEL: Record<VoiceCategory, string> = {
  conversational_hook: "Conversational Hooks",
  social_proof: "Social Proof / Client Success",
  best_deals: "Best Deals",
  luxury_lifestyle: "Luxury / Lifestyle",
  price_hook: "Price-Based Hooks",
  call_to_action: "Calls to Action",
}

/** The six approved CTA keywords, mirroring lib/social/commentKeywords.ts. Property types are
 *  spelled exactly as that module spells them, so a clip and a comment lead agree. */
export const CTA_PROPERTY_TYPES = {
  LIST: "Apartment",
  TOWN: "Townhome",
  LOFT: "Loft",
  RISE: "High-Rise",
  HOME: "Rental Home",
  KEY: "Penthouse",
} as const
export type CtaKeyword = keyof typeof CTA_PROPERTY_TYPES

/**
 * HOW FREELY A RECORDING TRAVELS — decided by what it SAYS, not by which folder it sits in.
 *
 * The folder was the wrong signal and it produced a real bug. "Help_Client_Amazing_Deal" lives
 * in 01_Hooks, so it was classified as an ordinary conversational hook: GENERAL market, no price,
 * no property type, therefore compatible with everything. The demo duly offered it for an Austin
 * rental home and a Grapevine property with no market at all. But the recording actually says
 * "I just helped my client get an amazing deal on this apartment" — a claim about a real client
 * AND about the property on screen. It should never have been automatic anywhere.
 *
 * The inverse error was just as wrong: blanket-restricting the whole 04-Specials folder to manual
 * selection treats a reusable social-proof line as if it named one building.
 *
 *   universal          makes no claim beyond what the pairing rules already check
 *   conditional        makes a claim that must be TRUE of this property or this client —
 *                      offered as a recommendation, selectable by hand, never auto-applied
 *   property_specific  names a particular property or a particular client experience
 */
export const ELIGIBILITY_TIERS = ["universal", "conditional", "property_specific"] as const
export type EligibilityTier = (typeof ELIGIBILITY_TIERS)[number]

/** Why a clip is conditional, in words a person can act on. */
export type ConditionalRequirement = "verified_price" | "verified_client_experience" | "verified_special" | "verified_amenity" | "featured_property_match"

export type VoiceClipMeta = {
  /** As recorded, never rewritten. */
  originalFilename: string
  /** What a person reads in the picker. */
  displayName: string
  clipType: "hook" | "cta"
  market: VoiceMarket
  category: VoiceCategory
  /** Monthly rent the script names, in dollars. Null when the clip makes no price claim. */
  pricePoint: number | null
  propertyType: string | null
  ctaKeyword: CtaKeyword | null
  /** What the recording actually says. Null until transcribed — never inferred from a filename. */
  transcript: string | null
  /**
   * SOFT, NOT A BLOCK. A missing transcript means the tier below was inferred from the filename
   * rather than heard, which is worth showing a person — but refusing every untranscribed clip
   * would empty the library, and "we have not transcribed it yet" is not evidence that a
   * recording makes a false claim. `review` is for problems; this is for confidence.
   */
  transcriptStatus: "confirmed" | "missing"
  eligibility: EligibilityTier
  /** What must be verified before this clip may be used. Empty for universal clips. */
  requires: ConditionalRequirement[]
  /** Non-empty ⇒ a person must confirm before this clip is usable. */
  review: string[]
}

/**
 * Phrases that change how freely a recording travels. Applied to the TRANSCRIPT only.
 *
 * "this apartment", "right here" and the like point at whatever is on screen, which makes the
 * sentence a claim about the featured property. "my client" is a claim about a real person.
 * Neither can be auto-applied, and neither is visible in a filename.
 */
// "this apartment" asserts something about the property on screen. "this one is for you" merely
// points at it and asserts nothing verifiable — including "one" here made every ordinary hook
// conditional, which is the opposite of the intent.
const DEICTIC = /\b(this|these|right here|here at)\b.{0,24}\b(apartment|property|place|home|unit|community|building)\b/i
const CLIENT_CLAIM = /\b(my|a) client\b|\bhelped (my|a|another) (client|renter|family)\b|\bone client\b/i
const SPECIAL_CLAIM = /\b(\d+|one|two|four|six|eight|ten)\s*(weeks?|months?)\s*free\b|\bfree (rent|movers?)\b|\bmove.?in special\b/i
const AMENITY_CLAIM = /\b(floor.to.ceiling|rooftop|pool|view|concierge|gym|fitness)\b/i

/**
 * Transcript → tier. Returns null when there is no transcript, so the caller can fall back to a
 * conservative guess rather than pretending to know.
 */
export function classifyFromTranscript(transcript: string): { tier: EligibilityTier; requires: ConditionalRequirement[] } {
  const requires: ConditionalRequirement[] = []
  const client = CLIENT_CLAIM.test(transcript)
  const deictic = DEICTIC.test(transcript)
  if (client) requires.push("verified_client_experience")
  if (deictic) requires.push("featured_property_match")
  if (SPECIAL_CLAIM.test(transcript)) requires.push("verified_special")
  if (AMENITY_CLAIM.test(transcript)) requires.push("verified_amenity")
  if (/\$\s?[\d,]+|\b\d+\s?k\b/i.test(transcript)) requires.push("verified_price")

  // A claim about a named client AND about the thing on screen is as specific as it gets.
  if (client && deictic) return { tier: "property_specific", requires }
  if (requires.length > 0) return { tier: "conditional", requires }
  return { tier: "universal", requires: [] }
}

const FOLDER_CATEGORY: Record<string, VoiceCategory> = {
  "01_Hooks": "conversational_hook",
  "02_CTA": "call_to_action",
  "03_Price Hooks": "price_hook",
  "04-Specials": "social_proof",
}

/** "$1,500" / "1500" / "15K" → 1500 / 15000. Returns null when the token is not a price. */
export function parsePriceToken(token: string): number | null {
  const t = token.replace(/[$,_]/g, "").toUpperCase()
  const m = /^(\d+(?:\.\d+)?)(K)?$/.exec(t)
  if (!m) return null
  const n = Number(m[1]) * (m[2] ? 1000 : 1)
  // Below $400 is not a monthly rent — almost certainly a stray number in the name.
  return Number.isFinite(n) && n >= 400 ? n : null
}

/** Market from the filename. Returns null when the name names NO market — the caller decides
 *  whether that means GENERAL (a folder with no market convention) or a flag. */
export function parseMarket(filename: string): { market: VoiceMarket | null; conflict: boolean } {
  const upper = filename.toUpperCase()
  // TOKENS, NOT \b. These filenames separate words with underscores, and "_" is a word
  // character — so /\bSATX\b/ does NOT match "SATX_$1000_Gets_You", which silently flagged
  // every price hook in the library as having no market. Splitting on non-alphanumerics is
  // what the names actually use.
  const tokens = new Set(upper.split(/[^A-Z0-9]+/).filter(Boolean))
  const hits: VoiceMarket[] = []
  if (tokens.has("SATX") || /SAN ANTONIO/.test(upper)) hits.push("SATX")
  if (tokens.has("DAL") || /DALLAS/.test(upper)) hits.push("DAL")
  if (tokens.has("HOU") || /HOUSTON/.test(upper)) hits.push("HOU")
  if (hits.length === 0) return { market: null, conflict: false }
  // TWO MARKETS IN ONE NAME IS NOT A TIE TO BREAK. One file shipped as
  // "DAL_$2000_Gets_You_SATX" and the only honest answer was to ask; Jay confirmed SATX and
  // renamed it. Anything like it in future gets the same treatment, not a precedence rule.
  if (hits.length > 1) return { market: hits[0], conflict: true }
  return { market: hits[0], conflict: false }
}

const PROPERTY_TYPE_HINTS: [RegExp, string, CtaKeyword][] = [
  [/PENTHOUSE/i, "Penthouse", "KEY"],
  [/HIGH.?RISE|HIGHRISE/i, "High-Rise", "RISE"],
  [/TOWNHOME|TOWNHOUSE/i, "Townhome", "TOWN"],
  [/LOFT/i, "Loft", "LOFT"],
  [/RENTAL.?HOME/i, "Rental Home", "HOME"],
  [/APARTMENT|\bAPT\b/i, "Apartment", "LIST"],
]

/** Filename + folder → everything we can say about a clip, plus what we cannot. */
export const KNOWN_TRANSCRIPTS: Record<string, string> = {
  // Confirmed by Jay. The only wording in this map that has actually been heard; everything
  // else stays null until it is transcribed, because a filename is not a script.
  "Help_Client_Amazing_Deal.m4a": "I just helped my client get an amazing deal on this apartment.",
}

export function parseVoiceClip(folder: string, filename: string, transcript?: string | null): VoiceClipMeta {
  const base = filename.replace(/\.m4a$/i, "").replace(/\.+$/, "")
  const review: string[] = []

  const category = FOLDER_CATEGORY[folder] ?? "conversational_hook"
  if (!FOLDER_CATEGORY[folder]) review.push(`unrecognised folder "${folder}" — category defaulted`)
  const clipType: "hook" | "cta" = category === "call_to_action" ? "cta" : "hook"

  const { market: parsed, conflict } = parseMarket(base)
  if (conflict) review.push("filename names more than one market — confirm which city this is")
  // A CTA or a client-success story with no market in the name is genuinely general. A price
  // hook without one is not: it is a missing label, because every price hook is city-specific.
  let market: VoiceMarket = parsed ?? "GENERAL"
  if (!parsed && category === "price_hook") {
    review.push("price hook with no market in the filename — a price claim must name its city")
  }

  let pricePoint: number | null = null
  if (category === "price_hook") {
    for (const tok of base.split(/[_\s]+/)) {
      const p = parsePriceToken(tok)
      if (p !== null) { pricePoint = p; break }
    }
    if (pricePoint === null) review.push("price hook with no readable price in the filename")
  }

  let propertyType: string | null = null
  let ctaKeyword: CtaKeyword | null = null
  for (const [re, type, kw] of PROPERTY_TYPE_HINTS) {
    if (re.test(base)) { propertyType = type; ctaKeyword = kw; break }
  }
  if (clipType === "cta" && !ctaKeyword) {
    review.push("CTA names no property type — cannot map to a comment keyword")
  }

  // Sub-categories live inside 01_Hooks rather than in their own folders.
  let refined = category
  if (category === "conversational_hook") {
    if (/LUXURY/i.test(base)) refined = "luxury_lifestyle"
    else if (/BEST.?(APT.?)?DEAL/i.test(base) || /BEST DEALS/i.test(base)) refined = "best_deals"
  }

  const displayName = base
    .replace(/_+/g, " ")
    .replace(/\bSATX\b/g, "San Antonio")
    .replace(/\bDAL\b/g, "Dallas")
    .replace(/\bHOU\b/g, "Houston")
    .replace(/\s+/g, " ")
    .trim()

  // ── TIER ────────────────────────────────────────────────────────────────────────────────
  const text = transcript ?? KNOWN_TRANSCRIPTS[filename] ?? null
  let eligibility: EligibilityTier
  let requires: ConditionalRequirement[] = []
  if (text) {
    ({ tier: eligibility, requires } = classifyFromTranscript(text))
  } else {
    // NO TRANSCRIPT ⇒ GUESS CONSERVATIVELY, AND SAY SO. A price hook states a number, so it is
    // conditional on that number being true whatever the wording turns out to be. A social-proof
    // recording is about a client. Everything else is assumed universal, which is the one
    // assumption that can be wrong in a way a person will notice — hence the review note.
    if (refined === "price_hook") { eligibility = "conditional"; requires = ["verified_price"] }
    else if (refined === "social_proof") { eligibility = "conditional"; requires = ["verified_client_experience"] }
    else eligibility = "universal"
  }

  return {
    originalFilename: filename, displayName, clipType, market, category: refined, pricePoint,
    propertyType, ctaKeyword, transcript: text, transcriptStatus: text ? "confirmed" : "missing",
    eligibility, requires, review,
  }
}

/**
 * social_content.property_type → the six types the CTAs are recorded for.
 *
 * That column is populated on every content row — Apartment 74, Townhome 41, Penthouse 35,
 * High-Rise 29, Rental Home 7, Loft 3, plus variants — which is why the catalog's own
 * property_type being NULL on all 4,204 rows never mattered: the video is made from a content
 * record, and the content record knows.
 *
 * The variants collapse to their base type. "Split-Level Loft" and "Industrial-Style Loft" are
 * both lofts for the purpose of choosing a LOFT CTA; the adjective is a description, not a
 * different category.
 */
export function normalizePropertyType(raw: string | null): string | null {
  const t = (raw ?? "").trim()
  if (!t) return null
  for (const base of ["Penthouse", "Townhome", "Loft", "High-Rise", "Rental Home", "Apartment"]) {
    if (t === base || t.endsWith(` ${base}`)) return base
  }
  return null  // an unrecognised value is unknown, not a guess
}

// ── COMPATIBILITY ─────────────────────────────────────────────────────────────────────────────

/**
 * What the price on screen MEANS — mirrored from social_content.price_label_mode, the same value
 * the overlay uses to choose between "Starting at $2,300/mo" and "Exact unit shown: $4,200/mo".
 * Null reads as "starting_at", exactly as composePost's priceLabelMode() treats it.
 */
export type VoicePriceMode = "starting_at" | "exact_unit"

export type PropertyFacts = {
  /** The market the property is in. */
  market: VoiceMarket | null
  /**
   * THE PRICE THE VIDEO ACTUALLY SHOWS, in dollars — social_content.budget_range, the figure
   * typed into "Starting At" and rendered into the overlay. Null when unknown, which is NOT zero.
   *
   * Deliberately the displayed price rather than property_catalog's starting rent: a spoken price
   * has to agree with the number the viewer can read on screen, and the catalog holds a rent for
   * 1 of the 155 properties Social Beast actually posts about.
   */
  startingRent: number | null
  /** How to read `startingRent`. Absent ⇒ starting_at. */
  priceMode?: VoicePriceMode | null
  propertyType: string | null
}

export type CompatibilityResult = { ok: boolean; reasons: string[] }

/**
 * HOW CLOSE AN APPROXIMATE PRICE CLAIM HAS TO BE.
 *
 * "Here's what $1,500 gets you" is heard as a description of THIS apartment, so the number on
 * screen has to be the number in the sentence, give or take. 0.10 lets $1,500 pair down to
 * $1,350 and no further. Configurable in one place because how close is "about right" is a
 * judgement about tone; the upper bound is not — above the spoken price the claim is just false.
 */
export const PRICE_BAND_TOLERANCE = 0.10

/**
 * The looser floor, kept for CEILING claims only.
 *
 * "Under $20,000" is true of a $12,000 penthouse and absurd over an $1,800 apartment, so a
 * ceiling claim still needs a sanity floor — just not the tight one an approximate claim needs.
 */
export const PRICE_BAND_FLOOR = 0.6

/**
 * Is this clip saying "here's what $X gets you", or "under $X"?
 *
 * ONLY A CONFIRMED TRANSCRIPT CAN ANSWER THIS. A filename cannot: `SATX_What_1500_Gets_You` and
 * a hypothetical `SATX_Under_1500` would both parse to the same $1,500, and guessing "ceiling"
 * from a filename would loosen the rule on a recording nobody has listened to. So an
 * untranscribed clip is treated as the stricter of the two, which is the approximate claim.
 */
export function priceClaimKind(clip: Pick<VoiceClipMeta, "transcript" | "transcriptStatus">): "approximate" | "under" {
  if (clip.transcriptStatus !== "confirmed" || !clip.transcript) return "approximate"
  return /\b(under|below|less than)\s*\$?\s*[\d,]+/i.test(clip.transcript) ? "under" : "approximate"
}

/**
 * May this clip be paired with this property?
 *
 * Refusal is the default for anything unproven. Every rule here exists because its violation
 * would put a false claim in front of a renter:
 *
 *   • a San Antonio hook over Dallas footage names the wrong city
 *   • a "$1,500 gets you" hook over a property renting at $2,400 states a price that is not true
 *   • a client success story is a claim about a real person's experience and is never automatic
 */
export function isClipCompatible(clip: VoiceClipMeta, property: PropertyFacts): CompatibilityResult {
  const reasons: string[] = []

  if (clip.review.length > 0) reasons.push("clip is flagged for review")

  // MARKET. GENERAL travels anywhere; a city clip only to its own city.
  if (clip.market !== "GENERAL") {
    if (!property.market) reasons.push("property has no market recorded")
    else if (property.market !== clip.market) {
      reasons.push(`clip is ${MARKET_LABEL[clip.market]}, property is ${MARKET_LABEL[property.market]}`)
    }
  }

  // PRICE. THE SPOKEN NUMBER IS CHECKED AGAINST THE NUMBER ON SCREEN.
  //
  // `startingRent` here is social_content.budget_range — the price typed once for this video and
  // rendered into its overlay. So this rule is really "does the voice agree with the caption",
  // which is the only version of it a viewer can actually catch us failing.
  //
  // THREE CASES, AND THEY ARE GENUINELY DIFFERENT:
  //
  //   exact_unit   The overlay says "Exact unit shown: $4,200/mo". That is one apartment with one
  //                price, so an approximate claim has nothing to approximate — it must match.
  //   approximate  "Here's what $1,500 gets you" describes the place being shown. Above the
  //                spoken price it is false; more than PRICE_BAND_TOLERANCE below it, the
  //                sentence and the caption are visibly different numbers.
  //   under        "Under $20,000" is a ceiling, not a description, so it only needs to be true —
  //                with the looser PRICE_BAND_FLOOR to stop a luxury promise over a budget unit.
  //
  // Unknown price blocks all three: a price hook over a video with no price is a guess spoken out
  // loud, and nothing here will invent one.
  if (clip.pricePoint !== null) {
    const shown = property.startingRent
    const claim = clip.pricePoint
    const kind = priceClaimKind(clip)
    const exactUnit = (property.priceMode ?? "starting_at") === "exact_unit"
    const $ = (n: number) => `$${n.toLocaleString()}`
    if (shown === null) {
      reasons.push("price hook needs a verified price; this video has none")
    } else if (exactUnit && kind === "approximate") {
      if (shown !== claim) reasons.push(`clip says ${$(claim)} but the video shows an exact unit at ${$(shown)}`)
    } else if (shown > claim) {
      reasons.push(`clip says ${$(claim)} but the video shows ${$(shown)}`)
    } else if (kind === "under") {
      if (shown < claim * PRICE_BAND_FLOOR) {
        reasons.push(`clip says under ${$(claim)} but the video shows only ${$(shown)} — too far below the price it names`)
      }
    } else if (shown < claim * (1 - PRICE_BAND_TOLERANCE)) {
      reasons.push(`clip says ${$(claim)} but the video shows ${$(shown)} — outside the ${Math.round(PRICE_BAND_TOLERANCE * 100)}% tolerance`)
    }
  }

  // PROPERTY TYPE. A clip that names one is a claim about what the building IS.
  if (clip.propertyType && property.propertyType && clip.propertyType !== property.propertyType) {
    reasons.push(`clip is for a ${clip.propertyType}, property is a ${property.propertyType}`)
  }

  return { ok: reasons.length === 0, reasons }
}

/**
 * May this clip be AUTOMATICALLY applied, with nobody confirming anything?
 *
 * Stricter than isClipCompatible by exactly one thing: a conditional clip makes a claim the
 * pairing rules cannot check — that a client experience was real, that a special is current,
 * that the thing on screen is the thing being talked about. Those are recommendations a person
 * accepts, never defaults a renderer applies.
 *
 * It is NOT a permanent restriction. The clip stays selectable by hand for any property where
 * the claim holds, and a saved selection is honoured at render exactly as made.
 */
export function isAutoEligible(clip: VoiceClipMeta, property: PropertyFacts): CompatibilityResult {
  const base = isClipCompatible(clip, property)
  const reasons = [...base.reasons]
  // AN UNKNOWN TYPE IS NOT A FREE PASS. A high-rise hook over a property whose type nobody has
  // recorded was being recommended automatically — the type check above only fires when BOTH
  // sides name a type, so "unknown" silently satisfied it. Saying "check out this high-rise"
  // over a building that might be a rental home is a factual claim made on no evidence.
  //
  // It stays manually selectable: once a person sets the featured type on the video, the clip
  // becomes auto-eligible through the ordinary path.
  if (clip.propertyType && !property.propertyType) {
    reasons.push(`clip is specific to a ${clip.propertyType}; this property has no type recorded — set the featured type on this video to use it`)
  }

  if (clip.eligibility === "property_specific") {
    reasons.push("names a specific property or client experience — select it by hand where the claim is true")
  } else if (clip.eligibility === "conditional") {
    // NOT EVERY CONDITION NEEDS A PERSON. A price claim is checked against the property's own
    // verified rent by isClipCompatible above — that requirement is already satisfied, by data,
    // and holding a price hook back for human confirmation would make the 28 of them useless.
    // What a person must supply is the half no column can answer: whether a client experience
    // was real, whether a special is still running, whether the thing on screen is the thing
    // being described.
    const human = clip.requires.filter((r) => HUMAN_VERIFIED.has(r))
    if (human.length > 0) {
      reasons.push(`conditional: needs ${human.map((r) => REQUIREMENT_LABEL[r]).join(", ")} confirmed before it can be applied automatically`)
    }
  }
  return { ok: reasons.length === 0, reasons }
}

/** The requirements no database column can settle. Everything else is checked above, from data. */
const HUMAN_VERIFIED = new Set<ConditionalRequirement>([
  "verified_client_experience", "verified_special", "verified_amenity", "featured_property_match",
])

export const REQUIREMENT_LABEL: Record<ConditionalRequirement, string> = {
  verified_price: "verified pricing",
  verified_client_experience: "a genuine client experience",
  verified_special: "a current, verified special",
  verified_amenity: "a verified amenity",
  featured_property_match: "that the featured property is the one being described",
}

// ── SELECTION ─────────────────────────────────────────────────────────────────────────────────

export type ClipChoice = {
  clip: VoiceClipMeta
  why: string[]
}

export type SelectionResult = {
  hook: ClipChoice | null
  cta: ClipChoice | null
  /** Every clip that was considered and refused, with the reason. Kept because "nothing was
   *  selected" and "everything was rejected for a stated reason" look identical from outside,
   *  and only one of them is a data problem worth fixing. */
  rejected: { clip: VoiceClipMeta; reasons: string[] }[]
  /** Compatible, but making a claim someone must confirm. Offered, never applied. */
  conditional: ClipChoice[]
  /** True when no hook could be chosen. The caller falls back to no voice at all — a silent
   *  property video is honest; a mismatched one is not. */
  needsReview: boolean
}

/**
 * Choose a hook and a CTA for one property.
 *
 * ── PREFERENCE ORDER, AND WHY ───────────────────────────────────────────────────────────────
 * Among clips that are ELIGIBLE (isClipCompatible said yes), a market-specific clip beats a
 * GENERAL one, because naming the city is the whole point of having recorded it three times.
 * Among price hooks, the one whose price sits CLOSEST ABOVE the property's rent wins: "what
 * $1,500 gets you" over a $1,450 unit is a better sentence than "what $3,000 gets you" over the
 * same unit, even though both are true.
 *
 * Nothing here relaxes a rule to find a match. If every clip is rejected, the answer is no clip.
 */
export function selectVoiceClips(property: PropertyFacts, clips: readonly VoiceClipMeta[]): SelectionResult {
  const rejected: SelectionResult["rejected"] = []
  const eligible: VoiceClipMeta[] = []
  // TWO POOLS. `eligible` is what may be applied with nobody watching; `conditional` is what a
  // person may reasonably pick for this property once they have confirmed the claim. Both are
  // returned, because hiding the second would make the library look smaller than it is.
  const conditional: ClipChoice[] = []
  for (const c of clips) {
    const auto = isAutoEligible(c, property)
    if (auto.ok) { eligible.push(c); continue }
    const base = isClipCompatible(c, property)
    if (base.ok) conditional.push({ clip: c, why: [`needs ${c.requires.map((r) => REQUIREMENT_LABEL[r]).join(", ")} confirmed`] })
    else rejected.push({ clip: c, reasons: base.reasons })
  }

  const score = (c: VoiceClipMeta): number => {
    let s = 0
    if (c.market !== "GENERAL") s += 100            // the city was recorded for a reason
    if (c.propertyType && c.propertyType === property.propertyType) s += 50
    if (c.pricePoint !== null && property.startingRent !== null) {
      // Closest above the rent. A $1,500 claim over a $1,450 unit scores higher than a $3,000 one.
      s += Math.max(0, 40 - (c.pricePoint - property.startingRent) / 100)
    }
    return s
  }
  const best = (pool: VoiceClipMeta[]) =>
    pool.length === 0 ? null : pool.slice().sort((a, b) => score(b) - score(a))[0]

  const hookPool = eligible.filter((c) => c.clipType === "hook")
  const hook = best(hookPool)
  const cta = best(eligible.filter((c) => c.clipType === "cta"))

  const why = (c: VoiceClipMeta | null): string[] => {
    if (!c) return []
    const out: string[] = []
    out.push(c.market === "GENERAL" ? "general clip, usable in any market" : `${MARKET_LABEL[c.market]} clip in a ${MARKET_LABEL[c.market]} property`)
    if (c.pricePoint !== null && property.startingRent !== null) {
      // Name the price the VIDEO shows, and how it was read, so the reason can be checked against
      // the overlay rather than taken on trust.
      const exact = (property.priceMode ?? "starting_at") === "exact_unit"
      const shown = `$${property.startingRent.toLocaleString()}`
      out.push(
        `claims $${c.pricePoint.toLocaleString()}/month; this video shows ${shown}` +
        (exact ? " for the exact unit — matches"
          : priceClaimKind(c) === "under" ? " — under the price it names"
          : ` — within ${Math.round(PRICE_BAND_TOLERANCE * 100)}%`),
      )
    }
    if (c.propertyType) out.push(`clip is for a ${c.propertyType}${property.propertyType ? `, property is a ${property.propertyType}` : ""}`)
    if (c.ctaKeyword) out.push(`CTA keyword ${c.ctaKeyword}`)
    return out
  }

  return {
    hook: hook ? { clip: hook, why: why(hook) } : null,
    cta: cta ? { clip: cta, why: why(cta) } : null,
    rejected,
    conditional,
    needsReview: hook === null,
  }
}
