/**
 * Can next/image's optimizer fetch this URL?
 *
 * ONE list, shared. This was duplicated inside AgentPhoto.tsx, which meant the allowlist existed
 * twice — once here in code and once in next.config.ts `images.remotePatterns` — with nothing
 * keeping them in step. They happen to agree today; a third avatar surface added against a new CDN
 * would not have been so lucky.
 *
 * WHY IT MATTERS THAT THIS IS CONSERVATIVE: next/image THROWS at render when handed an unlisted
 * remote host. On a public page that is a 500, not a missing picture. So an unrecognised host
 * degrades to an unoptimized (plain) load — slower, but the photo still appears and the page still
 * renders. Known hosts get the full treatment: same-origin delivery, AVIF/WebP, and Vercel's
 * immutable cache instead of the origin's short max-age.
 *
 * KEEP IN SYNC WITH next.config.ts images.remotePatterns. The test in
 * scripts/tests/avatar.test.ts reads both and fails if they drift.
 */
export const OPTIMIZABLE_HOSTS = ["res.cloudinary.com"] as const
export const OPTIMIZABLE_HOST_SUFFIXES = [".supabase.co"] as const

export function canOptimizeImage(url: string | null | undefined): boolean {
  if (!url) return false
  // A relative path is same-origin and always optimizable.
  if (url.startsWith("/")) return true
  try {
    const { hostname } = new URL(url)
    return OPTIMIZABLE_HOSTS.includes(hostname as (typeof OPTIMIZABLE_HOSTS)[number])
      || OPTIMIZABLE_HOST_SUFFIXES.some((s) => hostname.endsWith(s))
  } catch {
    // Not a parseable URL — never hand it to the optimizer.
    return false
  }
}

/** Initials from a display name. Two letters max; empty when there is no usable name. */
export function initialsOf(name: string | null | undefined, max = 2): string {
  return (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, max)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
}
