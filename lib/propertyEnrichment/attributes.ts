// Property Search Agent — SAFE structured-attribute (EAV) writer.
//
// A second write surface, parallel to writer.ts: property_attributes rows (tri-state
// yes/no/unknown + text keys) with per-attribute provenance and floorplan_specific
// evidence. Same safety posture as the scalar writer — preserve-by-default, never
// downgrade a known fact to unknown, surface verified conflicts instead of
// overwriting, and NEVER promote a floorplan-specific feature to a universal one
// without verified authority. Store-injected; audited into property_enrichment_events.

import { isKnownSourceType, isKnownVerification } from "./policy"
import type { AttributeStore } from "./store"
import type {
  AttributeCandidate,
  AttributeInput,
  AttributeResult,
  EnrichmentEvent,
  Outcome,
  SourceType,
  StoredAttribute,
  VerificationStatus,
} from "./types"

const TRISTATE = new Set(["yes", "no", "unknown"])

/**
 * The ONLY attribute keys an authorized owner may correct once they are already populated.
 *
 * Deliberately a short, named list rather than "anything an owner sends". These are the three
 * the Map Property Editor exposes as tristate controls, and widening it is a decision someone
 * has to make on purpose — the same shape as OWNER_CORRECTABLE_FIELDS for scalar columns.
 */
export const OWNER_CORRECTABLE_ATTRIBUTE_KEYS = new Set([
  "private_yard",
  "attached_garage",
  "detached_garage",
])

// Authority for STRUCTURED ATTRIBUTE facts (distinct from scalar catalog fields):
// trusted internal sources and official property/management sites describe amenities,
// styles, views, etc. authoritatively. Google Places does not describe these; public
// web / unknown never do.
const ATTR_AUTHORITATIVE_SOURCES = new Set<SourceType>([
  "manual_verified",
  "trusted_locator_source",
  "trusted_brokerage_source",
  "official_property_site",
  "official_management_site",
])
function attrAuthoritative(sourceType: SourceType): boolean {
  return ATTR_AUTHORITATIVE_SOURCES.has(sourceType)
}

/** Normalize a candidate's stored fact: tristate → value token; text → trimmed text. */
function candidateFact(cand: AttributeCandidate, valueKind: "tristate" | "text"): string | null {
  if (valueKind === "text") {
    const t = (cand.valueText ?? "").trim()
    return t === "" ? null : t
  }
  const v = (cand.value ?? "").trim().toLowerCase()
  return TRISTATE.has(v) ? v : null
}
function existingFact(row: StoredAttribute, valueKind: "tristate" | "text"): string | null {
  if (valueKind === "text") {
    const t = (row.valueText ?? "").trim()
    return t === "" ? null : t
  }
  const v = (row.value ?? "").trim().toLowerCase()
  return TRISTATE.has(v) ? v : null
}

export type AttrDecision = { outcome: "write" | "skip"; reason: string }

/**
 * Decide whether one structured attribute should be written. Pure. Mirrors the scalar
 * preserve-by-default rules, plus tri-state nuances:
 *  • an explicit 'unknown' finding never overwrites a known yes/no (Unknown ≠ No);
 *  • a known yes/no DOES upgrade an existing 'unknown' (that's enrichment, not overwrite);
 *  • floorplan_specific=true → false (promotion to universal) requires verified authority;
 *  • verified + authoritative disagreement is surfaced as a conflict, never applied.
 */
