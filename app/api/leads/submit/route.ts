// Server-side lead intake for all public renter-lead forms (LandingForm,
// ContactForm — both short and full modes). Replaces direct
// `supabase.from("leads").insert()` calls from the browser.
//
// Why this exists: anon access to `leads` is intentionally denied at the
// database level (it holds sensitive PII — credit score, criminal
// background, eviction/broken-lease detail). This route is the one
// server-side path allowed to write to it, using the service-role key,
// which is never exposed to the browser.
//
// Scope: renter leads only (`leads` table). Does not touch
// new_home_leads, reported_leases, or the CRM's manual Add Lead path —
// those are unrelated to this incident and untouched.
//
// Does NOT include Duplicate Detection — that work lives on
// crm-v2-foundation and hasn't been tested/merged. Every submission here
// is inserted as a new row, same as production behaved before this fix.

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

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
  for (const required of ["first_name", "last_name", "phone"]) {
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
    const { data, error } = await supabaseAdmin
      .from("leads")
      .insert([result.payload])
      .select("id")
      .single()

    if (error) {
      console.error("[api/leads/submit] Insert failed:", error)
      return NextResponse.json({ success: false, error: "Something went wrong. Please try again." }, { status: 500 })
    }

    return NextResponse.json({ success: true, leadId: data.id })
  } catch (err) {
    console.error("[api/leads/submit] Unexpected error:", err)
    return NextResponse.json({ success: false, error: "Something went wrong. Please try again." }, { status: 500 })
  }
}
