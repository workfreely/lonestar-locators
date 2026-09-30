import { supabase } from "@/lib/supabase/client"

// PASS 8 — the ONE client-side verification path.
//
// Two admin surfaces verify licences: the owner's review queue
// (/admin/license-verification) and the Beast Network approvals panel. Both call
// the same lb_verify_license RPC, and both must react identically to a trial
// being granted. This helper exists so that reaction lives in one place rather
// than being copy-pasted — it is NOT a second verification path, and it adds no
// verification logic of its own.

/** The jsonb lb_verify_license returns. trial_granted is never null. */
type VerifyLicenseResult = {
  verified_at: string | null
  trial_granted: boolean
  trial_ends_at: string | null
}

export type VerifyOutcome = {
  /** A user-facing message, or null on success. */
  error: string | null
  /** True only when THIS call started a trial. */
  trialGranted: boolean
}

function messageFor(raw: string | undefined): string {
  if (raw?.includes("license_number_missing")) return "That agent hasn't entered a license number yet."
  if (raw?.includes("not_authorized")) return "Only the platform owner can verify licenses."
  return raw || "Could not update that license."
}

/**
 * Verify a licence and, if that same database transaction granted a trial, send
 * the trial-started email.
 *
 * The email decision comes from `trial_granted` in the RPC result and nothing
 * else. Reading the profile afterwards could not answer the question: a
 * re-verification of an already-trialing account would look identical to a fresh
 * grant, and would resend the email every time the owner clicked Verify.
 *
 * Every non-granting path — re-verification, a previously consumed trial, an
 * already-paid account, a non-Texas licence, the internal demo exemption —
 * reports false, so this stays silent for all of them without needing to know
 * which one applied.
 *
 * The email is best-effort: a mail failure must never make a successful
 * verification look like it failed, because the licence and trial are already
 * committed by then.
 */
export async function verifyLicense(userId: string): Promise<VerifyOutcome> {
  const { data, error } = await supabase.rpc("lb_verify_license", { p_user: userId })

  if (error) return { error: messageFor(error.message), trialGranted: false }

  const result = (data ?? null) as VerifyLicenseResult | null
  // === true, never a truthy coercion: an older deployment of the RPC returned a
  // bare timestamp, in which case this is undefined and no email is sent — the
  // safe direction.
  const trialGranted = result?.trial_granted === true

  if (trialGranted) {
    try {
      await fetch("/api/notifications/trial-started", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })
    } catch {
      // Non-fatal by design — see the doc comment.
    }
  }

  return { error: null, trialGranted }
}
