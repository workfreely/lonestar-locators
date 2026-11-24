// THE CREATOR'S OWN TIKTOK CHOICES, RECORDED PER POST.
//
// TikTok's Content Sharing Guidelines put privacy, interaction settings and commercial disclosure
// in the creator's hands: privacy chosen manually with no default, interaction toggles starting
// unchecked, disclosure starting off. A scheduled post publishes hours or days later with nobody
// present, so the only compliant way to publish it unattended is to REPLAY a decision a person
// actually made — never to infer one.
//
// This module is that decision, as data. Three concepts, three columns, and one rule that governs
// all of them:
//
//     NULL means "nobody has chosen this yet" and is NOT a default.
//
// That distinction is the entire point, and it is why each concept collapses to ONE column rather
// than a set of booleans. "No interactions allowed" is a real, deliberate choice and must be
// storable; with three separate booleans it is indistinguishable from "nobody decided", unless an
// all-or-nothing constraint spans every column. One nullable column per concept makes the question
// a single null test.
//
// ── PUBLISH-AFFECTING IS NOT RENDER-AFFECTING ───────────────────────────────────────────────
// Changing privacy from Private to Public changes no pixels. Invalidating the render would throw
// away a good MP4 and make the creator re-approve a video nothing happened to. But it must still
// force RE-APPROVAL, because what they signed off on was "this video, posted this way". So these
// columns clear approved_at and deliberately leave render_status alone — the mirror image of
// lib/social/renderInvalidation, and the reason both exist separately.
import type { TikTokCreatorInfo, TikTokPrivacyLevel } from "./tiktokPublish"

/** The interactions TikTok lets a creator permit. Stored as the ALLOWED set, not the disabled one:
 *  the API takes `disable_*`, but a creator thinks in terms of what they are allowing, and an empty
 *  allow-list reads unambiguously as "none". */
export const TIKTOK_INTERACTIONS = ["comment", "duet", "stitch"] as const
export type TikTokInteraction = (typeof TIKTOK_INTERACTIONS)[number]

/** The four states of TikTok's commercial content disclosure. `none` is the creator having
 *  considered it and declared nothing — which is different from never having been asked. */
export const TIKTOK_DISCLOSURES = ["none", "your_brand", "branded_content", "both"] as const
export type TikTokDisclosure = (typeof TIKTOK_DISCLOSURES)[number]

export const TIKTOK_PRIVACY_LEVELS: readonly TikTokPrivacyLevel[] = [
  "PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY",
]

/** A complete, explicitly-made decision. Only ever constructed when all three are present. */
export type SavedTikTokSettings = {
  privacyLevel: TikTokPrivacyLevel
  allowedInteractions: TikTokInteraction[]
  disclosure: TikTokDisclosure
}

/** The columns these live in. Changing any of them is publish-affecting. */
export const PUBLISH_AFFECTING_COLUMNS = [
  "tiktok_privacy_level",
  "tiktok_allowed_interactions",
  "tiktok_disclosure",
] as const
export type PublishAffectingColumn = (typeof PUBLISH_AFFECTING_COLUMNS)[number]

const isPrivacy = (v: unknown): v is TikTokPrivacyLevel =>
  typeof v === "string" && (TIKTOK_PRIVACY_LEVELS as readonly string[]).includes(v)
const isDisclosure = (v: unknown): v is TikTokDisclosure =>
  typeof v === "string" && (TIKTOK_DISCLOSURES as readonly string[]).includes(v)
const isInteraction = (v: unknown): v is TikTokInteraction =>
  typeof v === "string" && (TIKTOK_INTERACTIONS as readonly string[]).includes(v)

/**
 * Normalise a stored interaction array: keep only known values, de-duplicate, and order
 * canonically so two equal sets never compare as different.
 *
 * Returns null only when the input is not an array at all — i.e. nothing was chosen. An empty
 * array survives as an empty array, because "allow nothing" is a decision.
 */
export function normaliseInteractions(v: unknown): TikTokInteraction[] | null {
  if (!Array.isArray(v)) return null
  const set = new Set(v.filter(isInteraction))
  return TIKTOK_INTERACTIONS.filter((i) => set.has(i))
}

