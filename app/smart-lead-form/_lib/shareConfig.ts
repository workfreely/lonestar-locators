// Public URL helpers for the Smart Lead Form. The username IS the workspace slug
// (already hyphenated by the DB `slugify`, e.g. "Jay Morris" → "jay-morris"), so
// these just format it — they never re-derive or concatenate a name. SharePanel
// passes the real slug in; FALLBACK_USERNAME stands in only until one is assigned
// (kept hyphenated so it matches the real format).
export const PUBLIC_URL_HOST = "locatorbeast.com"
export const FALLBACK_USERNAME = "your-username"

export function publicPagePath(username: string) {
  return `${PUBLIC_URL_HOST}/${username}`
}

export function publicPageUrl(username: string) {
  return `https://${publicPagePath(username)}`
}

export type SharePlatform = {
  id: string
  label: string
  utmSource: string
  /** The short path segment in the clean branded URL: locatorbeast.com/{username}/{slug}. */
  slug: string
}

// The one thing a locator has to know is "which button to click" — the
// utm_source mapping happens here, invisibly, per the spec's explicit
// instruction not to expose UTM parameters in the UI.
//
// `slug` is the PUBLIC short form and `utmSource` is the INTERNAL attribution value. They are
// paired here, in one table, so the clean URL and the long UTM link can never disagree about what
// a click means — a branded /tt link and a legacy ?utm_source=tiktok link both resolve to the same
// canonical "tiktok", which is what lib/leads/attribution.normalizeSource already expects.
export const SHARE_PLATFORMS: SharePlatform[] = [
  { id: "instagram", label: "Instagram", utmSource: "instagram", slug: "ig" },
  { id: "facebook", label: "Facebook", utmSource: "facebook", slug: "fb" },
  // ADMIN-ONLY. Routable like any other slug, but the public page 404s unless the username
  // resolves to ADMIN_WORKSPACE_ID, and the Share panel only renders it for that workspace.
  // Registered here so the clean URL and the attribution value cannot drift apart.
  { id: "facebook_second_chance", label: "Facebook — Second Chance", utmSource: "facebook_second_chance", slug: "fb-second-chance" },
  { id: "tiktok", label: "TikTok", utmSource: "tiktok", slug: "tt" },
  { id: "youtube", label: "YouTube", utmSource: "youtube", slug: "yt" },
  { id: "google", label: "Google Business", utmSource: "google", slug: "google" },
  { id: "email", label: "Email", utmSource: "email", slug: "email" },
]

// Routable slugs that are NOT share buttons: typed/!scanned traffic the panel does not render a
// copy control for, but which must still resolve and attribute.
const EXTRA_SOURCE_SLUGS: { slug: string; utmSource: string }[] = [
  { slug: "direct", utmSource: "direct" },
  { slug: "qr", utmSource: "qr" },
]

/** Every routable source slug → its internal utm_source. The ONE place the mapping lives. */
export const SOURCE_SLUG_TO_UTM: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries([
    ...SHARE_PLATFORMS.map((p) => [p.slug, p.utmSource]),
    ...EXTRA_SOURCE_SLUGS.map((e) => [e.slug, e.utmSource]),
  ]),
)

/** The internal utm_source for a public slug, or null when the slug is not one we issue.
 *  Case-insensitive so a link typed in caps still attributes; never invents a value. */
export function utmSourceForSlug(slug: string | null | undefined): string | null {
  const s = (slug ?? "").trim().toLowerCase()
  return SOURCE_SLUG_TO_UTM[s] ?? null
}

/** The CLEAN branded share URL: https://locatorbeast.com/{username}/{slug}. No query string —
 *  attribution travels in the path and is resolved server-side. */
export function buildCleanShareUrl(username: string, slug: string) {
  return `${publicPageUrl(username)}/${slug}`
}

/** The LEGACY query-string share URL. No longer shown or copied anywhere, but kept because those
 *  links are already live in bios, QR codes and printed material and must keep working — and because
 *  the backward-compatibility tests assert against the exact historical format. */
export function buildShareUrl(username: string, utmSource: string) {
  return `${publicPageUrl(username)}?utm_source=${utmSource}`
}

/**
 * The ONE workspace permitted to use the second-chance variant.
 *
 * A workspace id, not a username: the public route resolves the username server-side through
 * lb_resolve_public_form, so another subscriber putting their own slug in front of
 * /fb-second-chance resolves to THEIR workspace, fails this check and gets a 404. A username
 * comparison would be a string anyone can type.
 */
export const ADMIN_WORKSPACE_ID = "037ad3c2-d7cc-49a2-b0d1-4fc06c458409"

/** Share slugs that only ADMIN_WORKSPACE_ID may see or serve. */
export const ADMIN_ONLY_SLUGS: ReadonlySet<string> = new Set(["fb-second-chance"])

/** Is this slug restricted, and is the given workspace allowed it? */
export function slugAllowedForWorkspace(slug: string, workspaceId: string | null | undefined): boolean {
  if (!ADMIN_ONLY_SLUGS.has((slug ?? "").trim().toLowerCase())) return true
  return (workspaceId ?? "") === ADMIN_WORKSPACE_ID
}
