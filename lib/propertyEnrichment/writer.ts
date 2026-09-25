// Property Search Agent — SAFE PATCH-ONLY enrichment writer.
//
// The single canonical write path for property_catalog enrichment. It NEVER
// replaces a record, NEVER nulls a field on missing research, structurally
// firewalls commission, and governs image replacement by image_selection_state.
// Store-injected so the same logic runs in production and in tests.

import {
  COMMISSION_FIELDS,
  ENRICHMENT_WRITABLE_FIELDS,
  IMAGE_FIELDS,
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

// Which IMAGE_FIELDS represent the actual accepted image (vs. its provenance/health
// metadata). Only the presence of a new primary URL flips state back to "keep".
const IMAGE_PRIMARY_FIELD = "property_image_url"

export async function enrichProperty(store: EnrichmentStore, input: EnrichmentInput): Promise<EnrichmentResult> {
  const dryRun = input.dryRun === true
  const results: FieldResult[] = []
  const patch: Record<string, unknown> = {}
  const events: EnrichmentEvent[] = []
  let nextImageState: ImageSelectionState | undefined

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
  const imageAuthorized = property.imageSelectionState === "missing" || property.imageSelectionState === "change_requested"

  for (const cand of input.fields) {
    const r = evaluate(cand, property, provenance, imageAuthorized)
    // Track intended mutations for real (non-dry-run) application.
    if (r.decision === "write") {
      patch[cand.field] = cand.value
      if (cand.field === IMAGE_PRIMARY_FIELD) nextImageState = "keep" // successful image → return to KEEP
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
    applied = await store.applyPatch(input.placeId, patch, property.updatedAt, nextImageState)
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

function evaluate(
  cand: FieldCandidate,
  property: { values: Record<string, unknown>; imageSelectionState: string },
  provenance: Record<string, import("./types").FieldProvenance>,
  imageAuthorized: boolean,
): Eval {
  const currentText = toStoredText(property.values[cand.field])

  // 1) COMMISSION FIREWALL — highest priority. Public-web (and any public source)
  //    has ZERO authority; and no authoritative commission provider is approved yet,
  //    so commission is not writable by ANY source in this checkpoint.
  if (COMMISSION_FIELDS.has(cand.field)) {
    const reason = PUBLIC_SOURCE_TYPES.has(cand.sourceType)
      ? "commission_firewall_public_web"
      : "commission_provider_not_approved"
    return { decision: "reject", reason, oldValue: currentText }
  }

  // 2) Provenance validity.
  if (!isKnownSourceType(cand.sourceType) || !isKnownVerification(cand.verificationStatus)) {
    return { decision: "reject", reason: "invalid_provenance", oldValue: currentText }
  }

  // 3) IMAGE fields — governed by image_selection_state, not the field allowlist.
  if (IMAGE_FIELDS.has(cand.field)) {
    if (!imageAuthorized) {
      // KEEP: never search/rescore/replace during routine enrichment.
      return { decision: "reject", reason: "image_locked_keep", oldValue: currentText }
    }
    // MISSING or CHANGE_REQUESTED: a verified image write is authorized.
    if (toStoredText(cand.value) === null) return { decision: "skip", reason: "no_value", oldValue: currentText }
    if (cand.verificationStatus === "unverified" || cand.verificationStatus === "unknown") {
      return { decision: "skip", reason: "image_candidate_unverified", oldValue: currentText }
    }
    return { decision: "write", reason: "image_" + property.imageSelectionState, oldValue: currentText }
  }

  // 4) Allowlist.
  if (!ENRICHMENT_WRITABLE_FIELDS.has(cand.field)) {
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
