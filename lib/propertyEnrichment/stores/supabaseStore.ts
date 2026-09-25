// Property Search Agent — Supabase-backed enrichment store (service-role).
//
// Built for the FUTURE enrichment job. It is NOT wired to any route/cron in this
// checkpoint — no property is enriched. Writes go through the optimistic
// updated_at guard so two jobs cannot silently clobber one another.

import { supabaseAdmin } from "@/lib/supabase/admin"
import { ENRICHMENT_WRITABLE_FIELDS, IMAGE_FIELDS, COMMISSION_FIELDS } from "../policy"
import type { EnrichmentStore } from "../store"
import type { EnrichmentEvent, FieldProvenance, ImageSelectionState, PropertySnapshot, SourceType, VerificationStatus } from "../types"

const READ_COLUMNS = Array.from(
  new Set(["place_id", "updated_at", "image_selection_state", ...ENRICHMENT_WRITABLE_FIELDS, ...IMAGE_FIELDS, ...COMMISSION_FIELDS]),
).join(", ")

export class SupabaseEnrichmentStore implements EnrichmentStore {
  async loadProperty(placeId: string): Promise<PropertySnapshot | null> {
    const { data } = await supabaseAdmin.from("property_catalog").select(READ_COLUMNS).eq("place_id", placeId).maybeSingle()
    if (!data) return null
    const row = data as Record<string, unknown>
    const values: Record<string, unknown> = {}
    for (const k of Object.keys(row)) {
      if (k === "place_id" || k === "updated_at" || k === "image_selection_state") continue
      values[k] = row[k]
    }
    return {
      placeId,
      updatedAt: (row.updated_at as string | null) ?? null,
      imageSelectionState: ((row.image_selection_state as ImageSelectionState) ?? "missing"),
      values,
    }
  }

  async currentProvenance(placeId: string): Promise<Record<string, FieldProvenance>> {
    const { data } = await supabaseAdmin
      .from("property_field_provenance")
      .select("field_name, value, source_type, verification_status")
      .eq("place_id", placeId)
    const out: Record<string, FieldProvenance> = {}
    for (const r of data ?? []) {
      out[r.field_name as string] = {
        sourceType: r.source_type as SourceType,
        verificationStatus: r.verification_status as VerificationStatus,
        value: (r.value as string | null) ?? null,
      }
    }
    return out
  }

  async applyPatch(
    placeId: string,
    patch: Record<string, unknown>,
    expectedUpdatedAt: string | null,
    imageState?: ImageSelectionState,
  ): Promise<boolean> {
    const update: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() }
    if (imageState) update.image_selection_state = imageState
    let q = supabaseAdmin.from("property_catalog").update(update).eq("place_id", placeId)
    // Optimistic concurrency: only patch if updated_at still matches what we loaded.
    q = expectedUpdatedAt === null ? q.is("updated_at", null) : q.eq("updated_at", expectedUpdatedAt)
    const { data, error } = await q.select("place_id")
    if (error) {
      console.error("[propertyEnrichment] applyPatch failed:", error.message)
      return false
    }
    return (data?.length ?? 0) > 0
  }

  async recordEvents(events: EnrichmentEvent[]): Promise<void> {
    if (events.length === 0) return
    const rows = events.map((e) => ({
      job_id: e.jobId,
      place_id: e.placeId,
      field_name: e.fieldName,
      action: e.action,
      old_value: e.oldValue,
      new_value: e.newValue,
      source_type: e.sourceType,
      source_reference: e.sourceReference,
      verification_status: e.verificationStatus,
      reason: e.reason,
      checked_at: e.checkedAt,
    }))
    const { error } = await supabaseAdmin.from("property_enrichment_events").insert(rows)
    if (error) console.error("[propertyEnrichment] recordEvents failed:", error.message)
  }
}