export function decideAttributeWrite(args: {
  attributeKey: string
  valueKind: "tristate" | "text"
  candidateFact: string | null
  candidateFloorplanSpecific: boolean
  candidateSourceType: SourceType
  candidateVerification: VerificationStatus
  existing: StoredAttribute | null
  /** Set ONLY by a request that passed requirePlatformAdmin. See the owner branch below. */
  ownerOverride?: boolean
}): AttrDecision {
  const { attributeKey, valueKind, candidateFact: cv, candidateFloorplanSpecific, candidateSourceType, candidateVerification, existing, ownerOverride } = args

  // No finding → never write, never null an existing value.
  if (cv === null) return { outcome: "skip", reason: "no_value" }
  // Only verified/inferred findings are recorded; low-confidence never fills.
  if (candidateVerification === "unverified" || candidateVerification === "unknown") {
    return { outcome: "skip", reason: "candidate_unverified" }
  }

  const ev = existing ? existingFact(existing, valueKind) : null
  const authoritative = attrAuthoritative(candidateSourceType)

  // ── THE OWNER EXCEPTION ───────────────────────────────────────────────────────────────────
  // A human who has just stood in the building outranks preserve-by-default. Without this, an
  // owner correcting an already-populated value is refused as a conflict and the stale answer
  // stands — the same problem washer_dryer_included had, solved the same way.
  //
  // THREE LOCKS, ALL REQUIRED, exactly mirroring the scalar writer:
  //   1. ownerOverride — set only by a route that passed requirePlatformAdmin;
  //   2. sourceType manual_verified — the internal, non-public source type;
  //   3. the key is named in OWNER_CORRECTABLE_ATTRIBUTE_KEYS.
  //
  // PUBLIC SOURCES ARE NOT WEAKENED BY THIS. A public_web or google_places candidate can never
  // satisfy lock 2, so every rule below still applies to it unchanged. The owner branch is
  // additive: it opens one door for one caller, and widens nothing else.
  //
  // Unknown ≠ No still holds even here. An owner choosing "Unknown" is asking to RESET a fact
  // to not-researched, which is a clear, not an overwrite, and is handled by the explicit
  // ownerClear path in the writer — not by writing the token 'unknown' over a known value.
  if (
    ownerOverride === true &&
    candidateSourceType === "manual_verified" &&
    OWNER_CORRECTABLE_ATTRIBUTE_KEYS.has(attributeKey)
  ) {
    if (valueKind === "tristate" && cv === "unknown" && (ev === "yes" || ev === "no")) {
      return { outcome: "skip", reason: "owner_unknown_is_not_a_clear" }
    }
    if (ev === cv && (existing?.floorplanSpecific === true) === candidateFloorplanSpecific) {
      return { outcome: "skip", reason: "unchanged" }
    }
    return { outcome: "write", reason: "owner_override" }
  }

  // Empty → eligible. (Recording an explicit verified 'unknown' when nothing exists is
  // allowed: it documents "checked, not stated".)
  if (ev === null) return { outcome: "write", reason: "fill_empty" }

  const state = !existing?.verificationStatus
    ? "legacy"
    : existing.verificationStatus === "verified"
      ? "verified"
      : "tracked"

  if (valueKind === "tristate") {
    // Never downgrade a known yes/no to unknown.
    if (cv === "unknown" && (ev === "yes" || ev === "no")) return { outcome: "skip", reason: "preserve_known" }
    // Upgrade an existing 'unknown' to a real finding — enrichment, not overwrite.
    if (ev === "unknown" && (cv === "yes" || cv === "no")) return { outcome: "write", reason: "upgrade_from_unknown" }
    // Same fact: consider floorplan_specific scope.
    if (ev === cv) {
      const exFp = existing?.floorplanSpecific === true
      if (exFp === candidateFloorplanSpecific) return { outcome: "skip", reason: "unchanged" }
      // Narrowing universal → floorplan-specific is safe (more conservative).
      if (!exFp && candidateFloorplanSpecific) return { outcome: "write", reason: "narrow_to_floorplan_specific" }
      // Promotion floorplan-specific → universal needs verified authority; else preserve.
      if (candidateVerification === "verified" && authoritative) return { outcome: "write", reason: "promote_verified" }
      return { outcome: "skip", reason: "preserve_floorplan_scope" }
    }
    // Differing known values → conflict when verified+authoritative, else preserve.
    if (candidateVerification === "verified" && authoritative) return { outcome: "skip", reason: `conflict_${state}` }
    return { outcome: "skip", reason: `preserve_${state}` }
  }

  // text keys (building_style, ceiling_height, color_scheme)
  if (ev === cv) return { outcome: "skip", reason: "unchanged" }
  if (candidateVerification === "verified" && authoritative) return { outcome: "skip", reason: `conflict_${state}` }
  return { outcome: "skip", reason: `preserve_${state}` }
}

