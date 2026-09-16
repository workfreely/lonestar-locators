// Meta publisher-platform (site_source_name) → human label. Captured on the lead
// as meta_publisher_platform from the {{site_source_name}} URL macro at click.
//
// Meta's documented site_source_name tokens are short: "fb" (Facebook), "ig"
// (Instagram), "msg" (Messenger), "an" (Audience Network). We normalize ONLY
// these known tokens; anything else is Title-cased and shown as-is (never
// collapsed into Facebook/Instagram), so a new/unknown surface is visible rather
// than silently mislabeled. Pure/deterministic.

export type PublisherPlatform = {
  /** Canonical lowercase key for grouping/filtering (the raw token, trimmed + lowercased). */
  key: string
  /** Human label for display. */
  label: string
}

const KNOWN: Record<string, string> = {
  fb: "Facebook",
  ig: "Instagram",
  msg: "Messenger",
  an: "Audience Network",
}

// The bucket used when a lead has NO captured platform (organic, pre-macro ads,
// or non-Meta traffic). Kept distinct from any real surface.
export const UNKNOWN_PUBLISHER_PLATFORM: PublisherPlatform = { key: "unknown", label: "Unknown" }

export function normalizeMetaPublisherPlatform(raw: string | null | undefined): PublisherPlatform {
  const t = (raw ?? "").trim().toLowerCase()
  if (!t) return UNKNOWN_PUBLISHER_PLATFORM
  const known = KNOWN[t]
  if (known) return { key: t, label: known }
  // Unknown token — surface it, don't force it into fb/ig. Title-case for display.
  return { key: t, label: t.charAt(0).toUpperCase() + t.slice(1) }
}

// Convenience for display sites that just want the label.
export function metaPublisherPlatformLabel(raw: string | null | undefined): string {
  return normalizeMetaPublisherPlatform(raw).label
}