/**
 * Read a complete decision off a post row, or null if one has not been made.
 *
 * ALL THREE OR NOTHING. A row carrying a privacy level but no disclosure is not a half-made
 * decision to be completed with assumptions — it is an incomplete one, and the only safe reading
 * is that the creator has not finished. Partial rows cannot occur once the CHECK constraint is
 * applied; this still refuses them, because code that depends on a constraint being present is
 * code that breaks quietly when it is not.
 */
export function readSavedSettings(row: Record<string, unknown> | null | undefined): SavedTikTokSettings | null {
  if (!row) return null
  const privacyLevel = row.tiktok_privacy_level
  const disclosure = row.tiktok_disclosure
  const allowedInteractions = normaliseInteractions(row.tiktok_allowed_interactions)
  if (!isPrivacy(privacyLevel)) return null
  if (!isDisclosure(disclosure)) return null
  if (allowedInteractions === null) return null
  return { privacyLevel, allowedInteractions, disclosure }
}

/**
 * THE DISCLOSURE ALONE — the part of the creator's decision that a third-party publisher can
 * actually carry.
 *
 * readSavedSettings above requires all three values because the NATIVE route transmits all three:
 * it calls TikTok's Content Posting API itself and sets privacy_level and the interaction toggles
 * on the request. A route that publishes through Buffer transmits exactly one of them — Buffer's
 * TikTokPostMetadataInput has `title` and `isAiGenerated` and nothing else — so requiring the
 * other two there would refuse posts without protecting anything, which is the worst kind of
 * gate: it looks like a safeguard and enforces nothing.
 *
 * The disclosure is the one that is BOTH ours to honour and transmissible, and it is the one with
 * a policy behind it: TikTok requires AI-generated and branded content to be disclosed. So that is
 * what the Buffer route requires. Privacy and interactions fall to the channel's own TikTok
 * defaults, which is a fact to state in the UI, not a value to pretend we set.
 */
export function readSavedDisclosure(row: Record<string, unknown> | null | undefined): TikTokDisclosure | null {
  if (!row) return null
  const disclosure = row.tiktok_disclosure
  return isDisclosure(disclosure) ? disclosure : null
}

/** Are these settings complete enough to schedule? Same rule as readSavedSettings, named for the
 *  gate that asks it so the call site reads as the requirement. */
export function hasCompleteTikTokSettings(row: Record<string, unknown> | null | undefined): boolean {
  return readSavedSettings(row) !== null
}

/** The API's two disclosure booleans, from the creator's single choice. */
export function disclosureToToggles(d: TikTokDisclosure): { yourBrand: boolean; brandedContent: boolean } {
  return {
    yourBrand: d === "your_brand" || d === "both",
    brandedContent: d === "branded_content" || d === "both",
  }
}

/** The creator's single choice, from the dialog's two checkboxes. The inverse of the above, so the
 *  dialog can save what it already collects without inventing a third representation. */
export function togglesToDisclosure(on: boolean, yourBrand: boolean, brandedContent: boolean): TikTokDisclosure {
  if (!on) return "none"
  if (yourBrand && brandedContent) return "both"
  if (brandedContent) return "branded_content"
  if (yourBrand) return "your_brand"
  // Disclosure switched on with neither box ticked is refused by the dialog and by
  // resolveContentDisclosure. Reaching here would mean both guards failed; "none" is the only
  // answer that cannot over-claim.
  return "none"
}

/** The API's three `disable_*` flags, from the allow-list. */
export function interactionsToDisableFlags(allowed: readonly TikTokInteraction[]): {
  disableComment: boolean; disableDuet: boolean; disableStitch: boolean
} {
  return {
    disableComment: !allowed.includes("comment"),
    disableDuet: !allowed.includes("duet"),
    disableStitch: !allowed.includes("stitch"),
  }
}

/**
 * Compare one stored value against one incoming value, for change detection.
 *
 * Mirrors valueChanged in renderInvalidation — same normalisation rules — with one addition: an
 * interaction array is compared by its NORMALISED contents, so ["duet","comment"] and
 * ["comment","duet"] are the same decision and do not spuriously un-approve a post.
 */
