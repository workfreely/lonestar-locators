import { BRAND, absoluteUrl, type SenderCategory } from "./branding"
import { renderEmail, paragraph, infoTable, pill, esc } from "./layout"
import { cityBanner } from "./cityHeader"
import { formatDateDisplay, formatPersonName } from "@bc/companion-shared"
import {
  renderClientSignatureHtml,
  decideIabs,
  type ResolvedAgentIdentity,
} from "./agentSignature"

// Every notification the app can send lives here as a pure builder:
//   (params) => { subject, html, category, text? }
// Builders never send — they only produce content, INCLUDING which sender
// identity (category) the email goes out under. Call sendNotification() with the
// result. Adding a new notification = add one builder here (with its category);
// nothing else in the system needs to change.

export type BuiltEmail = { subject: string; html: string; category: SenderCategory; text?: string }

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
    submarkets?: string | null
    move_date?: string | null
    property_type?: string | null
    beds?: string | null
    baths?: string | null
    desired_rent?: string | null
    income?: string | null
    credit_score?: string | null
    credit_history?: string | null
    broken_lease_age?: string | null
    broken_lease_amount?: string | null
    eviction_court?: string | null
    eviction_age?: string | null
    eviction_balance?: string | null
    criminal_background?: string | null
    criminal_charge?: string | null
    felony_age?: string | null
    misdemeanor_age?: string | null
    notes?: string | null
    source?: string | null
  }
}

// ── Owner-alert helpers (shared with the AI Lead Summary) ────────────────────
// Move-in window bucket, matching the CRM/owner-alert phrasing.
function moveWindow(dateStr?: string | null): string {
  if (!dateStr) return ""
  const move = new Date(dateStr)
  if (isNaN(move.getTime())) return ""
  const days = Math.ceil((move.getTime() - Date.now()) / 86_400_000)
  if (days <= 30) return "0–30 days"
  if (days <= 60) return "30–60 days"
  if (days <= 90) return "60–90 days"
  return "90+ days"
}

// Combined "Beds / Baths" using the EXACT values saved by the Smart Lead Form
// (beds/baths are "1" | "2" | "3+"; a Studio submission saves no beds/baths, so
// the property type carries it). Never infers/broadens (no "1-2 / 1-2"). Examples:
//   "1 / 1", "2 / 2", "3+ / 2", "Studio". Returns null when nothing was saved.
function bedsBathsLabel(lead: {
  beds?: string | null
  baths?: string | null
  property_type?: string | null
}): string | null {
  const beds = (lead.beds ?? "").trim()
  const baths = (lead.baths ?? "").trim()
  const isStudio = (lead.property_type ?? "").trim() === "Studio"
  const bedsPart = beds || (isStudio ? "Studio" : "")
  if (bedsPart && baths) return `${bedsPart} / ${baths}`
  return bedsPart || baths || null
}

// A titled two-column detail section that renders nothing when every row is empty
// (so a section with no meaningful data is omitted entirely — no blank headings).
function section(title: string, rows: { label: string; value: string | null | undefined }[]): string {
  const hasAny = rows.some((r) => r.value !== undefined && r.value !== null && String(r.value).trim() !== "")
  if (!hasAny) return ""
  return `<h2 style="margin:24px 0 4px 0;font-size:16px;font-weight:700;color:${BRAND.ink};">${esc(
    title,
  )}</h2>${infoTable(rows)}`
}

// Field-aware screening suppression. We drop ONLY genuine non-answers — null,
// blank/whitespace, an em/en-dash placeholder, or "Not specified"/"N/A". We
// PRESERVE explicit semantic answers such as "Clean", "None", "No", "0", "$0",
// because for their field those are real, meaningful submissions (e.g. "Criminal
// Background: None" is important). Field-specific rules (e.g. credit score) live
// in their own helpers rather than in this generic placeholder list.
const SCREENING_PLACEHOLDERS = new Set(["-", "—", "–", "n/a", "na", "not specified", "unspecified"])
function screeningValue(v: string | null | undefined): string | null {
  const t = (v ?? "").trim()
  if (!t) return null
  return SCREENING_PLACEHOLDERS.has(t.toLowerCase()) ? null : t
}
// Estimated credit score has a valid range (~300–850); "0" is only an internal
// placeholder, never a real answer, so it is omitted for THIS field specifically
// (not via the generic suppressor, which must keep a legitimate "0" elsewhere).
function creditScoreValue(v: string | null | undefined): string | null {
  const t = screeningValue(v)
  if (!t) return null
  return /^\$?0(\.0+)?$/.test(t) ? null : t
}
// Show a conditional detail row only when its parent answer is present.
function whenParent(active: boolean, v: string | null | undefined): string | null {
  return active ? screeningValue(v) : null
}

