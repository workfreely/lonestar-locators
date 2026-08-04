import { BRAND, absoluteUrl } from "./branding"
import { renderEmail, paragraph, infoTable, esc } from "./layout"

// Every notification the app can send lives here as a pure builder:
//   (params) => { subject, html, text? }
// Builders never send — they only produce content. Call sendNotification() with
// the result. Adding a new notification = add one builder here; nothing else in
// the system needs to change.

export type BuiltEmail = { subject: string; html: string; text?: string }

// A greeting line that gracefully handles a missing name.
function greeting(name?: string | null): string {
  const first = (name ?? "").trim().split(/\s+/)[0]
  return first ? `Hi ${esc(first)},` : "Hi there,"
}

// ─── Smart Lead Form: new lead → locator ─────────────────────────────────────

export type NewLeadEmailParams = {
  locatorName?: string | null
  leadUrl: string
  lead: {
    first_name?: string | null
    last_name?: string | null
    email?: string | null
    phone?: string | null
    city?: string | null
    neighborhoods?: string | null
    move_date?: string | null
    property_type?: string | null
    beds?: string | null
    baths?: string | null
    desired_rent?: string | null
    income?: string | null
    credit_score?: string | null
    notes?: string | null
    source?: string | null
  }
}

export function newLeadEmail({ locatorName, leadUrl, lead }: NewLeadEmailParams): BuiltEmail {
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() || "New lead"
  const contentHtml = `
    ${paragraph(`${greeting(locatorName)} you just captured a new lead through your Smart Lead Form.`)}
    ${infoTable([
      { label: "Name", value: [lead.first_name, lead.last_name].filter(Boolean).join(" ") },
      { label: "Email", value: lead.email },
      { label: "Phone", value: lead.phone },
      { label: "City", value: lead.city },
      { label: "Neighborhoods", value: lead.neighborhoods },
      { label: "Move date", value: lead.move_date },
      { label: "Property type", value: lead.property_type },
      { label: "Beds / Baths", value: [lead.beds, lead.baths].filter(Boolean).join(" / ") },
      { label: "Desired rent", value: lead.desired_rent },
      { label: "Monthly income", value: lead.income },
      { label: "Credit score", value: lead.credit_score },
      { label: "Notes", value: lead.notes },
      { label: "Source", value: lead.source },
    ])}
    ${paragraph("Open the lead in Locator Beast to start the workflow and follow up fast.")}
  `
  return {
    subject: `New lead: ${fullName}`,
    html: renderEmail({
      preheader: `${fullName} just submitted your Smart Lead Form.`,
      heading: "You've got a new lead 🎯",
      contentHtml,
      cta: { label: "Open lead in Locator Beast", url: leadUrl },
    }),
  }
}

// ─── Lead assignment → assigned agent ────────────────────────────────────────
// Ready for when multi-agent workspaces support assigning a lead to a teammate.
// Not wired to a trigger yet (the app is solo-workspace today, so every lead is
// owned by the workspace owner) — call it from the assignment action once that
// feature exists.

export type LeadAssignedEmailParams = {
  assigneeName?: string | null
  assignedByName?: string | null
  leadUrl: string
  lead: { first_name?: string | null; last_name?: string | null; city?: string | null }
}

export function leadAssignedEmail({
  assigneeName,
  assignedByName,
  leadUrl,
  lead,
}: LeadAssignedEmailParams): BuiltEmail {
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() || "a lead"
  const by = (assignedByName ?? "").trim()
  const contentHtml = `
    ${paragraph(`${greeting(assigneeName)} ${by ? `${esc(by)} assigned` : "you've been assigned"} a lead to you in Locator Beast.`)}
    ${infoTable([
      { label: "Lead", value: [lead.first_name, lead.last_name].filter(Boolean).join(" ") },
      { label: "City", value: lead.city },
    ])}
    ${paragraph("Open the lead to review the details and start following up.")}
  `
  return {
    subject: `You've been assigned a lead: ${fullName}`,
    html: renderEmail({
      preheader: `${fullName} was assigned to you.`,
      heading: "A lead was assigned to you",
      contentHtml,
      cta: { label: "Open lead in Locator Beast", url: leadUrl },
    }),
  }
}

