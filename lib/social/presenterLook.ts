/**
 * WHICH LOOK THE AVATAR WEARS — a recommendation, never a decision.
 *
 * Two HeyGen Looks are in use, and they are not interchangeable: a gray cutoff shirt reads as the
 * locator who just walked a mid-market complex, and a black button-up reads as the one showing a
 * penthouse. Putting the cutoff shirt in front of a high-rise does not break a render, it just
 * quietly makes the video less convincing — which is exactly the class of mistake worth spending a
 * pure function on.
 *
 * ── IT RECOMMENDS; THE OPERATOR CHOOSES ─────────────────────────────────────────────────────
 * Nothing here writes, and nothing downstream treats the answer as binding. The editor shows the
 * recommendation beside a dropdown that can be set to anything, and the post stores whatever was
 * chosen. A recommendation that could not be overridden would be a rule, and this is not a domain
 * where a rule derived from a filename deserves that authority.
 *
 * ── WHY THE SIGNALS ARE THE ONES ALREADY IN THE LIBRARY ─────────────────────────────────────
 * Every input below is a column the 58 imported recordings already carry, or a value the post
 * already stores. No new classification, no new field to maintain, and nothing inferred from the
 * audio itself: a Look suggestion is not worth a second source of truth about what a clip is.
 */

/** The two Looks, as the presenter rows describe themselves. */
export type PresenterLook = "everyday" | "luxury"

export const PRESENTER_LOOKS: readonly PresenterLook[] = ["everyday", "luxury"] as const

export const LOOK_LABEL: Record<PresenterLook, string> = {
  everyday: "Everyday (gray cutoff)",
  luxury: "Luxury (black button-up)",
}

/**
 * Property types that carry the luxury read on their own. High-rises and penthouses are the two
 * the recordings themselves treat as a separate register — the library has distinct CTA keywords
 * for them (RISE, KEY) and distinct hooks ("High Rise Fortune Check Out"), which is the clearest
 * evidence available that they are a different kind of video rather than the same video priced up.
 *
 * A Loft is deliberately NOT here. Industrial lofts in this library sit in the conversational,
 * budget-led register — "Looking for an industrial loft, this is for you" — not the luxury one.
 */
const LUXURY_PROPERTY_TYPES = new Set(["High-Rise", "Penthouse"])

/** CTA keywords whose property type is luxury by construction. */
const LUXURY_CTA_KEYWORDS = new Set(["RISE", "KEY"])

/** Recording categories that are luxury by construction. */
const LUXURY_CATEGORIES = new Set(["luxury_lifestyle"])

export type LookFacts = {
  /** social_voice_clips.category of the recording this window is synced to. */
  category?: string | null
  /** The property type THIS video features — the post's own choice, else the content record's. */
  propertyType?: string | null
  /** social_voice_clips.cta_keyword, for a CTA window. */
  ctaKeyword?: string | null
}

export type LookRecommendation = {
  look: PresenterLook
  /** Why, in the operator's own terms. Shown next to the dropdown rather than kept in a log:
   *  a suggestion whose reasoning is invisible is indistinguishable from a guess. */
  why: string
}

/**
 * The recommended Look for one window.
 *
 * ORDER IS THE POINT. The CTA keyword and the recording's own category are statements about THIS
 * RECORDING; the property type is a statement about the video it is going into. When they
 * disagree — a conversational hook over a penthouse — the recording wins, because the avatar is
 * lip-syncing that recording and its register is what the figure has to match.
 *
 * Everything unrecognised falls to `everyday`. That is the larger half of the library by a wide
 * margin (3 luxury_lifestyle recordings out of 58), so it is the honest default rather than a
 * neutral one.
 */
export function recommendLook(facts: LookFacts): LookRecommendation {
  const category = (facts.category ?? "").trim()
  const ctaKeyword = (facts.ctaKeyword ?? "").trim().toUpperCase()
  const propertyType = (facts.propertyType ?? "").trim()

  if (category && LUXURY_CATEGORIES.has(category)) {
    return { look: "luxury", why: "this recording is a luxury-lifestyle hook" }
  }
  if (ctaKeyword && LUXURY_CTA_KEYWORDS.has(ctaKeyword)) {
    return { look: "luxury", why: `this CTA names a ${ctaKeyword === "KEY" ? "penthouse" : "high-rise"}` }
  }
  if (propertyType && LUXURY_PROPERTY_TYPES.has(propertyType)) {
    return { look: "luxury", why: `this video features a ${propertyType.toLowerCase()}` }
  }
  return { look: "everyday", why: "everyday apartment content" }
}

/**
 * Pick the presenter row that wears a recommended Look, from the rows the operator can actually
 * use.
 *
 * Returns null rather than a substitute when no row declares that Look. A recommendation the
 * operator cannot act on should read as "set this up", not as a silent downgrade to whichever
 * presenter happened to be first — that is how an unlabelled sample avatar ends up fronting a
 * penthouse tour.
 */
export function presenterForLook<T extends { id: string; lookKind?: string | null; hasClip?: boolean }>(
  presenters: readonly T[],
  look: PresenterLook,
): T | null {
  return presenters.find((p) => p.lookKind === look && p.hasClip !== false) ?? null
}
