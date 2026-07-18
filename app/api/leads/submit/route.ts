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
//
// Also creates the "New Lead" Google Calendar event server-side (full-form
// renter leads only) via `after()`, once the insert has succeeded — see
// the POST handler below. This replaces the old client-side fire-and-forget
// call to /api/google/new-lead-event that only LandingForm.tsx ever made;
// ContactForm.tsx never had it, so every full submission through
// /start-your-search, city-specific pages, and the blog/review/comparison/
// listing layouts was silently missing a calendar event. Both forms now
// get it for free by going through this one route.

import { NextResponse, after } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createNewLeadCalendarEvent } from "@/lib/google/createCalendarEvent"

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
    // once that happens.
    if (formType === "full" && result.payload.lead_category === "renter") {
      // TEMPORARY DEBUG LOGGING — remove once the calendar-creation
      // failure is root-caused. Tagged [calendar-debug] so it's easy to
      // grep out of Vercel logs and easy to strip from this file later.
      const debugLeadId = data.id
      const debugLeadName = `${result.payload.first_name ?? ""} ${result.payload.last_name ?? ""}`.trim()

      try {
        // TEMPORARY — one-deploy diagnostic. after() swapped for a direct
        // awaited call to determine whether after() itself is the cause of
        // Calendar events not being created in production. See conversation
        // history / commit message for context. Revert once confirmed either
        // way.
        await (async () => {
          console.log(`[calendar-debug] after() callback started — leadId: ${debugLeadId}, name: ${debugLeadName}`)
          try {
            console.log(`[calendar-debug] Calling createNewLeadCalendarEvent — leadId: ${debugLeadId}`)
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
            const message = err instanceof Error ? err.message : String(err)
            const status  = (err as any)?.response?.status
            const data    = (err as any)?.response?.data
            console.error(`[calendar-debug] New-lead calendar event failed — leadId: ${debugLeadId}`)
            console.error(`[calendar-debug] Error message:`, message)
            if (status) console.error(`[calendar-debug] HTTP status:`, status)
            if (data)   console.error(`[calendar-debug] Response body:`, JSON.stringify(data, null, 2))
            console.error("[api/leads/submit] New-lead calendar event failed:", err)
          }
        })()
      } catch (err) {
        console.error("[api/leads/submit] Failed to schedule new-lead calendar event:", err)
      }
    }

    return NextResponse.json({ success: true, leadId: data.id })
  } catch (err) {
    console.error("[api/leads/submit] Unexpected error:", err)
    return NextResponse.json({ success: false, error: "Something went wrong. Please try again." }, { status: 500 })
  }
}