// ─── Account: Welcome ────────────────────────────────────────────────────────

export function welcomeEmail(params: { name?: string | null }): BuiltEmail {
  const contentHtml = `
    ${paragraph(`${greeting(params.name)} welcome to Locator Beast — the operating system built for apartment locators.`)}
    ${paragraph("Your account is ready. Capture leads with your Smart Lead Form, automate follow-ups, and close more leases — all in one place.")}
    ${paragraph("Jump into your dashboard to get set up.")}
  `
  return {
    subject: "Welcome to Locator Beast 🐆",
    html: renderEmail({
      preheader: "Your Locator Beast account is ready.",
      heading: "Welcome to Locator Beast",
      contentHtml,
      cta: { label: "Open your dashboard", url: absoluteUrl("/admin/leads") },
    }),
  }
}

// ─── Trial: started confirmation ─────────────────────────────────────────────

export function trialStartedEmail(params: {
  name?: string | null
  trialEndsAt?: string | Date | null
}): BuiltEmail {
  const endsText = formatDate(params.trialEndsAt)
  const contentHtml = `
    ${paragraph(`${greeting(params.name)} your free 30-day trial is now active — full access, no credit card required.`)}
    ${infoTable([
      { label: "Plan", value: "Locator Beast — full access" },
      { label: "Trial length", value: "30 days" },
      { label: "Trial ends", value: endsText },
      { label: "Price after trial", value: "$99/month" },
    ])}
    ${paragraph("Make the most of it — set up your Smart Lead Form and start capturing leads today.")}
  `
  return {
    subject: "Your Locator Beast trial has started",
    html: renderEmail({
      preheader: "30 days of full access — no credit card required.",
      heading: "Your free trial is live",
      contentHtml,
      cta: { label: "Get started", url: absoluteUrl("/admin/leads") },
    }),
  }
}

// ─── Trial: ending reminder ──────────────────────────────────────────────────

export function trialEndingEmail(params: {
  name?: string | null
  daysLeft: number
  trialEndsAt?: string | Date | null
}): BuiltEmail {
  const endsText = formatDate(params.trialEndsAt)
  const dayWord = params.daysLeft === 1 ? "day" : "days"
  const contentHtml = `
    ${paragraph(`${greeting(params.name)} your Locator Beast free trial ends in <strong>${params.daysLeft} ${dayWord}</strong>${
      endsText ? ` (on ${esc(endsText)})` : ""
    }.`)}
    ${paragraph("Subscribe now to keep your leads, workflows, and Smart Lead Form running without interruption — just $99/month.")}
  `
  return {
    subject: `Your Locator Beast trial ends in ${params.daysLeft} ${dayWord}`,
    html: renderEmail({
      preheader: "Subscribe to keep your access after the trial.",
      heading: "Your trial is ending soon",
      contentHtml,
      cta: { label: "Subscribe now", url: absoluteUrl("/billing") },
    }),
  }
}

// ─── Billing: subscription successful ────────────────────────────────────────

export function subscriptionSuccessfulEmail(params: { name?: string | null }): BuiltEmail {
  const contentHtml = `
    ${paragraph(`${greeting(params.name)} thank you for subscribing to Locator Beast! Your subscription is active and you have full access.`)}
    ${infoTable([
      { label: "Plan", value: "Locator Beast" },
      { label: "Price", value: "$99/month" },
      { label: "Status", value: "Active" },
    ])}
    ${paragraph("You can manage your subscription or update payment details any time from Billing.")}
  `
  return {
    subject: "Your Locator Beast subscription is active",
    html: renderEmail({
      preheader: "Thanks for subscribing — you have full access.",
      heading: "Subscription confirmed 🎉",
      contentHtml,
      cta: { label: "Go to your dashboard", url: absoluteUrl("/admin/leads") },
    }),
  }
}

// ─── Billing: payment failed ─────────────────────────────────────────────────

