export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe/client"
import { rateLimit } from "@/lib/rateLimit"

// Irreversible account deletion. Distinct from cancelling a subscription:
// cancelling stops billing and keeps the workspace for the 90-day retention
// window; this destroys the account immediately and is not covered by it.
//
// ORDER MATTERS. Stripe and Google cannot join a database transaction, so they
// run FIRST — a failure there aborts with nothing destroyed. Storage runs LAST,
// after the commit: if it ran earlier and the transaction rolled back, the user
// would keep their account and lose their avatar. An orphaned file is
// recoverable; the reverse is not.
//
// Subscription states that mean "still billable" — same set /api/stripe/checkout
// uses to decide a customer already has a live subscription.
const LIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "incomplete"])

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })


  const limit = rateLimit(`account-delete:${user.id}`, 5, 15 * 60_000)
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 })
  }

  const body = await request.json().catch(() => null)
  const code = typeof body?.code === "string" ? body.code.trim() : ""
  const typedEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""

  // ── 1. Typed email must match the account ────────────────────────────────
  const accountEmail = (user.email ?? "").trim().toLowerCase()
  if (!accountEmail || typedEmail !== accountEmail) {
    return NextResponse.json({ error: "The email you typed does not match this account." }, { status: 400 })
  }

  // ── 2. Deletion code — verified against OUR challenge, not GoTrue ────────
  // The previous version called updateUser({ email: user.email, nonce }) and
  // treated "no error" as proof. Re-setting the user's own email is a no-op, so
  // GoTrue never verified anything and accepted any code, or none — a throwaway
  // account was destroyed by a request carrying the literal "000000".
  //
  // lb_verify_deletion_code is scoped to p_user_id, which comes from the
  // verified session, so a code issued for another account cannot match. It also
  // enforces expiry, single use, and the wrong-attempt cap in one place, inside
  // the same transaction that increments the attempt counter.
  if (!code) {
    return NextResponse.json({ error: "Confirmation code required." }, { status: 400 })
  }
  const { data: verdict, error: verifyError } = await supabaseAdmin.rpc("lb_verify_deletion_code", {
    p_user_id: user.id,
    p_code: code,
  })
  if (verifyError) {
    console.error("[account/delete] code verification failed:", verifyError.message)
    return NextResponse.json({ error: "Could not verify the confirmation code." }, { status: 500 })
  }
  const v = verdict as { ok?: boolean; reason?: string } | null
  if (!v?.ok) {
    // Deliberately generic to the client: distinguishing "expired" from "wrong"
    // from "no code" would tell an attacker which part to vary. The reason is
    // logged server-side instead.
    const status = v?.reason === "too_many_attempts" ? 429 : 400
    console.warn("[account/delete] code rejected:", v?.reason ?? "unknown")
    return NextResponse.json(
      {
        error:
          status === 429
            ? "Too many incorrect codes. Request a new one."
            : "That confirmation code is not valid. Request a new one if it has expired.",
      },
      { status },
    )
  }

  // ── 3. Preflight, re-run immediately before mutating ─────────────────────
  const { data: pre, error: preError } = await supabase.rpc("lb_account_deletion_preflight")
  if (preError || !pre) {
    console.error("[account/delete] preflight failed:", preError?.message)
    return NextResponse.json({ error: "Could not verify account state." }, { status: 500 })
  }
  if (pre.blocked) {
    return NextResponse.json({ error: pre.blocked_reason }, { status: 409 })
  }

  // ── 4. Stripe: must succeed before anything is destroyed ─────────────────
  // profiles.stripe_customer_id disappears with the profile, so skipping this
  // would leave Stripe billing a card with nothing on our side to link it to.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle()

  const customerId = profile?.stripe_customer_id as string | null | undefined
  if (customerId) {
    try {
      const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 })
      for (const s of subs.data) {
        if (LIVE_SUBSCRIPTION_STATUSES.has(s.status)) {
          const cancelled = await stripe.subscriptions.cancel(s.id)
          if (cancelled.status !== "canceled") {
            throw new Error(`subscription ${s.id} did not cancel (status ${cancelled.status})`)
          }
        }
      }
    } catch (err) {
      console.error("[account/delete] Stripe cancellation failed:", err)
      return NextResponse.json(
        { error: "We could not cancel your subscription. Nothing was deleted — please try again or contact support." },
        { status: 502 }
      )
    }
  }

  // ── 5. Google: revoke BEFORE the credential row disappears ───────────────
  // Losing a token is not revoking it — the grant would stay live in the user's
  // Google account. Best-effort: a Google outage must not block erasure.
  try {
    const { data: cred } = await supabaseAdmin
      .from("google_credentials")
      .select("refresh_token")
      .eq("user_id", user.id)
      .maybeSingle()
    const token = (cred as { refresh_token?: string } | null)?.refresh_token
    if (token) {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      })
    }
  } catch (err) {
    console.warn("[account/delete] Google revocation failed (continuing):", err)
  }

  // ── 6. Database, one transaction ─────────────────────────────────────────
  // Re-checks the co-member rule inside the transaction, so a member joining
  // between preflight and here cannot be raced past the safety rule.
  const { data: result, error: delError } = await supabaseAdmin.rpc("lb_delete_account_data", {
    p_user_id: user.id,
  })
  if (delError) {
    console.error("[account/delete] deletion failed:", delError.message)
    return NextResponse.json(
      { error: "Deletion failed. Your subscription may already be cancelled — please contact support." },
      { status: 500 }
    )
  }

  // ── 7. Storage, after the commit ─────────────────────────────────────────
  // Safe to enumerate by prefix: storage RLS scopes writes to
  // (storage.foldername(name))[1] = auth.uid(), so no other user's file can
  // live under this path.
  try {
    const { data: files } = await supabaseAdmin.storage.from("branding").list(user.id, { limit: 1000 })
    const paths = (files ?? []).map((f) => `${user.id}/${f.name}`)
    if (paths.length > 0) await supabaseAdmin.storage.from("branding").remove(paths)
  } catch (err) {
    console.error("[account/delete] storage cleanup failed (account already deleted):", err)
  }

  return NextResponse.json({ deleted: true, ...(result as object) })
}
