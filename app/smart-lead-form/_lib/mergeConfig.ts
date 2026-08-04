import { DEFAULT_CONFIG } from "./defaultConfig"
import type { SmartLeadFormConfig } from "./types"

// Merge a saved (possibly older) config over DEFAULT_CONFIG so newly-added keys
// (e.g. the per-field `fields` toggles) always have sane defaults, even for
// forms published before those keys existed. Nested objects that can grow keys
// are merged one level deep; the rest take the saved value.
export function mergeSmartFormConfig(saved: unknown): SmartLeadFormConfig {
  const s = (saved ?? {}) as Partial<SmartLeadFormConfig> & {
    sections?: { visibility?: Record<string, boolean>; afterForm?: unknown }
  }
  return {
    ...DEFAULT_CONFIG,
    ...(s as object),
    sections: {
      ...DEFAULT_CONFIG.sections,
      ...(s.sections ?? {}),
      visibility: {
        ...DEFAULT_CONFIG.sections.visibility,
        ...((s.sections?.visibility as object) ?? {}),
      },
    },
    branding: { ...DEFAULT_CONFIG.branding, ...((s.branding as object) ?? {}) },
    copy: { ...DEFAULT_CONFIG.copy, ...((s.copy as object) ?? {}) },
    footer: { ...DEFAULT_CONFIG.footer, ...((s.footer as object) ?? {}) },
    consent: { ...DEFAULT_CONFIG.consent, ...((s.consent as object) ?? {}) },
    fields: { ...DEFAULT_CONFIG.fields, ...((s.fields as object) ?? {}) },
  }
}
