// Server-side lead intake for every lead entry point — the public
// renter-lead forms (LandingForm, ContactForm — both short and full modes)
// AND the CRM's manual "Add Lead" modal (LeadFormModal). Replaces direct
// `supabase.from("leads").insert()` calls from the browser.
//
// Why this exists: anon access to `leads` is intentionally denied at the
// database level (it holds sensitive PII — credit score, criminal
// background, eviction/broken-lease detail). This route is the one
// server-side path allowed to write to it, using the service-role key,
// which is never exposed to the browser.
//
// Scope: renter leads only (`leads` table). Does not touch
// new_home_leads or reported_leases.
//
// Duplicate detection: after validation/honeypot, before any write, every
// submission is checked against existing leads (soft-deleted ones
// excluded — see the query below) via lib/leads/duplicateDetection.ts.
// An exact match (normalized phone or email) updates that lead in place
// instead of creating a second row — see buildExactMatchUpdate(). A
// possible match (name + move_date only) still creates a new row, linked
// via possible_duplicate_of for a locator to review; never silently
// merged. No match creates the lead exactly as before. Ported from the
// crm-v2-foundation prototype (normalizeLead.ts / duplicateDetection.ts,
// unmodified) and re-wired against this route's current security model —
// that branch's own version of this route was not reused.
//
// Also creates the "New Lead" Google Calendar event server-side (full-form
// renter leads only, and only for a genuinely new row — see isNewLead
// below) via `after()`, once the write has succeeded — see the POST
// handler below. This replaces the old client-side fire-and-forget call to
// /api/google/new-lead-event that only LandingForm.tsx used to make.

import { NextResponse, after } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createNewLeadCalendarEvent } from "@/lib/google/createCalendarEvent"
import { createGoogleContactForOwner, type GoogleContactLeadFields } from "@/lib/google/createGoogleContact"
import { getOAuthClientForUser } from "@/lib/google/getOAuthClientForUser"
import { findDuplicateMatch, type LeadIdentity } from "@/lib/leads/duplicateDetection"
import { getStageWorkflowAction, createWorkflowActionIfNeeded } from "@/lib/workflowEngine"
import { resolveUserTimeZone } from "@/lib/timezone/server"
import { resolveWorkHoursFromProfile } from "@/lib/workflow/autoDueDate"
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember"
import { sendNotification, newLeadEmail, leadConfirmationEmail, absoluteUrl } from "@/lib/notifications"
import { resolveAgentIdentityForOwner } from "@/lib/notifications/agentSignature"
import { resolveClientType } from "@/lib/leads/leadClassification"
import { shouldExitDemoOnLead, exitDemoModeForOwner } from "@/lib/demo/demoExit"
import { resolveSupabaseProject } from "@/lib/supabase/projects"
import { isValidUsPhone } from "@/lib/utils/formatPhone"

