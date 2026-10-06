import PublicFormView, { publicFormMetadata } from "./_lib/publicForm"

export const dynamic = "force-dynamic"

// Minimal, image-first link preview. The visual is the per-agent opengraph-image.tsx
// (Next wires og:image + twitter:image from it automatically, as an absolute URL via
// metadataBase). Title is locator-specific; NO description (summary_large_image renders
// image-first, and long marketing copy is intentionally avoided).
export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  return publicFormMetadata(username)
}

// Public per-agent Smart Lead Form — served at locatorbeast.com/{username}
// (rewritten to /locator-beast/{username} on the marketing host). The username
// is the workspace's public slug; everything is resolved SERVER-SIDE from public
// data only (lb_resolve_public_form) — no private data, no client trust. Real
// marketing pages (features, pricing, …) are explicit sibling routes and take
// precedence over this dynamic segment.
//
// Every account has ONE always-live Smart Form: there is no draft/published
// split. The form renders whenever the slug resolves to a workspace — it renders
// the latest SAVED config (merged over defaults), so `published_at` is NOT a
// gate. Only an unknown/invalid slug (no row) or an RPC error 404s.
//
// The rendering itself lives in ./_lib/publicForm so the branded source route
// (/{username}/{source}) serves the identical form with no redirect.
export default async function PublicSmartLeadFormPage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  // No path-derived attribution on the base link: a visitor here either carries
  // utm_* in the query (legacy links, ads) or is genuinely unattributed.
  return <PublicFormView username={username} />
}
