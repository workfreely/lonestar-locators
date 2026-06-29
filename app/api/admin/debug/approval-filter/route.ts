// TEMPORARY debug route for lib/matching/approvalFilter.ts.
//
// Verifies pass/fail approval logic in isolation — no scoring, no
// calculateMatchScore, no other filters — just the approval check
// against every property for the lead's city.
//
// Does NOT change any production behavior. Not wired into production.
// Safe to delete once verification is done.
//
// GET /api/admin/debug/approval-filter?leadId=174

import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { checkApproval } from "@/lib/matching/approvalFilter"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const leadId = searchParams.get("leadId") || "174"

    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("id, first_name, last_name, city, credit_score, broken_lease_age, broken_lease_amount, eviction_age, eviction_balance, eviction_court, felony_age, criminal_background, criminal_charge")
      .eq("id", leadId)
      .single()

    if (leadError) return NextResponse.json({ error: leadError.message }, { status: 500 })
    if (!lead) return NextResponse.json({ error: `No lead found with id "${leadId}"` }, { status: 404 })

    const citySlug =
      (lead.city || "").toLowerCase().replace(", tx", "").replace(/\s+/g, "-") || "san-antonio"

    const { data: propertyRows, error: propError } = await supabaseAdmin
      .from("properties")
      .select("id, name, credit_min, broken_lease_ok, eviction_ok, felony_ok")
      .eq("city_slug", citySlug)

    if (propError) return NextResponse.json({ error: propError.message }, { status: 500 })

    const properties = propertyRows || []
    const results = properties.map((p: any) => {
      const result = checkApproval(lead, p)
      return {
        property: p.name,
        credit_min: p.credit_min ?? null,
        broken_lease_ok: p.broken_lease_ok ?? null,
        eviction_ok: p.eviction_ok ?? null,
        felony_ok: p.felony_ok ?? null,
        ...result,
      }
    })

    // Show derived booleans from the first result (same lead, same derivation for all)
    const sampleDerived = results[0]?.derived ?? null

    return NextResponse.json({
      lead: {
        id: lead.id,
        first_name: lead.first_name,
        last_name: lead.last_name,
        credit_score: lead.credit_score ?? null,
        broken_lease_age: lead.broken_lease_age ?? null,
        broken_lease_amount: lead.broken_lease_amount ?? null,
        eviction_age: lead.eviction_age ?? null,
        eviction_balance: lead.eviction_balance ?? null,
        eviction_court: lead.eviction_court ?? null,
        felony_age: lead.felony_age ?? null,
        criminal_background: lead.criminal_background ?? null,
        criminal_charge: lead.criminal_charge ?? null,
      },
      derived: sampleDerived,
      citySlugUsed: citySlug,
      totalPropertiesScanned: properties.length,
      buckets: {
        APPROVED: results.filter((r) => r.classification === "APPROVED").length,
        REVIEW: results.filter((r) => r.classification === "REVIEW").length,
        DENIED: results.filter((r) => r.classification === "DENIED").length,
      },
      results,
    })
  } catch (err) {
    console.error("[debug/approval-filter] error:", err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : null,
      },
      { status: 500 }
    )
  }
}