export function newLeadEmail({ locatorName, leadUrl, lead }: NewLeadEmailParams): BuiltEmail {
  void locatorName // signature kept for callers; the owner alert is name-agnostic
  const fullName = formatPersonName([lead.first_name, lead.last_name].filter(Boolean).join(" ")) || "New Lead"

  const win = moveWindow(lead.move_date)
  const strongCredit = !!lead.credit_score && Number(lead.credit_score) >= 680
  const hasIncome = !!lead.income && String(lead.income).trim() !== ""
  const newHomeCandidate = strongCredit && hasIncome && win !== "90+ days"

  const moveChip = lead.move_date ? `${formatDateDisplay(lead.move_date)}${win ? ` (${win})` : ""}` : null
  const bedsBaths = bedsBathsLabel(lead)
  const creditChip = lead.credit_history
    ? `${lead.credit_history}${lead.credit_score ? ` (${lead.credit_score})` : ""}`
    : null
  const sourceLabel =
    lead.source === "direct"
      ? "Website"
      : lead.source
        ? lead.source.charAt(0).toUpperCase() + lead.source.slice(1)
        : "Website"

  // Blue "AI Lead Summary" box — plain-English narrative + at-a-glance chips.
  // Income is incorporated two ways: the narrative notes whether it was provided,
  // and (when present) an Income chip surfaces the exact saved range verbatim.
  const aiSummary = `
    <div style="background:#f1f7ff;border-radius:8px;padding:16px 18px;margin:0 0 24px 0;">
      <div style="font-size:16px;font-weight:700;color:#0b3a75;margin-bottom:10px;">AI Lead Summary</div>
      <p style="margin:0 0 10px 0;font-size:14px;line-height:1.5;color:${BRAND.ink};">
        This lead is planning a move ${win ? `within ${win}` : "in the future"} and is looking for ${esc(
          lead.property_type ?? "housing",
        )} in ${esc(lead.city ?? "the area")}. ${
          strongCredit ? "Credit appears strong" : "Credit may require additional review"
        }${hasIncome ? ", and income was provided." : ", though income was not listed."}${
          newHomeCandidate
            ? " This lead may be a potential candidate for new home or builder programs."
            : ""
        }
      </p>
      ${pill("Move", moveChip)}
      ${pill("Beds / Baths", bedsBaths)}
      ${pill("Rent", lead.desired_rent)}
      ${pill("Income", lead.income)}
      ${pill("Credit", creditChip)}
      ${pill("City", lead.city)}
      ${pill("Source", sourceLabel)}
      ${newHomeCandidate ? pill("AI Recommendation", "New Home Candidate") : ""}
    </div>
  `

  const contentHtml = `
    ${aiSummary}
    ${section("Client", [
      { label: "First Name", value: lead.first_name },
      { label: "Last Name", value: lead.last_name },
      { label: "Phone", value: lead.phone },
      { label: "Email", value: lead.email },
    ])}
    ${section("Move Preferences", [
      { label: "Move Date", value: moveChip },
      { label: "City", value: lead.city },
      { label: "Neighborhoods", value: lead.neighborhoods },
      { label: "Submarkets", value: lead.submarkets },
    ])}
    ${section("Housing Preferences", [
      { label: "Property Type", value: lead.property_type },
      { label: "Desired Rent", value: lead.desired_rent },
      { label: "Monthly Income", value: lead.income },
      { label: "Beds", value: lead.beds },
      { label: "Baths", value: lead.baths },
    ])}
    ${(() => {
      // Parent answers gate their conditional detail rows (broken-lease details
      // only when Broken Lease was chosen, etc.). Explicit "Clean"/"None" show.
      const creditHistory = screeningValue(lead.credit_history)
      const criminal = screeningValue(lead.criminal_background)
      const isBrokenLease = creditHistory === "Broken Lease"
      const isEviction = creditHistory === "Eviction"
      return section("Credit Screening", [
        { label: "Estimated Credit Score", value: creditScoreValue(lead.credit_score) },
        { label: "Credit History", value: creditHistory },
        { label: "Broken Lease Age", value: whenParent(isBrokenLease, lead.broken_lease_age) },
        { label: "Broken Lease Balance", value: whenParent(isBrokenLease, lead.broken_lease_amount) },
        { label: "Went to Court", value: whenParent(isEviction, lead.eviction_court) },
        { label: "Eviction Age", value: whenParent(isEviction, lead.eviction_age) },
        { label: "Eviction Balance", value: whenParent(isEviction, lead.eviction_balance) },
        { label: "Criminal Background", value: criminal },
        { label: "Charge / Offense", value: whenParent(criminal === "Felony" || criminal === "Misdemeanor", lead.criminal_charge) },
        { label: "Felony Age", value: whenParent(criminal === "Felony", lead.felony_age) },
        { label: "Misdemeanor Age", value: whenParent(criminal === "Misdemeanor", lead.misdemeanor_age) },
      ])
    })()}
    ${section("Lead Source", [{ label: "Lead Source", value: sourceLabel }])}
    ${
      lead.notes && String(lead.notes).trim() !== ""
        ? `<h2 style="margin:24px 0 4px 0;font-size:16px;font-weight:700;color:${BRAND.ink};">Notes</h2>${paragraph(
            esc(lead.notes),
          )}`
        : ""
    }
  `

  return {
    category: "leads",
    subject: `New Renter Lead: ${fullName}`,
    html: renderEmail({
      ...cityBanner(lead.city), // city skyline follows the LEAD's market
      hideWordmark: true, // thin skyline band only — no wordmark band
      preheader: `${fullName}${lead.city ? ` · ${lead.city}` : ""} just submitted your Smart Lead Form.`,
      heading: `New Renter Lead: ${fullName}${lead.city ? ` (${lead.city})` : ""}`,
      contentHtml,
      cta: { label: "Open lead in Locator Beast", url: leadUrl },
    }),
  }
}

