// PROPERTY IDENTITY — a research record may only ever point at an identifier the library already
// holds, for the account that holds it.
//
// ── THE INCIDENT THIS EXISTS TO PREVENT ─────────────────────────────────────────────────────
// 49 research records were written with place_ids whose first 22 characters were correct and
// whose final 5 were invented. They came from a listing script that truncated ids for display,
// and the tails were completed by hand. Every one was well-formed — 27 characters, ChIJ-prefixed,
// URL-safe — so no amount of shape checking would have caught them. They simply pointed at
// buildings that do not exist in this library, silently orphaning 40% of the research.
//
// ── THE RULE ────────────────────────────────────────────────────────────────────────────────
// EXISTENCE, NOT PLAUSIBILITY. An identifier is valid only if it appears EXACTLY, character for
// character, among the place_ids on the OWNER'S OWN social_content rows. Shape is checked first
// only so the failure can be named precisely; it is never sufficient on its own.
//
// NOTHING IS EVER RECONSTRUCTED. When an id is close to a real one — a shared prefix, a truncation
// — that is reported as a diagnosis so a human can see what went wrong. It is NEVER auto-corrected,
// because the whole failure mode was a plausible completion of a partial id.
//
// OWNER SCOPE IS PART OF IDENTITY. A place_id belonging to another account is as invalid as one
// that does not exist, and is refused for a different stated reason — research is keyed on the
// PAIR (owner_user_id, place_id), so validating the id alone would let one account's research
// attach to another's building.

/** Every place_id in this library: 27 characters, ChIJ-prefixed, URL-safe base64 alphabet. */
const PLACE_ID_RE = /^[A-Za-z0-9_-]{20,}$/
const CANONICAL_LENGTH = 27

export type IdentityFailure =
  | "missing_owner"
  | "missing_place_id"
  | "not_a_string"
  | "whitespace"
  | "bad_charset"
  | "truncated"
  | "unknown_place_id"
  | "wrong_owner"
  | "ambiguous_name"
  | "no_match_for_name"

export type IdentityResult =
  | { ok: true; placeId: string }
  | { ok: false; reason: IdentityFailure; message: string; nearMiss?: string }

/** Shape only. Names the obvious breakages so a failure reads as a diagnosis, not a shrug. */
export function checkPlaceIdShape(value: unknown): IdentityResult {
  if (typeof value !== "string") return { ok: false, reason: "not_a_string", message: `place_id must be a string, got ${typeof value}` }
  if (!value) return { ok: false, reason: "missing_place_id", message: "place_id is empty" }
  if (/\s/.test(value)) return { ok: false, reason: "whitespace", message: `place_id contains whitespace: ${JSON.stringify(value)}` }
  if (!PLACE_ID_RE.test(value)) return { ok: false, reason: "bad_charset", message: `place_id is not URL-safe base64: ${JSON.stringify(value)}` }
  // A ChIJ id shorter than the canonical length is a TRUNCATION, which is worth saying out loud —
  // it is exactly the shape a display-truncated id has.
  if (value.startsWith("ChIJ") && value.length < CANONICAL_LENGTH) {
    return { ok: false, reason: "truncated", message: `place_id looks TRUNCATED: ${value.length} characters, expected ${CANONICAL_LENGTH}. Never complete a partial id — read the full value from social_content.` }
  }
  return { ok: true, placeId: value }
}

/**
 * The authoritative check: does this exact id belong to this owner's library?
 *
 * `ownedPlaceIds` is the set of place_ids on the OWNER'S OWN social_content rows. `allPlaceIds`
 * is every place_id in the table, used only to tell "belongs to someone else" apart from "does
 * not exist" — two different problems that deserve two different messages.
 */
export function resolvePlaceId(input: {
  ownerUserId: unknown
  placeId: unknown
  ownedPlaceIds: ReadonlySet<string>
  allPlaceIds?: ReadonlySet<string>
}): IdentityResult {
  if (typeof input.ownerUserId !== "string" || !input.ownerUserId.trim()) {
    return { ok: false, reason: "missing_owner", message: "owner_user_id is required — research identity is the PAIR, not the place_id alone" }
  }
  const shape = checkPlaceIdShape(input.placeId)
  if (!shape.ok) return shape
  const id = shape.placeId

  if (input.ownedPlaceIds.has(id)) return { ok: true, placeId: id }

  // NEAR MISS, REPORTED AND NEVER APPLIED. This is the diagnosis that would have caught the
  // 49 fabricated tails the moment the first one was written.
  const prefix = id.slice(0, 22)
  const near = [...input.ownedPlaceIds].find((k) => k !== id && k.slice(0, 22) === prefix)

  if (input.allPlaceIds?.has(id)) {
    return { ok: false, reason: "wrong_owner", message: `place_id ${id} exists but belongs to another account. Research is scoped to (owner_user_id, place_id).` }
  }
  return {
    ok: false,
    reason: "unknown_place_id",
    message: near
      ? `place_id ${id} matches NO video. A different id shares its first 22 characters (${near}) — this is the signature of a FABRICATED or completed tail. The correct id is NOT being substituted; read it from social_content and pass it explicitly.`
      : `place_id ${id} matches no video in this account's library.`,
    ...(near ? { nearMiss: near } : {}),
  }
}

/**
 * Resolve an identifier from a property NAME — only when the name is unambiguous.
 *
 * Used for reporting and for tooling that works from names. A name matching zero or more than one
 * place_id is refused rather than guessed, because "pick the first" is how one building's research
 * ends up attached to another.
 */
export function resolveByPropertyName(
  propertyName: string,
  nameToPlaceIds: ReadonlyMap<string, ReadonlySet<string>>,
): IdentityResult {
  const candidates = nameToPlaceIds.get(propertyName)
  if (!candidates || candidates.size === 0) {
    return { ok: false, reason: "no_match_for_name", message: `No video is named ${JSON.stringify(propertyName)}` }
  }
  if (candidates.size > 1) {
    return { ok: false, reason: "ambiguous_name", message: `${JSON.stringify(propertyName)} matches ${candidates.size} different place_ids — ambiguous, so no identifier is assigned` }
  }
  return { ok: true, placeId: [...candidates][0] }
}
