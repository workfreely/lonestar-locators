import { google } from "googleapis"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { recordGoogleFailure } from "./integrationHealth"
import { classifyGoogleError } from "./integrationHealthRules"
import { buildContactNotes } from "@/lib/google/buildContactNotes"
import { getOAuthClientForUser } from "@/lib/google/getOAuthClientForUser"

// Locator Beast Google Contact creation for a lead, in the OWNING agent's own
// connected Google account (per-agent, via getOAuthClientForUser reading
// google_credentials). Locator Beast's own integration: per-agent only, with no
// legacy/global credential and no legacy deployment coupling.
//
// BEST-EFFORT by contract: this never throws. No connected Google account →
// skip. Revoked/expired token or any Google API error → non-PII warning and
// return. Designed to run inside `after()` in leads/submit so a Google failure
// can never block or roll back lead creation.
//
// The contact content (name + "(CITY)" label, phone normalization, notes body,
// and the google_contact_id write-back) is preserved exactly from the former
// route so migrated contacts are identical.

// Accepts the persisted lead row (snake_case, e.g. leads/submit's result.payload).
export interface GoogleContactLeadFields {
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  email?: string | null
  city?: string | null
  source?: string | number | null
  move_date?: string | number | null
  desired_rent?: string | number | null
  neighborhoods?: string | number | null
  submarkets?: string | number | null
  property_type?: string | number | null
  beds?: string | number | null
  baths?: string | number | null
  credit_score?: string | number | null
  credit_history?: string | number | null
  broken_lease_age?: string | number | null
  broken_lease_amount?: string | number | null
  eviction_court?: string | number | null
  eviction_age?: string | number | null
  eviction_balance?: string | number | null
  criminal_background?: string | number | null
  criminal_charge?: string | number | null
  crm_status?: string | null
  next_follow_up?: string | null
  follow_up_count?: number | null
}

const s = (v: unknown): string | null => (v == null ? null : String(v))

/**
 * Create the contact in the OWNING agent's own connected Google account. Skips
 * silently when the agent has not connected Google; a revoked/expired token is
 * surfaced by the create call and caught (skip). No `verify` — we let the actual
 * write surface invalid_grant rather than spending a second token exchange.
 */
export async function createGoogleContactForOwner(
  ownerUserId: string | null | undefined,
  leadId: string | number | null | undefined,
  lead: GoogleContactLeadFields,
): Promise<void> {
  try {
    const client = await getOAuthClientForUser(ownerUserId, { verify: false })
    if (!client) return // agent has not connected Google → skip silently

    const people = google.people({ version: "v1", auth: client })

    // City label — unchanged from the former route.
    const cityMap: Record<string, string> = {
      "San Antonio": "SATX",
      Austin: "AUS",
      Dallas: "DAL",
      Houston: "HOU",
    }
    const cityLabel = cityMap[lead.city ?? ""] || lead.city || "Lead"

    // Notes body — same builder, same fields (snake_case row → its camelCase input).
    const notes = buildContactNotes({
      crm_status: lead.crm_status,
      next_follow_up: lead.next_follow_up,
      follow_up_count: lead.follow_up_count,
      source: s(lead.source),
      moveDate: s(lead.move_date),
      desiredRent: s(lead.desired_rent),
      neighborhoods: s(lead.neighborhoods),
      submarkets: s(lead.submarkets),
      propertyType: s(lead.property_type),
      beds: s(lead.beds),
      baths: s(lead.baths),
      creditScore: s(lead.credit_score),
      creditHistory: s(lead.credit_history),
      brokenLeaseAge: s(lead.broken_lease_age),
      brokenLeaseAmount: s(lead.broken_lease_amount),
      evictionAge: s(lead.eviction_age),
      evictionBalance: s(lead.eviction_balance),
      evictionCourt: s(lead.eviction_court),
      criminalBackground: s(lead.criminal_background),
      criminalCharge: s(lead.criminal_charge),
    })

    // Phone normalization — unchanged (strip non-digits, drop leading 1, +1…).
    const cleanedPhone = lead.phone?.replace(/\D/g, "")?.replace(/^1/, "")
    const formattedPhone = cleanedPhone ? `+1${cleanedPhone}` : ""

    const result = await people.people.createContact({
      requestBody: {
        names: [{ givenName: lead.first_name ?? undefined, familyName: `${lead.last_name ?? ""} (${cityLabel})` }],
        emailAddresses: lead.email ? [{ value: lead.email }] : [],
        phoneNumbers: formattedPhone ? [{ value: formattedPhone }] : [],
        biographies: [{ value: notes }],
      },
    })

    const resourceName = result.data.resourceName
    if (leadId && resourceName) {
      const { error } = await supabaseAdmin
        .from("leads")
        .update({ google_contact_id: resourceName })
        .eq("id", leadId)
      if (error) console.warn(`[google/contact] failed to save google_contact_id for lead ${leadId}`)
    }
  } catch (e: unknown) {
    const code =
      (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
      (e as { code?: string })?.code ??
      "error"
    // Non-PII: only the lead id + error class; never the token, google_email, or client details.
    console.warn(`[google/contact] contact creation skipped for lead ${leadId ?? "?"} (${code === "invalid_grant" ? "invalid_grant — agent must reconnect Google" : code})`)
    // RECORD IT. This path builds its client with verify:false — deliberately, to avoid a second
    // token exchange — so getOAuthClientForUser's own failure recording never runs here and a
    // revoked token produced a console line and nothing else. That is precisely the silence the
    // health feature exists to end: the Integrations page could read "connected" while every new
    // lead quietly failed to get a contact. A transient code is recorded but never asks for a
    // reconnect; only a terminal auth error does.
    await recordGoogleFailure(ownerUserId ?? "", classifyGoogleError(e))
  }
}
