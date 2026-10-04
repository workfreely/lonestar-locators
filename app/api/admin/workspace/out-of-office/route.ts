export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember"

/**
 * OUT OF OFFICE — the locator-facing read/write for their own workspace state.
 *
 * This is the ONLY writer of workspaces.out_of_office_enabled / _until. The
 * public landing page reads the same two columns through
 * lb_workspace_out_of_office(username) (anon, read-only, security definer); the
 * lead-intake path reads out_of_office_enabled once at creation time. Neither is
 * touched here.
 *
 * ── WHAT TURNING THIS ON ACTUALLY DOES ──────────────────────────────────────
 * Exactly two things, and nothing else:
 *   1. the public /{username}/out-of-office page starts saying the locator is away;
 *   2. a lead created from that point is stamped leads.ooo_held_at, which makes
 *      lifecycleSeed's new_lead branch decline to enrol the opening pair.
 * It does NOT pause, cancel, reschedule or alter any EXISTING run, intent, claim
 * or send; it does not touch recommendation shares, Beast Sync, criteria
 * extraction, or any lead that already exists. Flipping it off does not resume
 * anything either — a held lead is restarted only by the explicit per-lead Start
 * Follow-Up action.
 *
 * ── WORKSPACE IDENTITY ──────────────────────────────────────────────────────
 * Derived ENTIRELY from the session by requireWorkspaceMember(), never from the
 * body or a query param, and never from a username/slug the caller supplies. The
 * slug travels OUTWARD only (so the Companion can link to the right public page);
 * it is never an input, so no caller can aim this route at another workspace.
 *
 * Writes go through guard.supabase — the caller's RLS-enforced client, not the
 * service role. A workspace's own state is something the signed-in member is
 * already permitted to change, so there is no reason to reach for a client that
 * bypasses RLS; if the policy would refuse the write, this route should too.
 */

const SITE_ORIGIN = "https://locatorbeast.com"

/** `YYYY-MM-DD` only. The column is a `date`, and the client-facing copy is a
 *  calendar date — see the migration's note on why this is not a timestamp. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

type OooState = {
  enabled: boolean
  until: string | null
  slug: string | null
  previewUrl: string | null
}

async function readState(guard: Extract<Awaited<ReturnType<typeof requireWorkspaceMember>>, { ok: true }>) {
  const { data, error } = await guard.supabase
    .from("workspaces")
    .select("slug, out_of_office_enabled, out_of_office_until")
    .eq("id", guard.workspaceId)
    .maybeSingle()
  if (error || !data) return null
  const row = data as {
    slug: string | null
    out_of_office_enabled: boolean | null
    out_of_office_until: string | null
  }
  const slug = row.slug ?? null
  const state: OooState = {
    enabled: row.out_of_office_enabled === true,
    until: row.out_of_office_until ?? null,
    slug,
    // Built here rather than in the Companion so the extension never has to
    // assemble a locatorbeast URL from parts it could get wrong, and so the
    // panel's "Preview" is a value it renders rather than a string it composes.
    previewUrl: slug ? `${SITE_ORIGIN}/${encodeURIComponent(slug)}/out-of-office` : null,
  }
  return state
}

export async function GET() {
  const guard = await requireWorkspaceMember()
  if (!guard.ok) return guard.response

  const state = await readState(guard)
  if (!state) return NextResponse.json({ error: "Workspace not found" }, { status: 404 })
  return NextResponse.json(state)
}

export async function POST(req: NextRequest) {
  const guard = await requireWorkspaceMember()
  if (!guard.ok) return guard.response

  let body: Record<string, unknown>
  try {
    body = (await req.json()) ?? {}
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 })
  }

  // ── PRESERVING THE RETURN DATE ─────────────────────────────────────────────
  // `until` is written ONLY when the caller actually sent the key. Turning Out of
  // Office off sends { enabled: false } alone, so the stored return date survives
  // — the locator who comes back early and goes away again next week should not
  // have to retype a date they already entered, and a date is meaningless noise
  // while away is off anyway (nothing reads it).
  //
  // Clearing is still possible, but only as an EXPLICIT act: `until: null`. That
  // is the difference between "I'm not telling you about the date" (omit) and "I
  // have no return date" (null), and conflating them is what would silently eat
  // the value.
  const update: Record<string, unknown> = { out_of_office_enabled: body.enabled }
  if ("until" in body) {
    const raw = body.until
    if (raw === null || raw === "") {
      update.out_of_office_until = null
    } else if (typeof raw === "string" && DATE_ONLY.test(raw)) {
      // Reject a syntactically valid but non-existent date (2026-02-31) before it
      // reaches Postgres, so the caller gets a 400 instead of a 500.
      const [y, m, d] = raw.split("-").map(Number)
      const probe = new Date(Date.UTC(y!, m! - 1, d!))
      if (
        probe.getUTCFullYear() !== y ||
        probe.getUTCMonth() !== m! - 1 ||
        probe.getUTCDate() !== d
      ) {
        return NextResponse.json({ error: "until is not a real date" }, { status: 400 })
      }
      update.out_of_office_until = raw
    } else {
      return NextResponse.json({ error: "until must be YYYY-MM-DD or null" }, { status: 400 })
    }
  }

  const { error } = await guard.supabase
    .from("workspaces")
    .update(update)
    .eq("id", guard.workspaceId)
  if (error) {
    console.error("[workspace/out-of-office] update failed:", error.message)
    return NextResponse.json({ error: "Could not save Out of Office" }, { status: 500 })
  }

  // Return the state as STORED, re-read rather than echoed back from the request.
  // The Companion renders whatever this says, so a write that partially applied
  // must show up as the truth and not as the optimistic value the caller sent.
  const state = await readState(guard)
  if (!state) return NextResponse.json({ error: "Workspace not found" }, { status: 404 })
  return NextResponse.json(state)
}
