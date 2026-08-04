import { NextResponse } from "next/server"
import {
  newLeadEmail,
  welcomeEmail,
  trialStartedEmail,
  trialEndingEmail,
  subscriptionSuccessfulEmail,
  paymentFailedEmail,
  subscriptionCanceledEmail,
  subscriptionReactivatedEmail,
  passwordResetEmail,
  emailVerificationEmail,
  type BuiltEmail,
} from "@/lib/notifications"

export const runtime = "nodejs"

// Renders any notification template to HTML for visual QA — and produces the
// paste-ready branded HTML for the Supabase Auth email templates (password reset
// / email verification) using Supabase's own {{ .ConfirmationURL }} placeholder.
//
// Guarded: available in non-production automatically, or in production only with
// ?secret=<CRON_SECRET>. Never sends anything.
//
//   /api/notifications/preview?template=new-lead
//   /api/notifications/preview?template=password-reset   (paste into Supabase)

const SAMPLE = {
  name: "Jordan",
  trialEndsAt: "2026-09-03",
}

const BUILDERS: Record<string, () => BuiltEmail> = {
  "new-lead": () =>
    newLeadEmail({
      locatorName: "Jordan",
      leadUrl: "https://locatorbeast.com/admin/leads?id=demo",
      lead: {
        first_name: "Maria",
        last_name: "Gonzalez",
        email: "maria@example.com",
        phone: "(214) 222-1234",
        city: "Dallas",
        neighborhoods: "Uptown, Deep Ellum",
        move_date: "09/15/2026",
        property_type: "Apartment",
        beds: "2",
        baths: "2",
        desired_rent: "$2,500 – $2,700",
        income: "$8,000/mo",
        credit_score: "740",
        notes: "Has a small dog. Prefers a pool.",
        source: "smart_lead_form",
      },
    }),
  welcome: () => welcomeEmail({ name: SAMPLE.name }),
  "trial-started": () => trialStartedEmail({ name: SAMPLE.name, trialEndsAt: SAMPLE.trialEndsAt }),
  "trial-ending": () =>
    trialEndingEmail({ name: SAMPLE.name, daysLeft: 3, trialEndsAt: SAMPLE.trialEndsAt }),
  "subscription-successful": () => subscriptionSuccessfulEmail({ name: SAMPLE.name }),
  "payment-failed": () => paymentFailedEmail({ name: SAMPLE.name }),
  "subscription-canceled": () => subscriptionCanceledEmail({ name: SAMPLE.name }),
  "subscription-reactivated": () => subscriptionReactivatedEmail({ name: SAMPLE.name }),
  // Auth emails use Supabase's server-side placeholder so the output can be
  // pasted directly into the Supabase dashboard template.
  "password-reset": () =>
    passwordResetEmail({ actionUrl: "{{ .ConfirmationURL }}", name: SAMPLE.name }),
  "email-verification": () =>
    emailVerificationEmail({ actionUrl: "{{ .ConfirmationURL }}", name: SAMPLE.name }),
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  if (process.env.NODE_ENV === "production") {
    const secret = process.env.CRON_SECRET
    if (!secret || searchParams.get("secret") !== secret) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
  }

  const template = searchParams.get("template")
  if (!template || !BUILDERS[template]) {
    return NextResponse.json(
      { error: "Unknown template", available: Object.keys(BUILDERS) },
      { status: 400 }
    )
  }

  const built = BUILDERS[template]()
  return new NextResponse(built.html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}
