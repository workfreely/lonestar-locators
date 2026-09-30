// ONE-OFF: re-word existing commute reasons whose saved display label can now be
// shortened by the San Antonio alias bank.
//
// Largely redundant going forward — the commute route recomposes automatically the
// next time a client is opened after their label changes — but kept for a bulk
// re-wording after the bank itself is edited, where waiting for every client to be
// opened would be slow.
//
// NO ROUTES CALL. Cached commute_minutes only.
//
// Run: npx tsx scripts/leads/backfillCommuteLabels.ts [--apply]
import { readFileSync } from "node:fs"
for (const line of readFileSync(".env.local","utf8").split("\n")) {
  if (!line.includes("=") || line.trimStart().startsWith("#")) continue
  const k=line.slice(0,line.indexOf("=")).trim()
  if(!process.env[k]) process.env[k]=line.slice(line.indexOf("=")+1).trim()
}
const U=process.env.NEXT_PUBLIC_SUPABASE_URL!, K=process.env.SUPABASE_SERVICE_ROLE_KEY!
const H={apikey:K,Authorization:`Bearer ${K}`,"Content-Type":"application/json",Prefer:"return=representation"}
const APPLY=process.argv.includes("--apply")

async function main(){
  const { applyCommuteReason, isCommuteReason } = await import("@/lib/commute/commuteReason")
  const { displayDestinationLabel } = await import("@/lib/commute/destinationAliases")

  const leads = await (await fetch(`${U}/rest/v1/leads?select=id,first_name,commute_anchor_label,commute_anchor_place_id&commute_anchor_place_id=not.is.null`,{headers:H})).json()
  const rows  = await (await fetch(`${U}/rest/v1/lead_property_reasons?select=id,lead_id,canonical_property_key,reasons,commute_minutes,commute_anchor_place_id,commute_computed_at&commute_minutes=not.is.null`,{headers:H})).json()
  console.log(`${leads.length} client(s) with a destination · ${rows.length} row(s) with a cached commute\n`)

  const changes:any[]=[]
  for(const row of rows){
    const lead = leads.find((l:any)=>String(l.id)===String(row.lead_id))
    if(!lead){ console.log(`  skip row ${row.id} — its client has no destination`); continue }
    // GUARD: only re-word when the cache belongs to the client's CURRENT anchor.
    // A stale row must be re-measured by the route, not re-worded here.
    if(row.commute_anchor_place_id !== lead.commute_anchor_place_id){
      console.log(`  skip ${row.canonical_property_key} — cache is for a DIFFERENT anchor (needs Routes)`); continue
    }
    const label = displayDestinationLabel(lead.commute_anchor_label)
    const before:string[] = Array.isArray(row.reasons)?row.reasons:[]
    const { reasons, outcome } = applyCommuteReason(before, row.commute_minutes, label)
    if(outcome!=="updated") { continue }
    // GUARD: exactly one element may differ, and it must be the commute reason.
    const diff = before.map((v,i)=>[v,reasons[i]]).filter(([a,b])=>a!==b)
    if(before.length!==reasons.length || diff.length!==1 || !isCommuteReason(String(diff[0][0])) || !isCommuteReason(String(diff[0][1]))){
      console.error(`  ABORT: row ${row.id} would change more than the commute reason`); process.exit(1)
    }
    console.log(`  lead ${row.lead_id} ${row.canonical_property_key}`)
    console.log(`      "${diff[0][0]}"  →  "${diff[0][1]}"`)
    changes.push({id:row.id, reasons})
  }
  console.log(`\n${changes.length} row(s) to re-word (manual reasons untouched, no Routes call).`)
  if(!changes.length || !APPLY){ if(!APPLY&&changes.length) console.log("(dry run — pass --apply)"); return }
  for(const c of changes){
    const r=await fetch(`${U}/rest/v1/lead_property_reasons?id=eq.${c.id}`,{method:"PATCH",headers:H,
      body:JSON.stringify({reasons:c.reasons, updated_at:new Date().toISOString()})})
    console.log(`  row ${c.id}: HTTP ${r.status}`)
  }
}
main()
