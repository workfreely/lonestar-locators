import { notFound } from "next/navigation"
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember"
import OutOfOfficeView from "@/app/locator-beast/[username]/out-of-office/OutOfOfficeView"

/**
 * AUTHENTICATED PREVIEW of the locator's own Out-of-Office page.
 *
 * Exists because the public page correctly 404s while Out of Office is OFF, so
 * "Preview Out of Office Page" was unusable exactly when a locator most wants it
 * — before going away, to see what clients will get.
 *
 * ── WHY A ROUTE AND NOT `?preview=1` ────────────────────────────────────────
 * A query parameter on the public page would be a public bypass of the gate:
 * anyone who guessed it could read "I'm out of the office until…" about a
 * locator who is working. The gate's whole job is to stop that. So the exemption
 * lives behind authentication instead, and the username is NOT an input — it is
 * resolved from the caller's own session, which means this route cannot be aimed
 * at another locator's workspace even by someone signed in.
 *
 * ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
 * Renders. That is all. It performs no write of any kind: out_of_office_enabled
 * is not read as a condition and never set, out_of_office_until is displayed
 * from storage and never changed, and no lead, run, intent, share or
 * recommendation is touched. Opening the preview leaves the workspace in exactly
 * the state it was in, so a locator can look at the page while still "in the
 * office" and nothing about their automation changes.
 *
 * The public route keeps its gate untouched: OOO ON → page, OOO OFF → 404.
 */
export const dynamic = "force-dynamic"

export default async function OutOfOfficePreviewPage() {
  const guard = await requireWorkspaceMember()
  // 404 rather than the guard's 401/403 JSON: this is a PAGE, and an unauthorized
  // visitor should simply find nothing here.
  if (!guard.ok) notFound()

  // The username comes from the SESSION's workspace, never from params or a query
  // — that is what stops this being a way to preview someone else's page.
  const { data } = await guard.supabase
    .from("workspaces")
    .select("slug")
    .eq("id", guard.workspaceId)
    .maybeSingle()
  const slug = (data as { slug: string | null } | null)?.slug
  if (!slug) notFound()

  return <OutOfOfficeView username={slug} preview />
}
