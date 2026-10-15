// WHICH TEMPLATE A DRAFT SHOULD USE — the single source of truth for both the preview and the
// applier, so what was reviewed is exactly what gets written.
//
// VARIETY COMES FROM SPREADING WITHIN A FAMILY, not from mapping each Unit Type to one template.
// Mapping types one-to-one reads well per draft and is worse across the library: it produced 8
// distinct headlines across 90 drafts, against 19 for the plain city/type default it replaced,
// with 28 of them reading "What life looks like when you upgrade". Spreading gives 28.
//
// THE CHOICE IS DETERMINISTIC, never random: a hash of the source video id. The same video always
// lands on the same template, across runs and across machines, so the proposal reviewed on Monday
// is the proposal applied on Tuesday.
import type { OverlayTemplate } from "./composePost"

export const TEMPLATE_FAMILIES: [RegExp, OverlayTemplate[]][] = [
  // Order matters: Split-Level Penthouse must match Penthouse, not Apartment.
  [/Penthouse/, ["wanted_luxury", "real_living", "property_tour", "would_you_live_here", "pov_upgrade"]],
  [/Loft/, ["real_living", "hits_different", "your_sign", "next_property"]],
  [/High-Rise/, ["real_living", "property_tour", "hits_different", "would_you_live_here"]],
  [/Townhome|Rental Home/, ["trade_up", "hits_different", "next_property", "your_sign", "real_living"]],
  [/Studio/, ["next_property", "your_sign"]],
  [/Apartment/, ["upgrade", "pov_upgrade", "next_property", "your_sign", "hits_different"]],
]

export function familyFor(unitType: string | null | undefined): OverlayTemplate[] | null {
  const t = (unitType ?? "").trim()
  if (!t) return null
  return TEMPLATE_FAMILIES.find(([re]) => re.test(t))?.[1] ?? null
}

/** Stable pick from a family. Plain FNV-style accumulation — no randomness, no clock, no order
 *  dependence, so the result cannot shift between the preview and the write. */
export function pickTemplate(sourceId: string, family: OverlayTemplate[]): OverlayTemplate {
  let h = 0
  for (const ch of sourceId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return family[h % family.length]
}
