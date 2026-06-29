// Data quality audit for approval filter fields.
//
// Scans every property and reports what percentage have credit_min,
// broken_lease_ok, eviction_ok, and felony_ok populated. Use this
// before deciding whether to wire approvalFilter into production.
//
// GET /api/admin/debug/approval-filter/data-quality
// GET /api/admin/debug/approval-filter/data-quality?citySlug=san-antonio

import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

const FIELDS = ["credit_min", "broken_lease_ok", "eviction_ok", "felony_ok"] as const

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const citySlug = searchParams.get("citySlug") ?? null

    let query = supabaseAdmin
      .from("properties")
      .select("id, name, city_slug, credit_min, broken_lease_ok, eviction_ok, felony_ok")

    if (citySlug) {
      query = query.eq("city_slug", citySlug)
    }

    const { data: properties, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!properties || properties.length === 0) {
      return NextResponse.json({ error: "No properties found" }, { status: 404 })
    }

    const total = properties.length

    // Per-field coverage counts
    const coverage: Record<string, { populated: number; missing: number; pct: string }> = {}
    for (const field of FIELDS) {
      const populated = properties.filter((p) => p[field] !== null && p[field] !== undefined).length
      coverage[field] = {
        populated,
        missing: total - populated,
        pct: `${((populated / total) * 100).toFixed(1)}%`,
      }
    }

    // Properties missing ALL four fields
    const fullyBlind = properties.filter(
      (p) =>
        p.credit_min === null &&
        p.broken_lease_ok === null &&
        p.eviction_ok === null &&
        p.felony_ok === null
    )

    // Properties with full data (all four fields present)
    const fullyReady = properties.filter(
      (p) =>
        p.credit_min !== null &&
        p.broken_lease_ok !== null &&
        p.eviction_ok !== null &&
        p.felony_ok !== null
    )

    // Missing just credit_min (will always land in MANUAL_REVIEW)
    const missingCreditOnly = properties.filter(
      (p) =>
        p.credit_min === null &&
        p.broken_lease_ok !== null &&
        p.eviction_ok !== null &&
        p.felony_ok !== null
    )

    // Per-city breakdown
    const byCityMap: Record<string, { total: number; fullyReady: number; missingCreditMin: number }> = {}
    for (const p of properties) {
      const slug = p.city_slug || "unknown"
      if (!byCityMap[slug]) byCityMap[slug] = { total: 0, fullyReady: 0, missingCreditMin: 0 }
      byCityMap[slug].total++
      if (
        p.credit_min !== null &&
        p.broken_lease_ok !== null &&
        p.eviction_ok !== null &&
        p.felony_ok !== null
      ) {
        byCityMap[slug].fullyReady++
      }
      if (p.credit_min === null) {
        byCityMap[slug].missingCreditMin++
      }
    }

    const byCity = Object.entries(byCityMap)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([slug, stats]) => ({
        citySlug: slug,
        ...stats,
        readyPct: `${((stats.fullyReady / stats.total) * 100).toFixed(1)}%`,
      }))

    // List every property missing credit_min (will cause MANUAL_REVIEW for every lead)
    const manualReviewCandidates = properties
      .filter((p) => p.credit_min === null)
      .map((p) => ({ id: p.id, name: p.name, city_slug: p.city_slug }))

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      citySlugFilter: citySlug ?? "all",
      totalProperties: total,
      fullyReadyCount: fullyReady.length,
      fullyReadyPct: `${((fullyReady.length / total) * 100).toFixed(1)}%`,
      fullyBlindCount: fullyBlind.length,
      missingCreditOnlyCount: missingCreditOnly.length,
      fieldCoverage: coverage,
      byCity,
      manualReviewCandidates,
    })
  } catch (err) {
    console.error("[debug/approval-filter/data-quality] error:", err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : null,
      },
      { status: 500 }
    )
  }
}