// Server-only client — SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_
// prefix, so it is never bundled into browser JS.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Explicit allowlist — the ONLY columns this route will ever write.
// Anything in the request that isn't listed here is silently dropped
// before it reaches Supabase. This is what prevents arbitrary column
// injection from a crafted request body. Deliberately excludes
// `page_url`, which was never a real column and caused the production
// outage this route exists to fix.
const STRING_FIELDS = [
  "first_name", "last_name", "phone", "email", "move_date",
  "city", "neighborhoods", "submarkets", "property_type", "must_have_amenities", "desired_rent",
  "beds", "baths", "income",
  "credit_history", "credit_score", "broken_lease_age", "broken_lease_amount",
  "eviction_court", "eviction_age", "eviction_balance",
  "criminal_background", "criminal_charge", "felony_age", "misdemeanor_age",
  "notes", "website",
  "lead_type", "lead_category",
  "source", "landing_page", "referrer_url",
  // Who referred this client (paired with source = "referral"). Like `source`,
  // deliberately ABSENT from SCALAR_LABELS, so a resubmission can never
  // overwrite a name the locator already typed.
  "referred_by",
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid",
  // Stable Meta campaign/ad ids (canonical join to ad performance) + display-only name snapshots,
  // captured from the ad destination URL by the Smart Lead Form. Attribution → NOT in SCALAR_LABELS,
  // so they are first-touch protected (never overwritten on a resubmission).
  // meta_publisher_platform = Meta's {{site_source_name}} (fb|ig|msg|an) — the actual
  // Facebook-vs-Instagram delivery surface for this click; same first-touch protection.
  "meta_campaign_id", "meta_adset_id", "meta_ad_id", "meta_campaign_name", "meta_adset_name", "meta_ad_name", "meta_publisher_platform",
  "device_type", "browser", "operating_system",
  // Manual "Add Lead" (LeadFormModal) field — added when that form was
  // routed through this endpoint so it gains the same allowlist/honeypot/
  // duplicate-detection protection the public forms already have.
  // The instagram/tiktok/facebook handles that used to sit here were removed
  // with the Add Lead inputs: nothing collects them any more, so this route
  // must not write them. The COLUMNS and their existing values are kept.
  "locator_notes",
] as const

const BOOLEAN_FIELDS = ["sms_opt_in"] as const
const NULLABLE_TIMESTAMP_FIELDS = ["sms_consent_at"] as const

const MAX_LENGTH = 500 // generous cap; current forms never approach this — just blocks abuse-sized payloads
const MAX_LENGTH_SHORT = 120 // for fields that are realistically short (names, phone, single option values)

const SHORT_FIELD_SET = new Set([
  "first_name", "last_name", "phone", "email", "credit_score",
  "beds", "baths", "lead_type", "lead_category", "source", "referred_by",
  "device_type", "browser", "operating_system",
])

type ValidationError = { field: string; message: string }

function validateAndBuildPayload(
  formType: string,
  rawLead: Record<string, unknown>
): { payload: Record<string, unknown> } | { errors: ValidationError[] } {
  const errors: ValidationError[] = []
  const payload: Record<string, unknown> = {}

  if (formType !== "short" && formType !== "full") {
    return { errors: [{ field: "formType", message: "formType must be 'short' or 'full'" }] }
  }

  for (const field of STRING_FIELDS) {
    const value = rawLead[field]
    if (value === undefined || value === null || value === "") continue
    if (typeof value !== "string") {
      errors.push({ field, message: `${field} must be a string` })
      continue
    }
    const cap = SHORT_FIELD_SET.has(field) ? MAX_LENGTH_SHORT : MAX_LENGTH
    if (value.length > cap) {
      errors.push({ field, message: `${field} is too long` })
      continue
    }
    payload[field] = value
  }

  for (const field of BOOLEAN_FIELDS) {
    const value = rawLead[field]
    if (value === undefined || value === null) continue
    if (typeof value !== "boolean") {
      errors.push({ field, message: `${field} must be a boolean` })
      continue
    }
    payload[field] = value
  }

  for (const field of NULLABLE_TIMESTAMP_FIELDS) {
    const value = rawLead[field]
    if (value === undefined || value === null || value === "") continue
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
      errors.push({ field, message: `${field} must be a valid timestamp` })
      continue
    }
    payload[field] = value
  }

  // Required fields — matches what the client already effectively
  // requires today (first/last name, phone). Not adding new required
  // fields (e.g. email) that the current forms don't already enforce.
  //
  // `city` is required for full-form submissions only — every completed
  // renter lead must have a city. Short-form submissions intentionally
  // don't collect city yet (that happens on the full form later), so it's
  // left out of this list for formType "short" to keep that flow exactly
  // as fast/frictionless as it is today.
  const requiredFields =
    formType === "full"
      ? ["first_name", "last_name", "phone", "city"]
      : ["first_name", "last_name", "phone"]

  for (const required of requiredFields) {
    if (!payload[required] || typeof payload[required] !== "string" || (payload[required] as string).trim() === "") {
      errors.push({ field: required, message: `${required} is required` })
    }
  }

  if (payload.email && typeof payload.email === "string" && !payload.email.includes("@")) {
    errors.push({ field: "email", message: "email is not valid" })
  }

  // Phone FORMAT. Presence is enforced by requiredFields above; this enforces
  // that what arrived is a COMPLETE U.S. number. Previously phone was validated
  // only for type and max length — the same loop that checks every string field
  // — so a 9-digit number passed straight through and was stored verbatim.
  // Locator Beast is U.S.-only for phone numbers: 10 digits, or 11 with the
  // leading country code 1. Anything else is REJECTED, never truncated.
  if (payload.phone && typeof payload.phone === "string" && !isValidUsPhone(payload.phone)) {
    errors.push({
      field: "phone",
      message: "phone must be a complete 10-digit US number",
    })
  }

  // lead_type describes the CLIENT, not the form. Locator Beast has ONE Smart
  // Lead Form; question configuration never creates a different "form type", so
  // lead_type is never derived from formType/field count/config — it is a
  // canonical client type (renter-only intake today) and defaults to renter.
  payload.lead_type = resolveClientType(payload.lead_type as string | undefined)
  payload.lead_category = "renter"

  return errors.length > 0 ? { errors } : { payload }
}

