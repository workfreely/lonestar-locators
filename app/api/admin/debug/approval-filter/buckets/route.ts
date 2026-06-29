// Bucket distribution summary for approval classification.
//
// Shows APPROVED / REVIEW / DENIED counts per lead so you can validate
// the filter before wiring into production. REVIEW properties are
// included in results; only DENIED are excluded.
//
// GET /api/admin/debug/approval-filter/buckets?leadIds=174,200,250
// GET /api/admin/debug/approval-filter/buckets?leadIds=174

import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { checkApproval } from "@/lib/matching/approvalFilter"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const raw = searchParams.get("leadIds") ?? "174"
    const leadIds = raw.split(",").map((s) => s.trim()).filter(Boolean)

    const { data: leads, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("id, first_name, last_name, city, credit_score, broken_lease_age, broken_lease_amount, eviction_age, eviction_balance, eviction_court, felony_age, criminal_background, criminal_charge")
      .in("id", leadIds)

    if (leadError) return NextResponse.json({ error: leadError.message }, { status: 500 })
    if (!leads || leads.length === 0) {
      return NextResponse.json({ error: `No leads found for ids: ${leadIds.join(", ")}` }, { status: 404 })
    }

    const summary = await Promise.all(
      leads.map(async (lead) => {
        const citySlug =
          (lead.city || "").toLowerCase().replace(", tx", "").replace(/\s+/g, "-") || "san-antonio"

        const { data: propertyRows, error: propError } = await supabaseAdmin
          .from("properties")
          .select("id, name, credit_min, broken_lease_ok, eviction_ok, felony_ok")
          .eq("city_slug", citySlug)

        if (propError) {
          return {
            leadId: lead.id,
            name: `${lead.first_name} ${lead.last_name}`,
            error: propError.message,
          }
        }

        const properties = propertyRows || []
        const results = properties.map((p: any) => checkApproval(lead, p))

        const approved = results.filter((r) => r.classification === "APPROVED").length
        const review = results.filter((r) => r.classification === "REVIEW").length
        const denied = results.filter((r) => r.classification === "DENIED").length
        const total = results.length

        // Breakdown of denial reasons
        const denialReasons: Record<string, number> = {}
        for (const r of results) {
          if (r.classification === "DENIED") {
            denialReasons[r.status] = (denialReasons[r.status] ?? 0) + 1
          }
        }

        return {
          leadId: lead.id,
          name: `${lead.first_name} ${lead.last_name}`,
          citySlug,
          credit_score: lead.credit_score ?? null,
          derived: results[0]?.derived ?? null,
          totalProperties: total,
          buckets: { APPROVED: approved, REVIEW: review, DENIED: denied },
          denialReasons,
          includedInResults: approved + review,
          excludedFromResults: denied,
        }
      })
    )

    return NextResponse.json({ leads: summary })
  } catch (err) {
    console.error("[debug/approval-filter/buckets] error:", err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : null,
      },
      { status: 500 }
    )
  }
}
