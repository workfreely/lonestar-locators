// Property Search Agent — SAFE PATCH-ONLY enrichment writer.
//
// The single canonical write path for property_catalog enrichment. It NEVER
// replaces a record, NEVER nulls a field on missing research, structurally
// firewalls commission, and governs image replacement by image_selection_state.
// Store-injected so the same logic runs in production and in tests.

import {
  COMMISSION_FIELDS,
  OWNER_COMMISSION_FIELDS,
  ENRICHMENT_WRITABLE_FIELDS,
  IMAGE_FIELDS,
  IMAGE_BACKUP_FIELDS,
  PUBLIC_SOURCE_TYPES,
  decideFieldWrite,
  isKnownSourceType,
  isKnownVerification,
  toStoredText,
} from "./policy"
import type { EnrichmentStore } from "./store"
import type {
  EnrichmentEvent,
  EnrichmentInput,
  EnrichmentResult,
  FieldCandidate,
  FieldResult,
  ImageSelectionState,
  Outcome,
} from "./types"

// Which IMAGE_FIELDS represent the actual accepted image URLs (vs. provenance/health
// metadata). Only the presence of a new slot URL flips THAT slot's state back to "keep".
const IMAGE_PRIMARY_FIELD = "property_image_url"
const IMAGE_BACKUP_FIELD = "property_image_url_backup"

export async function enrichProperty(store: EnrichmentStore, input: EnrichmentInput): Promise<EnrichmentResult> {
  const dryRun = input.dryRun === true
  const results: FieldResult[] = []
  const patch: Record<string, unknown> = {}
  const events: EnrichmentEvent[] = []
  let nextImageState: ImageSelectionState | undefined
  let nextBackupState: ImageSelectionState | undefined

  const property = await store.loadProperty(input.placeId)
  if (!property) {
    return {
      placeId: input.placeId,
      jobId: input.jobId,
      dryRun,
      applied: false,
      results: input.fields.map((f) => ({ field: f.field, outcome: rej(dryRun), reason: "property_not_found" })),
    }
  }
  const provenance = await store.currentProvenance(input.placeId)

  // Whether ANY image field is being proposed (governs the image gate).
  const wantsImageWrite = input.fields.some((f) => IMAGE_FIELDS.has(f.field))
  // Per-SLOT authorization — a slot is writable only while its own state is missing/change_requested.
  const imageAuthorized = property.imageSelectionState === "missing" || property.imageSelectionState === "change_requested"
  const imageBackupAuthorized = property.imageBackupState === "missing" || property.imageBackupState === "change_requested"

  for (const cand of input.fields) {
    const r = evaluate(cand, property, provenance, imageAuthorized, imageBackupAuthorized, input.ownerAuthorized === true)
    // Track intended mutations for real (non-dry-run) application.
    if (r.decision === "write") {
      patch[cand.field] = cand.value
      if (cand.field === IMAGE_PRIMARY_FIELD) nextImageState = "keep" // successful PRIMARY → lock that slot to KEEP
      if (cand.field === IMAGE_BACKUP_FIELD) nextBackupState = "keep" // successful FALLBACK → lock that slot to KEEP
    }
    results.push({
      field: cand.field,
      outcome: toOutcome(r.decision, dryRun),
      reason: r.reason,
      oldValue: r.oldValue ?? null,
      newValue: r.decision === "write" ? toStoredText(cand.value) : null,
    })
    events.push({
      jobId: input.jobId,
      placeId: input.placeId,
      fieldName: cand.field,
      action: r.decision === "write" ? "written" : r.decision === "reject" ? "rejected" : "skipped",
      oldValue: r.oldValue ?? null,
      newValue: toStoredText(cand.value),
      sourceType: cand.sourceType,
      sourceReference: cand.sourceReference ?? null,
      verificationStatus: cand.verificationStatus,
      reason: r.reason,
      checkedAt: cand.checkedAt ?? null,
    })
  }
  void wantsImageWrite

  // Dry-run: compute only, mutate nothing.
  if (dryRun) {
    return { placeId: input.placeId, jobId: input.jobId, dryRun: true, applied: false, results }
  }

  // Writer-derived metadata (NOT candidate fields, so not gated by the allowlist):
  //  • a fresh current_special write couples its freshness stamp (checked_at + source),
  //    so a future Specials Refresh can reason about staleness WITHOUT touching stable
  //    attributes;
  //  • any successful patch stamps intel_enriched_at as the last-pass marker.
  if (Object.prototype.hasOwnProperty.call(patch, "current_special")) {
    const specialCand = input.fields.find((f) => f.field === "current_special")
    patch.current_special_checked_at = specialCand?.checkedAt ?? new Date().toISOString()
    patch.current_special_source = specialCand?.sourceReference ?? specialCand?.sourceType ?? null
  }
  if (Object.keys(patch).length > 0) {
    patch.intel_enriched_at = new Date().toISOString()
  }

  // Nothing to write → still record the audit trail (skips/rejects), no patch.
  const hasWrites = Object.keys(patch).length > 0
  let applied = true
  if (hasWrites) {
    applied = await store.applyPatch(input.placeId, patch, property.updatedAt, nextImageState, nextBackupState)
    if (!applied) {
      // Concurrency conflict: another job moved updatedAt. Do NOT overwrite; downgrade
      // every intended write to skipped, and record the conflict (no false provenance).
      for (const res of results) {
        if (res.outcome === "written") {
          res.outcome = "skipped"
          res.reason = "concurrency_conflict"
        }
      }
      for (const ev of events) {
        if (ev.action === "written") {
          ev.action = "skipped"
          ev.reason = "concurrency_conflict"
        }
      }
    }
  }

  await store.recordEvents(events)
  return { placeId: input.placeId, jobId: input.jobId, dryRun: false, applied, results }
}

