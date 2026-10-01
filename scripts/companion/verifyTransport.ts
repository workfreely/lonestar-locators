// STEP 0 — BEAST SYNC TRANSPORT SMOKE TEST. READ-ONLY.
//
// Proves the EXISTING Companion transport end to end:
//   Mac app → /api/companion/messages → companion_messages → attributed lead
//
// Writes nothing. Changes no billing or organization logic. Run it before pairing to
// capture a baseline, then after each step below.
//
// WHY A SCRIPT RATHER THAN EYEBALLING SUPABASE: item 8 (non-null lead_id) and item 9
// (no duplicates) are the two that actually matter, and both are easy to misread by
// hand. Storage alone proves little — attribution is what everything downstream
// depends on.
//
// Usage:
//   npx tsx scripts/companion/verifyTransport.ts                baseline / after each step
//   npx tsx scripts/companion/verifyTransport.ts --watch        poll until a message lands
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { getAccessState } from "@/lib/billing/access"
import { getOrganizationStatus } from "@/lib/billing/organization"

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line.includes("=") || line.trimStart().startsWith("#")) continue
  const k = line.slice(0, line.indexOf("=")).trim()
  if (!process.env[k]) process.env[k] = line.slice(line.indexOf("=") + 1).trim()
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const ok = (b: boolean) => (b ? "PASS" : "----")

async function snapshot() {
  const devices = await db.from("device_tokens").select("id,last_synced_at,revoked_at,app_version,created_at")
  const msgs = await db.from("companion_messages").select("id,guid,lead_id,phone,is_from_me,sent_at,created_at")
  const briefs = await db.from("ai_client_briefs").select("lead_id,message_count,last_synced_at")
  return {
    devices: (devices.data ?? []) as Array<Record<string, unknown>>,
    msgs: (msgs.data ?? []) as Array<Record<string, unknown>>,
    briefs: (briefs.data ?? []) as Array<Record<string, unknown>>,
  }
}

