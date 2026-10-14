// WHY I CHOSE THIS — does generation run for a NEW recommendation? READ-ONLY.
//
// Run: set -a && . ./.env.local && set +a && npx tsx scripts/verifyRecommendationReasons.ts
//
// Exercises the EXACT evidence path the Map/Explorer add uses, with lead 91's own saved criteria
// and real properties already in its recommendation list. It writes nothing: no recommendation,
// no lead, no list is sent.

import { supabaseAdmin } from "@/lib/supabase/admin"
import { collectRecommendationReasons } from "@bc/companion-shared"
import { assessLocationFit } from "@/lib/propertyExplorer/locationFit"

async function main() {
  const { data: lead } = await supabaseAdmin
    .from("leads").select("id, city, neighborhoods, submarkets").eq("id", 91).maybeSingle()
  const { data: recs } = await supabaseAdmin
    .from("lead_recommendations")
    .select("id, property_name, property_address, reasons, created_at")
    .eq("lead_id", 91).order("id")

  const desiredAreas = [lead?.neighborhoods, lead?.submarkets].filter(Boolean).join(", ")
  console.log(`\nlead 91 — city ${lead?.city}, desired areas "${desiredAreas}"`)
  console.log("\nWhat each SAVED recommendation holds, and what generation WOULD produce today:\n")
  for (const r of recs ?? []) {
    const fit = assessLocationFit(
      { propertyAddress: r.property_address, propertyName: r.property_name } as never,
      { city: lead?.city ?? null, desiredAreas: desiredAreas || null },
    )
    const would = collectRecommendationReasons({
      locationMatch: fit?.tone === "match",
      locationArea: fit?.match ?? null,
    })
    console.log(`  ${String(r.id).padEnd(4)} ${String(r.property_name).slice(0, 30).padEnd(32)} created ${String(r.created_at).slice(0, 19)}`)
    console.log(`       saved : ${JSON.stringify(r.reasons)}`)
    console.log(`       today : ${JSON.stringify(would)}   (fit ${fit?.tone ?? "none"}${fit?.match ? ` — ${fit.match}` : ""})`)
  }
  console.log("\nNOTHING WAS WRITTEN. Saved reasons are untouched.\n")
}

main().catch((e) => { console.error(e); process.exit(1) })
