import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { hashShareToken, looksLikeShareToken } from "@/lib/clientShare/token"
import { sendNotification } from "@/lib/notifications/send"

// Public, token-scoped "Resume Your Search" for a DISABLED Client Recommendation link.
//
// The signed share token IS the credential (hashed in Node before the DB). This is NOT
// a general CRM mutation API: the only thing it can do is trigger lb_client_resume_search
// for the ONE lead behind that token — re-engaging the lead (fresh intake) WITHOUT
// re-opening the property list (the share stays disabled). Idempotent: the RPC flips
// resumed_at atomically, so repeats return { alreadyResumed: true } and this route sends
// no second notification. Unknown/revoked/active shares are silent no-ops in the RPC.
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 })
  }

  const token = (body as { token?: unknown } | null)?.token
  if (typeof token !== "string" || !looksLikeShareToken(token)) {
    return NextResponse.json({ error: "bad_token" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("lb_client_resume_search", {
    p_token_hash: hashShareToken(token),
  })
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 })

  // null = unknown/revoked/active (not a paused share) -> nothing to resume.
  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok?: boolean; alreadyResumed?: boolean; clientFirstName?: string | null; locatorEmail?: string | null; agentFirstName?: string | null; closed?: boolean }
    | null
  if (!row?.ok) return NextResponse.json({ error: "unavailable" }, { status: 409 })

  // Locator notification — server-side (Resend), so it works with the laptop off.
  // Sent ONCE per resume: only on the first request (alreadyResumed === false), never
  // on repeats. sendNotification never throws and degrades gracefully.
  if (row.alreadyResumed === false && row.locatorEmail) {
    const first = (row.clientFirstName || "A client").trim()
    const subject = `${first} resumed their apartment search`
    const line = row.closed
      ? `${first} tapped "Resume Your Search" on their recommendations link. They're marked closed, so they were not reactivated automatically — a "Former client wants to resume — reach out" task is now on your Agenda.`
      : `${first} tapped "Resume Your Search" on their recommendations link. They're back in your New column with a due-now "Resume Search" task on your Agenda. Their old list stays disabled until you update and re-enable it.`
    await sendNotification({
      to: row.locatorEmail,
      subject,
      html: `<p>${subject}.</p><p>${line}</p>`,
      text: `${subject}.\n\n${line}`,
    })
  }

  return NextResponse.json({ ok: true, alreadyResumed: row.alreadyResumed === true })
}