// ─── Duplicate-match exact-update helper ───────────────────────────────────
//
// Fields treated as a running narrative — concatenated with a timestamp
// marker on an exact match, never silently overwritten.
const NARRATIVE_FIELDS = ["notes", "neighborhoods"] as const
const NARRATIVE_LABELS: Record<string, string> = {
  notes: "Notes",
  neighborhoods: "Desired Areas",
}

// Every other allowlisted field that describes the lead's own details
// (not how/where they came in) is a plain scalar: newest non-blank value
// wins, and the previous value is recorded in the history block first.
// Attribution fields (source, utm_*, landing_page, referrer_url,
// device/browser/OS, lead_type/lead_category) are deliberately absent —
// first-touch attribution is never overwritten by a resubmission.
const SCALAR_LABELS: Record<string, string> = {
  first_name: "First Name",
  last_name: "Last Name",
  phone: "Phone",
  email: "Email",
  move_date: "Move Date",
  city: "City",
  submarkets: "Submarkets",
  property_type: "Property Type",
  desired_rent: "Budget",
  beds: "Bedrooms",
  baths: "Bathrooms",
  income: "Income",
  credit_history: "Credit History",
  credit_score: "Credit Score",
  broken_lease_age: "Broken Lease Age",
  broken_lease_amount: "Broken Lease Balance",
  eviction_court: "Eviction Court",
  eviction_age: "Eviction Age",
  eviction_balance: "Eviction Balance",
  criminal_background: "Criminal Background",
  criminal_charge: "Criminal Charge",
  felony_age: "Felony Age",
  misdemeanor_age: "Misdemeanor Age",
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === ""
}

function historyTimestamp(): string {
  return new Date().toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  })
}

/**
 * Builds the update payload + locator_notes history entry for an
 * exact-match resubmission. Never overwrites a field without recording its
 * previous value first. Narrative fields are concatenated, not replaced.
 * SMS consent is upgrade-only — an unchecked box on a resubmission never
 * revokes prior consent.
 */
