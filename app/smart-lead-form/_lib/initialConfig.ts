import { mergeSmartFormConfig } from "./mergeConfig"
import type { SmartLeadFormConfig } from "./types"
import { defaultThemeForMarkets, serviceAreasLabel } from "@/lib/markets/catalog"

// Build a full, personalized Smart Form config from the account data collected
// during onboarding (or already on the profile), layered over DEFAULT_CONFIG.
//
// This is the ONE source of truth for "an account's starting form" — used both
// by onboarding (new accounts) and the one-time backfill (existing accounts),
// so the two can never drift. Every field falls back safely to the default when
// its source data is missing, and the hero background defaults to the FIRST
// selected market via the shared defaultThemeForMarkets() logic (users can pick
// any background afterward — the market only chooses the initial default).

export type InitialFormInput = {
  agentName?: string | null
  brokerageName?: string | null
  phoneNumber?: string | null
  profilePhotoUrl?: string | null
  /** Workspace service-area slugs, in selection order (first = default background). */
  serviceAreas?: string[] | null
}

const clean = (v: string | null | undefined) => {
  const t = (v ?? "").trim()
  return t.length ? t : undefined
}

export function buildInitialSmartFormConfig(input: InitialFormInput): SmartLeadFormConfig {
  const areas = Array.isArray(input.serviceAreas) ? input.serviceAreas : []
  const agentName = clean(input.agentName)
  const brokerageName = clean(input.brokerageName)
  const phone = clean(input.phoneNumber)
  const areasLabel = clean(serviceAreasLabel(areas))
  const heroTheme = defaultThemeForMarkets(areas) ?? undefined
  // NOTE: the agent photo is intentionally NOT snapshotted into the form config.
  // It resolves live from profiles.profile_photo_url everywhere (single source of
  // truth), so a later Profile change propagates without editing the form.

  const copy: Record<string, unknown> = {}
  const branding: Record<string, unknown> = {}
  const visibility: Record<string, boolean> = {}

  // IDENTITY IS ALWAYS WRITTEN — never left to fall through to DEFAULT_CONFIG.
  //
  // The old build only assigned a field when its source value existed, so a new
  // account with a missing value silently inherited the design placeholder:
  // "Jordan Blake", "Placeholder Realty Group", "(210) 555-1234", and the sample
  // "Austin, Dallas, Houston" service areas — which is how a Florida agent ended
  // up with a form advertising three Texas cities under someone else's name.
  // Writing "" instead means a missing value renders as absent, never as fiction.
  copy.agentName = agentName ?? ""
  copy.brokerageName = brokerageName ?? ""
  copy.serviceAreas = areasLabel ?? ""
  copy.phoneNumber = phone ?? ""
  // The initials shown when there is no photo are derived from copy.agentName by
  // AgentPhoto, so clearing the placeholder name is also what stops "JB" from
  // appearing for an agent whose initials are not J.B.

  // Lead-gen tool: show the locator's phone only when we actually have one.
  visibility.phoneNumber = !!phone

  // NEW FORMS START CLEAN.
  // Headline: the feature stays fully available in the editor — this only sets
  // its INITIAL state, so "Stop Wasting Time Searching for Apartments" is never
  // published on a brand-new form before the agent has written their own.
  visibility.headline = false
  // Testimonials: the three samples are attributed to named people in Austin,
  // Dallas and Houston. On a new form they would read as genuine reviews of an
  // agent who has never had a client, in cities they may not even serve.
  visibility.testimonials = false

  // Hero background from the FIRST-selected market (defaultThemeForMarkets picks
  // slugs[0]). A market with no bundled skyline resolves to the neutral branded
  // fallback via themeImageUrl() — never another city's image.
  if (heroTheme) branding.heroTheme = heroTheme

  // copy and sections are ALWAYS present now, so identity can never be inherited.
  const partial: Record<string, unknown> = { copy, sections: { visibility } }
  if (Object.keys(branding).length) partial.branding = branding

  // Full config = personalized overrides merged over DEFAULT_CONFIG.
  return mergeSmartFormConfig(partial)
}