// ─── Smart Lead Form: confirmation → the renter (customer) ───────────────────
// Adapts the approved Lone Star renter confirmation (Search Summary + What
// Happens Next) into the Locator Beast layout + branding, with the city skyline
// header, the Monthly Household Income field, and an agent-aware signature.
// Category "transactional"; the caller sets replyTo to the workspace owner so
// the renter's replies reach their locator. No CRM CTA (customer-facing).
export type LeadConfirmationEmailParams = {
  locatorName?: string | null
  /**
   * Resolved workspace-owner identity (see agentSignature.ts). When provided, the
   * email renders the shared compliance disclosure + agent signature block. The
   * caller resolves this from the CORRECT owner; the template never hard-codes it.
   */
  signature?: ResolvedAgentIdentity | null
  lead: {
    first_name?: string | null
    city?: string | null
    move_date?: string | null
    desired_rent?: string | null
    income?: string | null
    beds?: string | null
    baths?: string | null
    property_type?: string | null
    neighborhoods?: string | null
    submarkets?: string | null
    credit_score?: string | null
    credit_history?: string | null
    broken_lease_age?: string | null
    broken_lease_amount?: string | null
    eviction_court?: string | null
    eviction_age?: string | null
    eviction_balance?: string | null
    criminal_background?: string | null
    criminal_charge?: string | null
    felony_age?: string | null
    misdemeanor_age?: string | null
    notes?: string | null
  }
}