function buildExactMatchUpdate(existing: Record<string, any>, candidate: Record<string, any>) {
  const update: Record<string, any> = {}
  const historyLines: string[] = []

  for (const [field, label] of Object.entries(SCALAR_LABELS)) {
    const newVal = candidate[field]
    if (isBlank(newVal)) continue
    const oldVal = existing[field]
    if (String(newVal) === String(oldVal ?? "")) continue
    historyLines.push(`Updated ${label}: "${isBlank(oldVal) ? "—" : oldVal}" → "${newVal}"`)
    update[field] = newVal
  }

  for (const field of NARRATIVE_FIELDS) {
    const newVal = candidate[field]
    if (isBlank(newVal)) continue
    const oldVal = existing[field]
    if (isBlank(oldVal)) {
      update[field] = newVal
    } else if (String(newVal) !== String(oldVal)) {
      update[field] = `${oldVal}; ${newVal}`
      historyLines.push(`Updated ${NARRATIVE_LABELS[field]}: added "${newVal}" (kept previous: "${oldVal}")`)
    }
  }

  if (candidate.sms_opt_in && !existing.sms_opt_in) {
    update.sms_opt_in = true
    update.sms_consent_at = new Date().toISOString()
    historyLines.push("SMS consent granted on resubmission")
  }

  if (historyLines.length > 0) {
    const historyBlock = [
      `[${historyTimestamp()}] Submitted again —`,
      ...historyLines.map((l) => `  • ${l}`),
      "",
    ].join("\n")
    update.locator_notes = existing.locator_notes
      ? `${historyBlock}\n${existing.locator_notes}`
      : historyBlock
  }

  return update
}

