import { NextResponse } from "next/server";

/**
 * POST /api/sms/send-welcome
 *
 * SECURITY FIX — this route was an unauthenticated open email relay.
 *
 * It accepted `{ to, subject, html }` from ANY caller and sent that HTML via
 * Resend from the verified sender "Jay Morris <jay@lonestarlocators.app>", with
 * no authentication, no rate limit, no recipient validation, and no size caps.
 * Because `to` was passed straight through, an ARRAY fanned out to every address
 * in it. Anyone on the internet could send arbitrary mail from the domain.
 *
 * The sibling route /api/send-email is deliberately public for the same
 * marketing forms and documents exactly the protections this one lacked: a
 * server-controlled `from`, a single validated recipient, bounded subject/body,
 * and per-IP rate limiting.
 *
 * WHY IT IS DISABLED RATHER THAN HARDENED. Its four real callers —
 * ContactForm.tsx and LandingForm.tsx — post `{ firstName, phone, leadType }`,
 * never `{ to, subject, html }`. Every genuine call therefore failed validation
 * with "Missing required fields" and sent nothing; verified against production.
 * The email path had no legitimate user at all, so hardening it would have kept
 * a mail-sending capability alive that nothing needs. Removing the capability
 * closes the hole outright instead of narrowing it.
 *
 * The endpoint itself is kept (not deleted) so the existing fire-and-forget
 * callers keep resolving instead of 404-ing, and so this note stays attached to
 * the path if welcome SMS is built later. When that happens it must send SMS via
 * an SMS provider — it must NOT regain the ability to send caller-supplied HTML
 * email. Mirrors the sibling stub at /api/sms/send-3day-followup.
 */
export async function POST(_req: Request) {
  return NextResponse.json(
    {
      success: false,
      error: "not_implemented",
      message: "Welcome SMS is not implemented yet.",
    },
    { status: 501 }
  );
}
