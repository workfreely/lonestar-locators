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
    consent: normalizeConsent(s.consent),
    fields: { ...DEFAULT_CONFIG.fields, ...((s.fields as object) ?? {}) },
  }
}

// Consent is MANDATORY on every public Smart Lead Form — it is no longer an
// agent choice. Enforcing that HERE, at the merge boundary, rather than in the
// form component is deliberate: every consumer already funnels through this
// function (the public /{username} page, /join/{slug}, and the editor), so the
// guarantee holds everywhere at once and no renderer has to re-check it.
//
// `enabled` is kept in the shape rather than deleted so that configs saved when
// consent WAS a toggle still parse. A stored `false` is simply normalized away
// here instead of being honoured — the flag survives as a legacy field, not as
// a behaviour.
//
// A blank message is not a valid state either: a required checkbox with an
// empty label gives the renter nothing to agree to. Whitespace-only counts as
// blank, and the default wording stands in.
function normalizeConsent(saved: unknown): SmartLeadFormConfig["consent"] {
  const merged = { ...DEFAULT_CONFIG.consent, ...((saved as object) ?? {}) }
  return {
    ...merged,
    enabled: true,
    text: merged.text?.trim() ? merged.text : DEFAULT_CONFIG.consent.text,
  }
}
