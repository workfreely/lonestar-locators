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
import { findDuplicateMatch, type LeadIdentity } from "@/lib/leads/duplicateDetection"

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
  "city", "neighborhoods", "submarkets", "property_type", "desired_rent",
  "beds", "baths", "income",
  "credit_history", "credit_score", "broken_lease_age", "broken_lease_amount",
  "eviction_court", "eviction_age", "eviction_balance",
  "criminal_background", "criminal_charge", "felony_age", "misdemeanor_age",
  "notes", "website",
  "lead_type", "lead_category",
  "source", "landing_page", "referrer_url",
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid",
  "device_type", "browser", "operating_system",
  // Manual "Add Lead" (LeadFormModal) fields — added when that form was
  // routed through this endpoint so it gains the same allowlist/honeypot/
  // duplicate-detection protection the public forms already have.
  "facebook", "instagram", "tiktok", "locator_notes",
] as const

const BOOLEAN_FIELDS = ["sms_opt_in"] as const
const NULLABLE_TIMESTAMP_FIELDS = ["sms_consent_at"] as const

const MAX_LENGTH = 500 // generous cap; current forms never approach this — just blocks abuse-sized payloads
const MAX_LENGTH_SHORT = 120 // for fields that are realistically short (names, phone, single option values)

const SHORT_FIELD_SET = new Set([
  "first_name", "last_name", "phone", "email", "credit_score",
  "beds", "baths", "lead_type", "lead_category", "source",
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

  payload.lead_type = formType
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

  try {
    // ─── Duplicate detection ────────────────────────────────────────────
    // Soft-deleted leads are excluded from matching — a deletion is a
    // deliberate signal ("this shouldn't exist as an active record"), so a
    // resubmission from that person should create a fresh lead rather than
    // silently reviving or mutating the deleted one. Leads archived for
    // any other reason (ghosted, unqualified, etc.) remain valid targets.
    const { data: existingLeads, error: existingError } = await supabaseAdmin
      .from("leads")
      .select("id, first_name, last_name, phone, email, move_date")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })

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
      const insertPayload =
        match.confidence === "possible" && match.matchedLead
          ? { ...result.payload, possible_duplicate_of: (match.matchedLead as any).id }
          : result.payload

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
            await createNewLeadCalendarEvent({
              first_name: result.payload.first_name as string | undefined,
              last_name: result.payload.last_name as string | undefined,
              phone: result.payload.phone as string | undefined,
              city: result.payload.city as string | undefined,
              source: result.payload.source as string | undefined,
              desired_rent: result.payload.desired_rent as string | undefined,
              beds: result.payload.beds as string | undefined,
              move_date: result.payload.move_date as string | undefined,
              credit_score: result.payload.credit_score as string | undefined,
            })
          } catch (err) {
            console.error("[api/leads/submit] New-lead calendar event failed:", err)
          }
        })
      } catch (err) {
        console.error("[api/leads/submit] Failed to schedule new-lead calendar event:", err)
      }
    }

    return NextResponse.json({ success: true, leadId: data.id, lead: data, action: dedupAction })
  } catch (err) {
    console.error("[api/leads/submit] Unexpected error:", err)
    return NextResponse.json({ success: false, error: "Something went wrong. Please try again." }, { status: 500 })
  }
}
