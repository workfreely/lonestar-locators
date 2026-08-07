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
  if (agentName) copy.agentName = agentName
  if (brokerageName) copy.brokerageName = brokerageName
  if (areasLabel) copy.serviceAreas = areasLabel
  if (phone) {
    copy.phoneNumber = phone
    // Lead-gen tool: show the locator's phone by default (they can hide it later).
    visibility.phoneNumber = true
  }
  if (heroTheme) branding.heroTheme = heroTheme

  const partial: Record<string, unknown> = {}
  if (Object.keys(copy).length) partial.copy = copy
  if (Object.keys(branding).length) partial.branding = branding
  if (Object.keys(visibility).length) partial.sections = { visibility }

  // Full config = personalized overrides merged over DEFAULT_CONFIG.
  return mergeSmartFormConfig(partial)
}
