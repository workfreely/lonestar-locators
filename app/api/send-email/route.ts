export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { resend, resendConfigured } from "@/lib/resend/client";
import { rateLimit, clientIpFromHeaders } from "@/lib/rateLimit";

// This route is intentionally PUBLIC: the marketing lead forms (Landing /
// Contact / ReportLease / NewHome) call it after an anonymous visitor submits,
// to send that visitor a confirmation email. It therefore cannot be auth-gated.
//
// Because it would otherwise be an open relay (arbitrary to/subject/html sent
// FROM our verified domain), it is locked down with:
//   1. A server-controlled `from` (never client-supplied).
//   2. Strict input validation — a single well-formed recipient and bounded
//      subject/html sizes, rejecting arrays (which Resend would fan out to).
//   3. Best-effort per-IP rate limiting to blunt volumetric/phishing abuse.

// Single recipient only — no arrays, BCC fan-out, or comma lists.
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const MAX_SUBJECT_LEN = 300;
const MAX_HTML_LEN = 200_000; // ~200 KB — generous for a template, caps payload abuse.

// 10 sends per 10 minutes per IP. Comfortably above a real visitor submitting a
// form once (or retrying), well below anything useful for bulk abuse.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const ip = clientIpFromHeaders(req.headers);
    const limit = rateLimit(`send-email:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    const { to, subject, html } = await req.json();

    // Recipient: must be a single, well-formed email string.
    if (typeof to !== "string" || !EMAIL_RE.test(to.trim())) {
      return NextResponse.json(
        { error: "Invalid or missing recipient" },
        { status: 400 }
      );
    }

    // Subject: non-empty, bounded.
    if (typeof subject !== "string" || subject.trim().length === 0 || subject.length > MAX_SUBJECT_LEN) {
      return NextResponse.json(
        { error: "Invalid or missing subject" },
        { status: 400 }
      );
    }

    // Body: non-empty, bounded.
    if (typeof html !== "string" || html.trim().length === 0 || html.length > MAX_HTML_LEN) {
      return NextResponse.json(
        { error: "Invalid or missing message body" },
        { status: 400 }
      );
    }

    if (!resendConfigured) {
      return NextResponse.json(
        { error: "Email service is not configured (RESEND_API_KEY missing)." },
        { status: 503 }
      );
    }

    const { data, error } = await resend.emails.send({
      from: "Jay Morris <jay@lonestarlocators.app>",
      to: to.trim(),
      subject,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json(
        { error: "Email provider error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Send email route error:", error);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