/** Apply attribute candidates through the store (preserve-by-default, audited). */
export async function writeAttributes(store: AttributeStore, input: AttributeInput): Promise<AttributeResult> {
  const dryRun = input.dryRun === true
  const results: AttributeResult["results"] = []
  const events: EnrichmentEvent[] = []

  const property = await store.loadProperty(input.placeId)
  if (!property) {
    return {
      placeId: input.placeId,
      jobId: input.jobId,
      dryRun,
      applied: false,
      results: input.attributes.map((a) => ({ attributeKey: a.attributeKey, outcome: rej(dryRun), reason: "property_not_found" })),
    }
  }

  const dict = await store.loadAttributeKeys()
  const existing = await store.loadAttributes(input.placeId)
  const toUpsert: import("./store").AttributeRow[] = []

  for (const cand of input.attributes) {
    const meta = dict[cand.attributeKey]
    let decision: "write" | "skip" | "reject"
    let reason: string
    const prior = existing[cand.attributeKey] ?? null

    if (!meta) {
      decision = "reject"
      reason = "unknown_attribute_key"
    } else if (!isKnownSourceType(cand.sourceType) || !isKnownVerification(cand.verificationStatus)) {
      decision = "reject"
      reason = "invalid_provenance"
    } else {
      const valueKind = meta.valueKind
      const cv = candidateFact(cand, valueKind)
      // Shape check: a value in the wrong slot (tristate token on a text key, or free
      // text on a tristate key) is a caller bug — reject loudly rather than skip silently.
      const wrongSlot =
        valueKind === "text"
          ? cand.valueText == null && cand.value != null
          : cand.value == null && cand.valueText != null
      if (wrongSlot) {
        decision = "reject"
        reason = "value_kind_mismatch"
      } else {
        // Effective scope: applicability (when supplied) is authoritative; else the raw
        // floorplanSpecific flag. Must match what gets stored, or re-applying an
        // applicability-scoped value would look like a promotion (non-idempotent).
        const appl = cand.applicability ?? null
        const effectiveFp =
          appl != null ? appl !== "property_wide" && appl !== "unknown" : cand.floorplanSpecific === true
        const d = decideAttributeWrite({
          attributeKey: cand.attributeKey,
          valueKind,
          candidateFact: cv,
          candidateFloorplanSpecific: effectiveFp,
          candidateSourceType: cand.sourceType,
          candidateVerification: cand.verificationStatus,
          existing: prior,
          // BOTH halves required. The candidate's flag states intent; the request's states
          // authority, and only a handler past requirePlatformAdmin can set it. Neither alone
          // opens the owner branch.
          ownerOverride: input.ownerAuthorized === true && cand.ownerOverride === true,
        })
        decision = d.outcome
        reason = d.reason
      }
    }

    if (decision === "write" && meta) {
      // applicability (when supplied) is the source of truth for scope; floorplanSpecific
      // is derived so "select units / specific floor plans / penthouses" is never a
      // property-wide Yes.
      const applicability = cand.applicability ?? null
      const fpFromApplicability =
        applicability != null && applicability !== "property_wide" && applicability !== "unknown"
      toUpsert.push({
        placeId: input.placeId,
        attributeKey: cand.attributeKey,
        value: meta.valueKind === "tristate" ? (cand.value ?? "").trim().toLowerCase() : null,
        valueText: meta.valueKind === "text" ? (cand.valueText ?? "").trim() : null,
        floorplanSpecific: applicability != null ? fpFromApplicability : cand.floorplanSpecific === true,
        applicability,
        sourceType: cand.sourceType,
        sourceReference: cand.sourceReference ?? null,
        verificationStatus: cand.verificationStatus,
        checkedAt: cand.checkedAt ?? new Date().toISOString(),
        mergeRunId: input.jobId,
      })
    }

    const priorFact = prior && meta ? existingFact(prior, meta.valueKind) : null
    const newFact = meta ? candidateFact(cand, meta.valueKind) : null
    results.push({ attributeKey: cand.attributeKey, outcome: toOutcome(decision, dryRun), reason })
    events.push({
      jobId: input.jobId,
      placeId: input.placeId,
      fieldName: cand.attributeKey,
      action: decision === "write" ? "written" : decision === "reject" ? "rejected" : "skipped",
      oldValue: priorFact,
      newValue: newFact,
      sourceType: cand.sourceType,
      sourceReference: cand.sourceReference ?? null,
      verificationStatus: cand.verificationStatus,
      reason,
      checkedAt: cand.checkedAt ?? null,
    })
  }

  if (dryRun) return { placeId: input.placeId, jobId: input.jobId, dryRun: true, applied: false, results }

  if (toUpsert.length > 0) await store.applyAttributes(input.placeId, toUpsert)
  await store.recordEvents(events)
  return { placeId: input.placeId, jobId: input.jobId, dryRun: false, applied: true, results }
}

function toOutcome(d: "write" | "skip" | "reject", dryRun: boolean): Outcome {
  if (dryRun) return d === "write" ? "would_write" : d === "reject" ? "would_reject" : "would_skip"
  return d === "write" ? "written" : d === "reject" ? "rejected" : "skipped"
}
function rej(dryRun: boolean): Outcome {
  return dryRun ? "would_reject" : "rejected"
}