export async function POST(request: Request) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 })
  }

  const formType = body?.formType
  const rawLead = body?.lead

  if (!rawLead || typeof rawLead !== "object") {
    return NextResponse.json({ success: false, error: "Missing lead payload" }, { status: 400 })
  }

  const result = validateAndBuildPayload(formType, rawLead)

  if ("errors" in result) {
    console.warn("[api/leads/submit] Validation rejected:", result.errors)
    return NextResponse.json({ success: false, error: "Some fields were missing or invalid." }, { status: 400 })
  }

  // Honeypot: mirrors the existing client-side bot check. A filled
  // `website` field means a bot filled every input, including the one
  // hidden from real users. Report success without inserting, so an
  // automated client has no signal that it was caught.
  if (result.payload.website) {
    return NextResponse.json({ success: true, leadId: null })
  }

  // ─── Per-agent attribution (public Smart Lead Form: /{username}) ──────────
  // When the request carries a formUsername, resolve it SERVER-SIDE to the
  // owning workspace + agent (never trust owner/workspace from the body — those
  // aren't in the allowlist). New leads are stamped with these so they land in
  // the right tenant, and duplicate detection is scoped to that workspace so a
  // public form can never read/update another tenant's lead. Requests without a
  // formUsername (the existing Lone Star forms) are unchanged.
  const formUsername = typeof body?.formUsername === "string" ? body.formUsername : null
  // The Lone Star → LB bridge forwards a full lead to this route (path B) and
  // asks us NOT to re-send the renter confirmation — Lone Star already sends its
  // own client-facing messaging. Jay's internal new-lead notification still fires.
  const suppressCustomerConfirmation = body?.suppressCustomerConfirmation === true
  let attributedOwnerId: string | null = null
  let attributedWorkspaceId: string | null = null
  // Manual "Add Lead" (authenticated CRM). Resolve ownership from the SESSION via the canonical
  // guard — never from the body — so the lead lands in the caller's active workspace. Fixes manual
  // leads previously inserted with a null owner/workspace. Public/formUsername paths are untouched.
  let manualOwnerId: string | null = null
  let manualWorkspaceId: string | null = null
  if (body?.manualEntry === true) {
    const guard = await requireWorkspaceMember()
    if (!guard.ok) return guard.response
    manualOwnerId = guard.userId
    manualWorkspaceId = guard.workspaceId
  }
  if (formUsername) {
    const { data: resolved } = await supabaseAdmin.rpc("lb_resolve_public_form", {
      p_username: formUsername,
    })
    const row = Array.isArray(resolved) ? resolved[0] : resolved
    if (!row?.workspace_id) {
      return NextResponse.json(
        { success: false, error: "This form is no longer available." },
        { status: 404 }
      )
    }
    attributedOwnerId = row.owner_user_id
    attributedWorkspaceId = row.workspace_id
  }

  try {
    // ─── Duplicate detection ────────────────────────────────────────────
    // Soft-deleted leads are excluded from matching — a deletion is a
    // deliberate signal ("this shouldn't exist as an active record"), so a
    // resubmission from that person should create a fresh lead rather than
    // silently reviving or mutating the deleted one. Leads archived for
    // any other reason (ghosted, unqualified, etc.) remain valid targets.
    let existingQuery = supabaseAdmin
      .from("leads")
      .select("id, first_name, last_name, phone, email, move_date")
      .is("deleted_at", null)
    // Scope duplicate matching to the attributed workspace so a public agent
    // form never matches (and thus never updates) a lead in another tenant.
    if (attributedWorkspaceId) {
      existingQuery = existingQuery.eq("workspace_id", attributedWorkspaceId)
    }
    const { data: existingLeads, error: existingError } = await existingQuery.order("created_at", {
      ascending: false,
    })

    if (existingError) {
      // Fail open — duplicate detection is a quality-of-life feature, not
      // a security boundary. A lookup failure must never block a
      // legitimate new lead from being saved.
      console.error("[api/leads/submit] Failed to fetch existing leads for duplicate check:", existingError)
    }

    const candidateIdentity: LeadIdentity = {
      first_name: result.payload.first_name as string | undefined,
      last_name: result.payload.last_name as string | undefined,
      phone: result.payload.phone as string | undefined,
      email: result.payload.email as string | undefined,
      move_date: result.payload.move_date as string | undefined,
    }

    const match = existingLeads
      ? findDuplicateMatch(candidateIdentity, existingLeads)
      : { confidence: "none" as const, matchedLead: null, matchedSignals: [] }

    let data: any
    let isNewLead = true
    let dedupAction: "created" | "updated_existing" | "possible_duplicate" = "created"

    if (match.confidence === "exact" && match.matchedLead) {
      // existingLeads above is a narrow select (just identity fields, for
      // matching only) — buildExactMatchUpdate needs the full row to diff
      // correctly, or every field outside that narrow set would look like
      // it's changing from blank.
      const { data: existing, error: existingFullError } = await supabaseAdmin
        .from("leads")
        .select("*")
        .eq("id", (match.matchedLead as any).id)
        .single()

      if (existingFullError || !existing) {
        console.error("[api/leads/submit] Failed to fetch full matched lead:", existingFullError)
        return NextResponse.json({ success: false, error: "Something went wrong. Please try again." }, { status: 500 })
      }

      const update = buildExactMatchUpdate(existing, result.payload)

      // A resubmission that matches but carries nothing new (or nothing
      // this route allowlists) produces an empty update — Supabase/
      // PostgREST rejects an UPDATE with no columns to set, so skip the
      // write entirely and just report back the lead as it already is.
      let updated = existing
      if (Object.keys(update).length > 0) {
        const { data: updateResult, error: updateError } = await supabaseAdmin
          .from("leads")
          .update(update)
          .eq("id", existing.id)
          .select("*")
          .single()

        if (updateError) {
          console.error("[api/leads/submit] Exact-match update failed:", updateError)
          return NextResponse.json({ success: false, error: "Something went wrong. Please try again." }, { status: 500 })
        }

        updated = updateResult
      }

      data = updated
      isNewLead = false
      dedupAction = "updated_existing"
    } else {
      // Stamp attribution (server-resolved) on new public-form leads so the
      // ownership trigger routes them to the right agent/workspace.
      // Ownership always comes from the server-resolved identity (public formUsername OR the
      // authenticated manual guard above), never the body. For public/Lone Star this is identical
      // to before; it additionally repairs manual Add Lead, which otherwise inserts a null
      // owner/workspace (service-role insert → set_workspace_ownership() can't resolve auth.uid()
      // on a multi-workspace DB).
      const ownerId = attributedOwnerId ?? manualOwnerId
      const wsId = attributedWorkspaceId ?? manualWorkspaceId
      const basePayload =
        ownerId || wsId
          ? {
              ...result.payload,
              ...(ownerId ? { owner_user_id: ownerId } : {}),
              ...(wsId ? { workspace_id: wsId } : {}),
            }
          : result.payload
      const insertPayload =
        match.confidence === "possible" && match.matchedLead
          ? { ...basePayload, possible_duplicate_of: (match.matchedLead as any).id }
          : basePayload

      const { data: created, error: insertError } = await supabaseAdmin
        .from("leads")
        .insert([insertPayload])
        .select("*")
        .single()

      if (insertError) {
        console.error("[api/leads/submit] Insert failed:", insertError)
        return NextResponse.json({ success: false, error: "Something went wrong. Please try again." }, { status: 500 })
      }

      data = created
      dedupAction = match.confidence === "possible" ? "possible_duplicate" : "created"
    }

    // ─── Lone Star Locators → Locator Beast bridge (FULL form only) ───────
    // On the Lone Star deployment (legacy DB), forward each validated FULL-form
    // renter lead to the canonical LB route as Jay's public form (path B), so it
    // becomes ONE canonical LB CRM lead (workspace/owner = Jay, lead_type=renter,
    // crm_status=new, source="Lone Star Website"), with LB's workspace-scoped
    // dedupe handling retries. Short-form and non-legacy deployments never
    // forward. Deferred + isolated so it can never affect the legacy write or the
    // renter's response; suppressCustomerConfirmation avoids a double renter email.
    if (formType === "full" && resolveSupabaseProject(process.env.NEXT_PUBLIC_SUPABASE_URL)?.role === "legacy") {
      const bridgeLead = { ...result.payload, source: "Lone Star Website" }
      try {
        after(async () => {
          try {
            await fetch("https://locatorbeast.com/api/leads/submit", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                formType: "full",
                formUsername: "jay-morris",
                suppressCustomerConfirmation: true,
                lead: bridgeLead,
              }),
            })
          } catch (err) {
            console.error("[api/leads/submit] Lone Star → LB bridge failed:", err)
          }
        })
      } catch (err) {
        console.error("[api/leads/submit] Failed to schedule Lone Star → LB bridge:", err)
      }
    }

    // ─── New Lead Calendar event (server-side, best-effort) ───────────────
    // Scheduled via `after()` so it runs once this response has already
    // been sent — the lead is saved and the client redirects immediately
    // either way. A Calendar failure here can never roll back the insert
    // above or flip this response to an error.
    //
    // Two layers of isolation, deliberately: the inner try/catch handles a
    // failure inside the calendar call itself (bad credentials, Google API
    // error, etc.); the outer one handles a failure in registering the
    // callback with `after()` itself. Either way, nothing here can escape
    // to the outer route try/catch below and turn an already-successful
    // insert into a reported failure.
    //
    // Full renter leads only — short-form submissions get their calendar
    // event once (and if) they complete the full form later, same as
    // today; creating one at the short-form step would just double up
    // once that happens. Also skipped when this is an exact-match
    // resubmission (isNewLead false) — an existing lead shouldn't
    // generate a fresh "NEW LEAD — CONTACT ASAP" alert.
    if (isNewLead && formType === "full" && result.payload.lead_category === "renter") {
      try {
        after(async () => {
          try {
            const leadInput = {
              first_name: result.payload.first_name as string | undefined,
              last_name: result.payload.last_name as string | undefined,
              phone: result.payload.phone as string | undefined,
              city: result.payload.city as string | undefined,
              source: result.payload.source as string | undefined,
              desired_rent: result.payload.desired_rent as string | undefined,
              beds: result.payload.beds as string | undefined,
              move_date: result.payload.move_date as string | undefined,
              credit_score: result.payload.credit_score as string | undefined,
            }
            if (attributedOwnerId) {
              // Smart Lead Form (B2): create the New Lead event in the OWNING
              // agent's own connected Google Calendar. Not connected / revoked →
              // skip (no global fallback for an attributed LB agent). Event
              // content/timing unchanged — only the account/calendar differs.
              const client = await getOAuthClientForUser(attributedOwnerId, { verify: false })
              if (client) await createNewLeadCalendarEvent(leadInput, client)
            } else {
              // Non-attributed lead (legacy/global path) — unchanged.
              await createNewLeadCalendarEvent(leadInput)
            }
          } catch (err) {
            console.error("[api/leads/submit] New-lead calendar event failed:", err)
          }
        })
      } catch (err) {
        console.error("[api/leads/submit] Failed to schedule new-lead calendar event:", err)
      }
    }

    // ─── Google Contact (server-side, per-agent, best-effort) ─────────────
    // Locator Beast's own integration: creates the contact in the OWNING
    // agent's connected Google account, resolved server-side from the Smart
    // Lead Form slug (attributedOwnerId — un-forgeable, never from the body).
    // No legacy/global credential and no Lone Star coupling. Deferred via
    // `after()` and self-contained best-effort (createGoogleContactForOwner
    // never throws), so no connected account, a revoked token, or any Google
    // error can delay the response or roll back the insert. Only for a genuinely
    // new lead with a resolved agent owner — an exact-match resubmission
    // shouldn't create a duplicate contact, and an authenticated CRM add
    // (manualEntry) resolves no attributedOwnerId, so it creates no contact.
    if (isNewLead && attributedOwnerId) {
      try {
        after(async () => {
          await createGoogleContactForOwner(attributedOwnerId, data.id, result.payload as unknown as GoogleContactLeadFields)
        })
      } catch (err) {
        console.error("[api/leads/submit] Failed to schedule Google contact creation:", err)
      }
    }

    // ─── Workflow Engine — "New" stage: Contact Lead (immediate) ──────────
    // Deferred via `after()` for the same reason as the calendar event
    // above: never let this delay the response or roll back the insert.
    // Only for a genuinely new row (isNewLead) that's actually sitting in
    // "new" — an exact-match resubmission of an existing lead already past
    // that stage should never regenerate this reminder.
    if (isNewLead && data.crm_status === "new") {
      try {
        after(async () => {
          try {
            // Resolve the OWNING locator's saved timezone (profiles → workspaces →
            // America/Chicago) so Contact Lead's 9:00 AM deadline lands in the
            // locator's zone, not the production server zone. The lead submits via
            // a public form, so identity comes from the attributed owner/workspace.
            const timeZone = await resolveUserTimeZone(
              supabaseAdmin,
              data.owner_user_id ?? null,
              data.workspace_id ?? null,
            )
            // Owning locator's Working Hours (Profile setting) — clamps Contact
            // Lead's due time to their window; NULL/unconfigured or no owner → the
            // 9–21 default (resolveWorkHoursFromProfile handles a null row).
            let workHours = undefined as ReturnType<typeof resolveWorkHoursFromProfile> | undefined
            if (data.owner_user_id) {
              const { data: whProfile } = await supabaseAdmin
                .from("profiles")
                .select("work_hours_start, work_hours_end")
                .eq("id", data.owner_user_id)
                .maybeSingle()
              workHours = resolveWorkHoursFromProfile(whProfile)
            }
            const spec = getStageWorkflowAction("new", data, timeZone, workHours)
            if (spec) await createWorkflowActionIfNeeded(supabaseAdmin, data.id, spec)
          } catch (err) {
            console.error("[api/leads/submit] Workflow Engine action failed:", err)
          }
        })
      } catch (err) {
        console.error("[api/leads/submit] Failed to schedule Workflow Engine action:", err)
      }
    }

    // ─── Real lead arrives → leave the sample workspace ──────────────────
    // While profiles.demo_mode is on, app/admin/leads/page.tsx serves the demo
    // fixtures (DEMO_ALL_LEADS) and never queries the real table, so a genuine
    // lead would stay invisible. The first real, persisted, attributed lead
    // flips demo_mode off (only if it is still on) so the live CRM switches to
    // real data. This NEVER deletes demo data — the fixtures are static
    // client-side data, so Add / Reset / Remove Demo Workspace stay fully
    // functional. Deferred + isolated (exitDemoModeForOwner never throws): it
    // can never affect the saved lead or the response.
    if (shouldExitDemoOnLead(isNewLead, attributedOwnerId)) {
      const ownerId = attributedOwnerId as string
      try {
        after(() => exitDemoModeForOwner(supabaseAdmin, ownerId))
      } catch (err) {
        console.error("[api/leads/submit] Failed to schedule exit-demo-mode:", err)
      }
    }

    // ─── New Lead notification email → the locator (Smart Lead Form only) ─
    // Only for genuinely new leads attributed to a workspace owner via their
    // public Smart Lead Form (attributedOwnerId set). Deferred via after() and
    // fully isolated so a mail failure can never affect the saved lead or the
    // response. The existing Lone Star marketing forms (no formUsername) are
    // unaffected — they keep their own confirmation flow.
    if (isNewLead && attributedOwnerId) {
      const ownerId = attributedOwnerId
      const leadRow = data
      try {
        after(async () => {
          try {
            const { data: owner } = await supabaseAdmin
              .from("profiles")
              .select("email, first_name, full_name")
              .eq("id", ownerId)
              .maybeSingle()
            if (!owner?.email) return
            await sendNotification({
              to: owner.email,
              ...newLeadEmail({
                locatorName: owner.full_name || owner.first_name,
                leadUrl: absoluteUrl(`/admin/leads?id=${leadRow.id}`),
                lead: leadRow,
              }),
            })
          } catch (err) {
            console.error("[api/leads/submit] New-lead notification email failed:", err)
          }
        })
      } catch (err) {
        console.error("[api/leads/submit] Failed to schedule new-lead notification email:", err)
      }
    }

    // ─── Confirmation email → the renter (Smart Lead Form only) ──────────────
    // Only for genuinely new leads from a public Smart Lead Form (attributedOwnerId
    // set) that provided an email. Scoped this way so the legacy Lone Star marketing
    // forms keep their own confirmation flow and no visitor is double-emailed.
    // Deferred + isolated so a mail failure never affects the saved lead. The
    // renter replies land with their locator (Reply-To = the owner's email); the
    // city skyline header follows the lead's market via the shared theme registry.
    if (isNewLead && attributedOwnerId && result.payload.email && !suppressCustomerConfirmation) {
      const ownerId = attributedOwnerId
      const leadRow = data
      const customerEmail = result.payload.email as string
      try {
        after(async () => {
          try {
            // Resolve the CORRECT workspace owner's identity for the shared
            // compliance disclosure + signature block (Texas IABS + contact card).
            const signature = await resolveAgentIdentityForOwner(supabaseAdmin, ownerId)
            await sendNotification({
              to: customerEmail,
              replyTo: signature?.email || undefined, // renter replies reach their locator
              ...leadConfirmationEmail({ locatorName: signature?.name ?? null, signature, lead: leadRow }),
            })
          } catch (err) {
            console.error("[api/leads/submit] Customer confirmation email failed:", err)
          }
        })
      } catch (err) {
        console.error("[api/leads/submit] Failed to schedule customer confirmation email:", err)
      }
    }

    return NextResponse.json({ success: true, leadId: data.id, lead: data, action: dedupAction })
  } catch (err) {
    console.error("[api/leads/submit] Unexpected error:", err)
    return NextResponse.json({ success: false, error: "Something went wrong. Please try again." }, { status: 500 })
  }
}