type Eval = { decision: "write" | "skip" | "reject"; reason: string; oldValue?: string | null }

/**
 * Is this candidate an authenticated owner's deliberate commission write?
 *
 * FOUR conditions, and they are deliberately of two different KINDS. `ownerAuthorized` is a
 * property of the REQUEST — the server proved who is calling. `ownerOverride` is a property of
 * the DATA — this value is an intentional correction. Requiring both means a candidate can never
 * authorize itself: data does not grant permission.
 */
function ownerCommissionWrite(cand: FieldCandidate, ownerAuthorized: boolean): boolean {
  return (
    ownerAuthorized === true &&
    cand.ownerOverride === true &&
    cand.sourceType === "manual_verified" &&
    OWNER_COMMISSION_FIELDS.has(cand.field)
  )
}

function evaluate(
  cand: FieldCandidate,
  property: { values: Record<string, unknown>; imageSelectionState: string; imageBackupState: string },
  provenance: Record<string, import("./types").FieldProvenance>,
  imageAuthorized: boolean,
  imageBackupAuthorized: boolean,
  /** Request-level: the caller already authenticated and authorized a platform owner. */
  ownerAuthorized: boolean,
): Eval {
  const currentText = toStoredText(property.values[cand.field])

  // 1) COMMISSION FIREWALL — highest priority. Public-web (and any public source) has ZERO
  //    authority, and no automated commission provider is approved, so commission remains
  //    unwritable by every enrichment path.
  //
  //    THE ONE EXCEPTION is an authenticated platform owner typing a rate they have verified.
  //    It needs FOUR independent things to be true at once, and the first is the important one:
  //
  //      a. ownerAuthorized on the REQUEST — the server ran its own authorization check for this
  //         call. A candidate cannot set this; it does not travel with data.
  //      b. ownerOverride on the CANDIDATE — this particular value is a deliberate correction.
  //      c. sourceType manual_verified — not a scraped or inferred source.
  //      d. the field is in OWNER_COMMISSION_FIELDS — a set kept deliberately OUT of the general
  //         enrichment allowlist, so no job can reach it.
  //
  //    (b) ALONE GRANTS NOTHING. That is the whole point of splitting (a) from (b): a forged or
  //    replayed candidate carrying ownerOverride still meets a closed firewall, because the
  //    request never proved who was asking.
  if (COMMISSION_FIELDS.has(cand.field)) {
    if (!ownerCommissionWrite(cand, ownerAuthorized)) {
      const reason = PUBLIC_SOURCE_TYPES.has(cand.sourceType)
        ? "commission_firewall_public_web"
        : "commission_provider_not_approved"
      return { decision: "reject", reason, oldValue: currentText }
    }
  }

  // 2) Provenance validity.
  if (!isKnownSourceType(cand.sourceType) || !isKnownVerification(cand.verificationStatus)) {
    return { decision: "reject", reason: "invalid_provenance", oldValue: currentText }
  }

  // 3) IMAGE fields — governed by PER-SLOT state, not the field allowlist. Each slot
  //    (PRIMARY = property_image_url, FALLBACK = property_image_url_backup) is authorized
  //    independently; a locked (keep) slot NEVER writes, so an existing accepted image of
  //    either slot can only be replaced via that slot's explicit change_requested.
  if (IMAGE_FIELDS.has(cand.field)) {
    const isBackup = IMAGE_BACKUP_FIELDS.has(cand.field)
    const slotAuthorized = isBackup ? imageBackupAuthorized : imageAuthorized
    const slotState = isBackup ? property.imageBackupState : property.imageSelectionState
    if (!slotAuthorized) {
      // KEEP: never search/rescore/replace this slot during routine enrichment.
      return { decision: "reject", reason: isBackup ? "image_backup_locked_keep" : "image_locked_keep", oldValue: currentText }
    }
    // MISSING or CHANGE_REQUESTED: a verified image write is authorized for THIS slot.
    if (toStoredText(cand.value) === null) return { decision: "skip", reason: "no_value", oldValue: currentText }
    if (cand.verificationStatus === "unverified" || cand.verificationStatus === "unknown") {
      return { decision: "skip", reason: "image_candidate_unverified", oldValue: currentText }
    }
    return { decision: "write", reason: (isBackup ? "image_backup_" : "image_") + slotState, oldValue: currentText }
  }

  // 4) Allowlist. Commission columns are deliberately ABSENT from it — the owner path is
  //    admitted by the firewall above instead, so opening this door never widens what an
  //    automated job may write.
  if (!ENRICHMENT_WRITABLE_FIELDS.has(cand.field) && !ownerCommissionWrite(cand, ownerAuthorized)) {
    return { decision: "reject", reason: "not_writable", oldValue: currentText }
  }

  // 5) Field-aware write decision (preserve verified, never null, idempotent).
  const d = decideFieldWrite({
    field: cand.field,
    candidateText: toStoredText(cand.value),
    candidateSourceType: cand.sourceType,
    candidateVerification: cand.verificationStatus,
    currentText,
    currentProvenance: provenance[cand.field] ?? null,
    // Explicit owner correction. Undefined on every enrichment path, so this cannot widen
    // what an automated job is allowed to replace — see FieldCandidate.ownerOverride.
    candidateOwnerOverride: cand.ownerOverride === true,
    // Explicit clear-to-unknown. Undefined on every enrichment path — see ownerClear.
    candidateOwnerClear: cand.ownerClear === true,
  })
  return { decision: d.outcome, reason: d.reason, oldValue: currentText }
}

function toOutcome(d: "write" | "skip" | "reject", dryRun: boolean): Outcome {
  if (dryRun) return d === "write" ? "would_write" : d === "reject" ? "would_reject" : "would_skip"
  return d === "write" ? "written" : d === "reject" ? "rejected" : "skipped"
}
function rej(dryRun: boolean): Outcome {
  return dryRun ? "would_reject" : "rejected"
}