export function leadConfirmationEmail({ locatorName, signature, lead }: LeadConfirmationEmailParams): BuiltEmail {
  const city = (lead.city ?? "").trim() || "your area"
  const first = (lead.first_name ?? "").trim().split(/\s+/)[0]
  const heading = first ? `Hi ${first},` : "Hi there," // renderEmail escapes this
  const layout = bedsBathsLabel(lead)
  const locatorFirst = (locatorName ?? "").trim().split(/\s+/)[0]

  // Client-facing readability: slightly larger body text + line height than the
  // shared helpers, scoped to THIS renter email only (other notifications keep
  // the compact defaults). Each step is its own block with breathing room so it
  // scans cleanly on mobile.
  const bodyPara = (html: string) =>
    `<p style="margin:0 0 18px 0;font-size:16px;line-height:1.65;color:${BRAND.inkSoft};">${html}</p>`
  const step = (n: number, text: string) =>
    `<div style="margin:0 0 16px 0;font-size:16px;line-height:1.7;color:${BRAND.inkSoft};"><span style="font-weight:700;color:${BRAND.ink};">Step ${n}:</span> ${text}</div>`

  const contentHtml = `
    ${bodyPara(
      `Thanks for reaching out about your search in <strong>${esc(
        city
      )}</strong>! We've received your details and are reviewing your budget, move timeline, and location preferences to find the best available options for you.`
    )}
    <h2 style="margin:28px 0 8px 0;font-size:18px;font-weight:700;color:${BRAND.ink};">Your search summary</h2>
    ${infoTable(
      [
        { label: "Move date", value: lead.move_date ? formatDateDisplay(lead.move_date) : null },
        { label: "Budget", value: lead.desired_rent },
        { label: "Monthly Income", value: lead.income },
        { label: "Layout", value: layout },
        { label: "Property type", value: lead.property_type },
        { label: "Preferred areas", value: lead.neighborhoods },
        { label: "Nearby areas", value: lead.submarkets },
        { label: "Notes", value: lead.notes },
        // PRIVACY: credit/eviction/criminal screening is NEVER shown to the renter.
        // It stays internal to the workspace-owner notification only.
      ],
      { labelSize: 14, valueSize: 15, pad: 9 },
    )}
    <h2 style="margin:30px 0 14px 0;font-size:18px;font-weight:700;color:${BRAND.ink};">What happens next?</h2>
    ${step(1, "Your locator reviews real-time pricing and availability to find the best options for your approval profile.")}
    ${step(2, "You receive a focused, custom list with clear pricing and any current incentives.")}
    ${step(3, "You tour only the properties that make the most sense for you.")}
    ${bodyPara(
      `If anything changes with your budget, location, or timeline, just reply to this email${
        locatorFirst ? ` and ${esc(locatorFirst)} will help` : ""
      }.`
    )}
    ${
      signature
        ? renderClientSignatureHtml(signature, {
            showDisclosure: decideIabs(signature, { leadCity: lead.city }).show,
          })
        : paragraph(`— ${esc((locatorName ?? "").trim() || "Your Locator Beast locator")}`)
    }
  `

  return {
    category: "transactional",
    subject: `${city} Search Update`,
    html: renderEmail({
      ...cityBanner(lead.city), // city skyline follows the LEAD's market
      hideWordmark: true, // thin skyline band only — no wordmark band
      // Client-facing: the renter should see their AGENT's contact info, not a
      // platform support address, so the support footer line is suppressed here.
      hideSupport: true,
      preheader: `We've received your ${city} apartment search and are finding your best options.`,
      heading,
      contentHtml,
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
  const fullName = formatPersonName([lead.first_name, lead.last_name].filter(Boolean).join(" ")) || "a lead"
  const by = (assignedByName ?? "").trim()
  const contentHtml = `
    ${paragraph(`${greeting(assigneeName)} ${by ? `${esc(by)} assigned` : "you've been assigned"} a lead to you in Locator Beast.`)}
    ${infoTable([
      { label: "Lead", value: formatPersonName([lead.first_name, lead.last_name].filter(Boolean).join(" ")) },
      { label: "City", value: lead.city },
    ])}
    ${paragraph("Open the lead to review the details and start following up.")}
  `
  return {
    category: "leads",
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
    ${paragraph("Jump into your Lead Board to get set up.")}
  `
  return {
    category: "transactional",
    subject: "Welcome to Locator Beast 🐆",
    html: renderEmail({
      preheader: "Your Locator Beast account is ready.",
      heading: "Welcome to Locator Beast",
      contentHtml,
      cta: { label: "Open your Lead Board", url: absoluteUrl("/admin/leads") },
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
    category: "transactional",
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
    category: "transactional",
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
    // Billing: all subscription/payment communication comes from billing@.
    category: "billing",
    subject: "Your Locator Beast subscription is active",
    html: renderEmail({
      preheader: "Thanks for subscribing — you have full access.",
      heading: "Subscription confirmed 🎉",
      contentHtml,
      cta: { label: "Go to your Lead Board", url: absoluteUrl("/admin/leads") },
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
    category: "billing",
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
    category: "billing",
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
    category: "billing",
    subject: "Welcome back — your Locator Beast subscription is active",
    html: renderEmail({
      preheader: "Your subscription is active again.",
      heading: "You're back in 🎉",
      contentHtml,
      cta: { label: "Go to your Lead Board", url: absoluteUrl("/admin/leads") },
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
    category: "transactional",
    subject: "Reset your Locator Beast password",
    html: renderEmail({
      preheader: "Reset your Locator Beast password.",
      heading: "Reset your password",
      contentHtml,
      cta: { label: "Reset password", url: params.actionUrl },
    }),
  }
}

// ─── Account: deletion verification code ─────────────────────────────────────

/**
 * The 6-digit code that authorises permanent account deletion.
 *
 * Deliberately has NO call-to-action link. Every other account email here ends
 * in a button, but a one-click path to irreversible deletion is exactly what
 * this flow must not offer — the code has to be carried back to the session
 * that asked for it, which is what makes it a second factor rather than a
 * second click. It also means a forwarded or intercepted email cannot delete
 * anything on its own.
 */
export function deletionCodeEmail(params: { code: string; minutes: number; name?: string | null }): BuiltEmail {
  const contentHtml = `
    ${paragraph(`${greeting(params.name)} here is the confirmation code to permanently delete your Locator Beast account.`)}
    <p style="margin:24px 0;text-align:center;font-size:32px;font-weight:700;letter-spacing:8px;color:#111318;">${params.code}</p>
    ${paragraph(`This code expires in ${params.minutes} minutes and can be used once.`)}
    ${paragraph("Deleting your account is immediate and permanent. It is not the same as cancelling your subscription, and it is not covered by the 90-day recovery period.")}
    ${paragraph("If you didn't request this, ignore this email — nothing will be deleted — and change your password, since someone may have access to your session.")}
  `
  return {
    category: "transactional",
    subject: "Your Locator Beast account deletion code",
    html: renderEmail({
      preheader: "Your account deletion confirmation code.",
      heading: "Confirm account deletion",
      contentHtml,
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
    category: "transactional",
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