export function paymentFailedEmail(params: { name?: string | null }): BuiltEmail {
  const contentHtml = `
    ${paragraph(`${greeting(params.name)} we weren't able to process your latest Locator Beast payment.`)}
    ${paragraph("This usually means a card expired or was declined. To avoid losing access, please update your payment method — we'll automatically retry.")}
  `
  return {
    subject: "Action needed: your Locator Beast payment failed",
    html: renderEmail({
      preheader: "Update your payment method to keep your access.",
      heading: "We couldn't process your payment",
      contentHtml,
      cta: { label: "Update payment method", url: absoluteUrl("/billing") },
      footerNote:
        "If you've already updated your card, you can ignore this message — the retry may have already succeeded.",
    }),
  }
}

// ─── Billing: subscription canceled ──────────────────────────────────────────

export function subscriptionCanceledEmail(params: { name?: string | null }): BuiltEmail {
  const contentHtml = `
    ${paragraph(`${greeting(params.name)} your Locator Beast subscription has been canceled.`)}
    ${paragraph("Your data is safe. You can reactivate any time to pick up right where you left off — your leads and workflows will be waiting.")}
    ${paragraph("We'd love to have you back.")}
  `
  return {
    subject: "Your Locator Beast subscription was canceled",
    html: renderEmail({
      preheader: "You can reactivate any time.",
      heading: "Your subscription was canceled",
      contentHtml,
      cta: { label: "Reactivate subscription", url: absoluteUrl("/billing") },
    }),
  }
}

// ─── Billing: subscription reactivated ───────────────────────────────────────

export function subscriptionReactivatedEmail(params: { name?: string | null }): BuiltEmail {
  const contentHtml = `
    ${paragraph(`${greeting(params.name)} welcome back! Your Locator Beast subscription is active again and you have full access.`)}
    ${paragraph("Everything is right where you left it — jump back in and keep closing leases.")}
  `
  return {
    subject: "Welcome back — your Locator Beast subscription is active",
    html: renderEmail({
      preheader: "Your subscription is active again.",
      heading: "You're back in 🎉",
      contentHtml,
      cta: { label: "Go to your dashboard", url: absoluteUrl("/admin/leads") },
    }),
  }
}

// ─── Account: password reset (branded template) ──────────────────────────────
// Delivered by Supabase Auth today (see README in index.ts). Kept here so the
// branded HTML is centralized and ready if/when auth emails move in-app. When
// used as a Supabase template, pass the literal "{{ .ConfirmationURL }}" as
// actionUrl to produce paste-ready HTML for the Supabase dashboard.

export function passwordResetEmail(params: { actionUrl: string; name?: string | null }): BuiltEmail {
  const contentHtml = `
    ${paragraph(`${greeting(params.name)} we received a request to reset your Locator Beast password.`)}
    ${paragraph("Click the button below to choose a new password. This link will expire shortly for your security.")}
    ${paragraph("If you didn't request this, you can safely ignore this email — your password won't change.")}
  `
  return {
    subject: "Reset your Locator Beast password",
    html: renderEmail({
      preheader: "Reset your Locator Beast password.",
      heading: "Reset your password",
      contentHtml,
      cta: { label: "Reset password", url: params.actionUrl },
    }),
  }
}

// ─── Account: email verification (branded template) ──────────────────────────

export function emailVerificationEmail(params: { actionUrl: string; name?: string | null }): BuiltEmail {
  const contentHtml = `
    ${paragraph(`${greeting(params.name)} thanks for signing up for Locator Beast. Please confirm your email address to activate your account.`)}
    ${paragraph("If you didn't create this account, you can safely ignore this email.")}
  `
  return {
    subject: "Confirm your email for Locator Beast",
    html: renderEmail({
      preheader: "Confirm your email to activate your account.",
      heading: "Confirm your email",
      contentHtml,
      cta: { label: "Confirm email", url: params.actionUrl },
    }),
  }
}

// ─── shared ──────────────────────────────────────────────────────────────────

function formatDate(value?: string | Date | null): string | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return null
  // MM/DD/YYYY — matches the app's established date format.
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${mm}/${dd}/${d.getFullYear()}`
}

// Re-export brand for callers that want the site URL etc.
export { BRAND }
