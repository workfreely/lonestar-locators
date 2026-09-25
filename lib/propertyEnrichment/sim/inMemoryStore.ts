// Property Search Agent — in-memory enrichment store (TEST ONLY).
//
// Implements the same EnrichmentStore the production writer uses, so tests exercise
// the real writer logic with no DB. No network, no Supabase — cannot touch prod.

import type { AttributeRow, AttributeStore, EnrichmentStore } from "../store"
import type {
  EnrichmentEvent,
  FieldProvenance,
  ImageSelectionState,
  PropertySnapshot,
  SourceType,
  StoredAttribute,
  VerificationStatus,
} from "../types"

type Row = {
  values: Record<string, unknown>
  updatedAt: string | null
  imageSelectionState: ImageSelectionState
}

export class InMemoryEnrichmentStore implements EnrichmentStore, AttributeStore {
  private rows = new Map<string, Row>()
  events: EnrichmentEvent[] = []
  applyPatchCalls = 0
  private tokenSeq = 1
  // Optional forced concurrency conflict for the next applyPatch (test hook).
  failNextApplyPatch = false
  // Attribute state (EAV).
  private attributeKeys: Record<string, { category: string; valueKind: "tristate" | "text" }> = {}
  private attributes = new Map<string, Map<string, StoredAttribute>>()
  applyAttributesCalls = 0

  seedProperty(placeId: string, values: Record<string, unknown>, imageSelectionState: ImageSelectionState = "missing") {
    this.rows.set(placeId, { values: { ...values }, updatedAt: `v${this.tokenSeq++}`, imageSelectionState })
  }
  // Seed an existing verified/inferred provenance for a field (a prior 'written' event).
  putProvenance(placeId: string, field: string, prov: { sourceType: SourceType; verificationStatus: VerificationStatus; value: string | null }) {
    this.events.push({
      jobId: "seed",
      placeId,
      fieldName: field,
      action: "written",
      oldValue: null,
      newValue: prov.value,
      sourceType: prov.sourceType,
      sourceReference: null,
      verificationStatus: prov.verificationStatus,
      reason: "seed",
      checkedAt: null,
    })
  }
  setImageState(placeId: string, state: ImageSelectionState) {
    const r = this.rows.get(placeId)
    if (r) r.imageSelectionState = state
  }
  get(placeId: string): Row | undefined {
    return this.rows.get(placeId)
  }
  writtenEventFields(): string[] {
    return this.events.filter((e) => e.action === "written").map((e) => e.fieldName)
  }

  async loadProperty(placeId: string): Promise<PropertySnapshot | null> {
    const r = this.rows.get(placeId)
    if (!r) return null
    return { placeId, updatedAt: r.updatedAt, imageSelectionState: r.imageSelectionState, values: { ...r.values } }
  }

  async currentProvenance(placeId: string): Promise<Record<string, FieldProvenance>> {
    const out: Record<string, FieldProvenance> = {}
    for (const e of this.events) {
      if (e.placeId !== placeId || e.action !== "written") continue
      out[e.fieldName] = { sourceType: e.sourceType, verificationStatus: e.verificationStatus, value: e.newValue }
    }
    return out
  }

  async applyPatch(
    placeId: string,
    patch: Record<string, unknown>,
    expectedUpdatedAt: string | null,
    imageState?: ImageSelectionState,
  ): Promise<boolean> {
    this.applyPatchCalls++
    const r = this.rows.get(placeId)
    if (!r) return false
    if (this.failNextApplyPatch) {
      this.failNextApplyPatch = false
      return false
    }
    if (r.updatedAt !== expectedUpdatedAt) return false // optimistic concurrency conflict
    for (const k of Object.keys(patch)) r.values[k] = patch[k]
    if (imageState) r.imageSelectionState = imageState
    r.updatedAt = `v${this.tokenSeq++}`
    return true
  }

  async recordEvents(events: EnrichmentEvent[]): Promise<void> {
    this.events.push(...events)
  }

  // ── AttributeStore surface + test hooks ──
  seedAttributeKeys(keys: Record<string, { category: string; valueKind: "tristate" | "text" }>) {
    this.attributeKeys = { ...keys }
  }
  seedAttribute(placeId: string, attributeKey: string, attr: StoredAttribute) {
    if (!this.attributes.has(placeId)) this.attributes.set(placeId, new Map())
    this.attributes.get(placeId)!.set(attributeKey, attr)
  }
  getAttribute(placeId: string, attributeKey: string): StoredAttribute | undefined {
    return this.attributes.get(placeId)?.get(attributeKey)
  }

  async loadAttributeKeys(): Promise<Record<string, { category: string; valueKind: "tristate" | "text" }>> {
    return { ...this.attributeKeys }
  }
  async loadAttributes(placeId: string): Promise<Record<string, StoredAttribute>> {
    const m = this.attributes.get(placeId)
    if (!m) return {}
    return Object.fromEntries(m.entries())
  }
  async applyAttributes(placeId: string, rows: AttributeRow[]): Promise<void> {
    this.applyAttributesCalls++
    if (!this.attributes.has(placeId)) this.attributes.set(placeId, new Map())
    const m = this.attributes.get(placeId)!
    for (const r of rows) {
      m.set(r.attributeKey, {
        value: r.value,
        valueText: r.valueText,
        floorplanSpecific: r.floorplanSpecific,
        sourceType: r.sourceType,
        verificationStatus: r.verificationStatus,
        checkedAt: r.checkedAt,
      })
    }
  }
}