export function settingChanged(stored: unknown, incoming: unknown): boolean {
  const asArray = (v: unknown) => (Array.isArray(v) ? normaliseInteractions(v) : undefined)
  const a = asArray(stored)
  const b = asArray(incoming)
  if (a !== undefined || b !== undefined) {
    return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)
  }
  const norm = (v: unknown): string | null => {
    if (v === null || v === undefined) return null
    if (typeof v === "string") {
      const t = v.trim()
      return t === "" ? null : t
    }
    return String(v)
  }
  return norm(stored) !== norm(incoming)
}

/**
 * Which publish-affecting columns does this patch actually change?
 *
 * Change-based, not key-presence-based, for exactly the reason renderAffectingChanges is: the
 * dialog posts every field on every save, so "the key is present" would un-approve a post on a
 * no-op save. Returns the column names so the caller can tell the creator WHAT forced
 * re-approval — "re-approve this post" with no reason is the kind of message people learn to
 * click past.
 */
export function publishAffectingChanges(
  stored: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): PublishAffectingColumn[] {
  return PUBLISH_AFFECTING_COLUMNS.filter(
    (col) => col in patch && settingChanged(stored?.[col], patch[col]),
  )
}

export type SettingsValidation =
  | { ok: true; settings: SavedTikTokSettings }
  | { ok: false; reason: string; detail: string }

/**
 * Re-validate a saved decision against the creator's CURRENT capabilities, immediately before
 * publishing.
 *
 * A choice saved on Monday can name a privacy level the creator no longer offers by Thursday, or
 * permit a Duet they have since switched off in the TikTok app. TikTok requires Creator Info to be
 * fetched immediately before posting precisely because these things move.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO IS CLAMP. resolveDirectPostSelection silently narrows a
 * requested interaction to what the creator allows, which is correct for a human sitting in front
 * of the dialog — they can see the greyed-out control. Unattended, silently narrowing means
 * publishing something other than what was approved, with nobody told. So this REFUSES, and the
 * caller stops the post and asks for review.
 *
 * Narrowing is only ever safe in the direction nobody would object to, and there is no such
 * direction here: posting more privately than approved surprises the creator, and permitting an
 * interaction they disabled violates their setting.
 */
export function validateAgainstCreatorInfo(
  settings: SavedTikTokSettings,
  info: TikTokCreatorInfo,
  opts: { unaudited: boolean },
): SettingsValidation {
  if (!info.privacy_level_options?.includes(settings.privacyLevel)) {
    return {
      ok: false,
      reason: "privacy_no_longer_offered",
      detail: `The saved privacy setting (${settings.privacyLevel}) is no longer offered for this TikTok account. Re-approve this post with a current option.`,
    }
  }
  if (opts.unaudited && settings.privacyLevel !== "SELF_ONLY") {
    return {
      ok: false,
      reason: "unaudited_requires_self_only",
      detail: "This TikTok app is not yet audited, so only private (SELF_ONLY) posts are permitted. Re-approve this post as private.",
    }
  }
  const blocked: string[] = []
  if (settings.allowedInteractions.includes("comment") && info.comment_disabled) blocked.push("comments")
  if (settings.allowedInteractions.includes("duet") && info.duet_disabled) blocked.push("Duet")
  if (settings.allowedInteractions.includes("stitch") && info.stitch_disabled) blocked.push("Stitch")
  if (blocked.length > 0) {
    return {
      ok: false,
      reason: "interaction_no_longer_permitted",
      detail: `This post was approved allowing ${blocked.join(" and ")}, which this TikTok account no longer permits. Re-approve it with current settings.`,
    }
  }
  // TikTok forbids Branded Content on a private post. The dialog blocks it, and a saved pair could
  // only become invalid if privacy were edited afterwards — which un-approves the post anyway.
  // Checked regardless, because "cannot happen" is not a guarantee.
  const { brandedContent } = disclosureToToggles(settings.disclosure)
  if (brandedContent && settings.privacyLevel === "SELF_ONLY") {
    return {
      ok: false,
      reason: "branded_content_not_allowed_with_self_only",
      detail: "Branded Content cannot be declared on a private post. Re-approve this post with compatible settings.",
    }
  }
  return { ok: true, settings }
}
