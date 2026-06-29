// TEMPORARY debug route for verifying Location Intelligence before it is
// wired into calculateMatchScore. Safe to delete once verification is done.
//
// POST { name, postal_code, neighborhood } → location signal breakdown.

import { NextResponse } from "next/server"
import { getPropertyLocationSignals } from "@/lib/matching/locationIntelligence"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, postal_code, neighborhood } = body

    const signals = await getPropertyLocationSignals({
      name,
      zip: postal_code,
      neighborhood,
    })

    return NextResponse.json(signals)
  } catch (err) {
    console.error("[debug/location-signals] error:", err)
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    )
  }
}
