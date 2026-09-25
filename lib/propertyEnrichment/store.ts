// Property Search Agent — enrichment store seam.
//
// The writer reads/writes ONLY through this interface, so production (Supabase,
// service-role) and the test harness (in-memory) run the identical writer logic.

import type { EnrichmentEvent, FieldProvenance, ImageSelectionState, PropertySnapshot } from "./types"

export interface EnrichmentStore {
  // Load the property + its optimistic-concurrency token + image state. Null = missing.
  loadProperty(placeId: string): Promise<PropertySnapshot | null>
  // Current provenance per field (latest 'written' event), keyed by field_name.
  currentProvenance(placeId: string): Promise<Record<string, FieldProvenance>>
  // PATCH specific columns, guarded by the optimistic updatedAt token. Returns true
  // if the row was updated (token matched), false on a concurrency conflict.
  // `imageState` (when provided) is written atomically with `patch`.
  applyPatch(
    placeId: string,
    patch: Record<string, unknown>,
    expectedUpdatedAt: string | null,
    imageState?: ImageSelectionState,
  ): Promise<boolean>
  // Append audit/provenance events (written/skipped/rejected).
  recordEvents(events: EnrichmentEvent[]): Promise<void>
}