async function main() {
  const s = await snapshot()

  console.log("═".repeat(80))
  console.log("STEP 0 — BEAST SYNC TRANSPORT")
  console.log("═".repeat(80))

  // ── Item 10: entitlement, using the real production functions ─────────────
  const p = await db.from("profiles").select("id,preferred_name,subscription_status,trial_ends_at")
    .eq("preferred_name", "Jay Morris").maybeSingle()
  const prof = p.data as Record<string, unknown> | null
  let entitled = false
  if (prof) {
    const org = await getOrganizationStatus(db as never, prof.id as string)
    const access = getAccessState({
      subscription_status: (prof.subscription_status as string) ?? null,
      trial_ends_at: (prof.trial_ends_at as string) ?? null,
      organization_status: org,
    } as never)
    entitled = access.allowed
    console.log(`\n10. ENTITLEMENT  ${ok(entitled)}`)
    console.log(`    subscription   ${JSON.stringify(prof.subscription_status)}  trial_ends ${prof.trial_ends_at}`)
    console.log(`    organization   ${JSON.stringify(org)}`)
    console.log(`    verdict        ${JSON.stringify(access)}`)
    if (entitled && access.reason === "organization") {
      console.log(`    NOTE: passing via network membership, NOT billing — the trial expired.`)
      console.log(`          If that row changes, the Companion pauses SILENTLY (entitled:false`)
      console.log(`          is a normal 200-shaped response, not an error).`)
    }
  }

  // ── Item 4: pairing ───────────────────────────────────────────────────────
  const live = s.devices.filter((d) => !d.revoked_at)
  console.log(`\n 4. DEVICE PAIRED  ${ok(live.length >= 1)}   device_tokens: ${s.devices.length} (${live.length} active)`)
  for (const d of s.devices) {
    console.log(`    ${String(d.id).slice(0, 8)}  v${d.app_version ?? "?"}  last_synced=${d.last_synced_at ?? "never"}${d.revoked_at ? "  REVOKED" : ""}`)
  }

  // ── Items 7 + 8: persisted and attributed ─────────────────────────────────
  console.log(`\n 7. MESSAGE PERSISTED  ${ok(s.msgs.length >= 1)}   companion_messages: ${s.msgs.length}`)
  const attributed = s.msgs.filter((m) => m.lead_id != null)
  console.log(` 8. ATTRIBUTED TO A LEAD  ${ok(attributed.length >= 1)}   ${attributed.length} of ${s.msgs.length} have lead_id`)
  if (s.msgs.length) {
    const ids = [...new Set(attributed.map((m) => m.lead_id))]
    if (ids.length) {
      const leads = await db.from("leads").select("id,first_name,last_name,phone").in("id", ids as number[])
      for (const l of (leads.data ?? []) as Array<Record<string, unknown>>) {
        const n = attributed.filter((m) => m.lead_id === l.id).length
        console.log(`    lead ${l.id} ${l.first_name} ${l.last_name ?? ""} (${l.phone}) — ${n} message(s)`)
      }
    }
    const orphans = s.msgs.filter((m) => m.lead_id == null)
    if (orphans.length) {
      console.log(`    ${orphans.length} UNATTRIBUTED — phone did not last-10 match any lead in the workspace:`)
      for (const m of orphans.slice(0, 5)) console.log(`       ${m.phone}  (last10 ${String(m.phone).replace(/\D/g, "").slice(-10)})`)
    }
  }

  // ── Item 9: idempotency ───────────────────────────────────────────────────
  const guids = s.msgs.map((m) => m.guid as string)
  const dupes = guids.filter((g, i) => guids.indexOf(g) !== i)
  console.log(`\n 9. NO DUPLICATES  ${ok(s.msgs.length >= 1 && dupes.length === 0)}   ${guids.length} rows, ${new Set(guids).size} distinct guids`)
  if (dupes.length) console.log(`    DUPLICATED guids: ${[...new Set(dupes)].join(", ")}`)
  else if (s.msgs.length) console.log(`    (run Refresh Now again, then re-run this script — the count must not grow)`)

  console.log(`\n    ai_client_briefs: ${s.briefs.length} (not required for Step 0)`)

  const pass = live.length >= 1 && s.msgs.length >= 1 && attributed.length >= 1 && dupes.length === 0 && entitled
  console.log(`\n${"═".repeat(80)}`)
  console.log(pass ? "STEP 0: PASS — transport proven end to end" : "STEP 0: INCOMPLETE — see the ---- rows above")
  console.log("═".repeat(80))
  if (!pass) {
    console.log("\nWhat needs a human at the keyboard:")
    if (live.length === 0) {
      console.log("  1. cd companion && swift run            (builds clean; defaults to https://locatorbeast.com)")
      console.log("  2. Grant Full Disk Access to the Companion app itself, then relaunch")
      console.log("  3. Menu bar 💬 → Connect Locator Beast… → Approve in the browser")
      console.log("  4. Re-run this script: device_tokens must become 1")
    } else if (s.msgs.length === 0) {
      console.log("  Menu bar 💬 → Refresh Now, with a lead whose phone matches a real Messages thread")
    }
  }
  process.exit(pass ? 0 : 1)
}

if (process.argv.includes("--watch")) {
  const tick = async () => {
    const s = await snapshot()
    console.log(`${new Date().toLocaleTimeString()}  devices=${s.devices.length}  messages=${s.msgs.length}  attributed=${s.msgs.filter((m) => m.lead_id != null).length}`)
    if (s.msgs.some((m) => m.lead_id != null)) { console.log("\nA message landed and was attributed — run without --watch for the full report."); process.exit(0) }
    setTimeout(tick, 10_000)
  }
  tick()
} else {
  main().catch((e) => { console.error("FATAL:", e.message); process.exit(1) })
}
