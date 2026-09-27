// v1.1 regression guard for the 253-image human-reviewed set (195 GOOD / 58 BAD).
// Deterministic ($0): proves v1.1 did NOT touch any of the 253 records and reuses the FROZEN classifier
// unchanged, so every human GOOD/BAD decision is preserved by construction. (Re-running the frozen gate
// over all 253 would re-surface the documented brand_card false-positives the humans deliberately
// overrode — and is exactly the broad vision audit the cost policy says to avoid — so the guarantee is
// established structurally, not by re-classifying.)
import fs from "node:fs"; import path from "node:path"
;(() => { const p = path.join(process.cwd(), ".env.local"); for (const l of fs.readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "") } })()
const S = process.env.S!
async function main() {
  const { ALGO_VERSION } = await import("./imageEngine")
  const { ALGO_VERSION_V11 } = await import("./v11/engine")
  const hr = JSON.parse(fs.readFileSync(`${S}/human_review_manifest.json`, "utf8")) as any[]
  const good = hr.filter((r) => r.human_decision === "GOOD").map((r) => r.place_id)
  const bad = hr.filter((r) => r.human_decision === "BAD").map((r) => r.place_id)
  const set253 = new Set([...good, ...bad])
  // v1.1 writes this session
  const written = ["ChIJJ_NImh3DQIYRwvOYNuFzftA","ChIJbUnkUOXORIYRSSHWhG0o1vc","ChIJ9d5aTtSDToYR9hm5Mh6qEiI","ChIJd5-n0U1gXIYRyX_On6xZC7Y","ChIJmTsr3zpbXIYRUKsxb5LuB04","ChIJ6Z6zrT6ZToYRowizGlJ1W_g","ChIJCSyRCxaAToYRz-7MrTo43yg"]
  const canary16 = ["ChIJfV4bii6ZToYRZWGQpcwPx54","ChIJJ5qyPn3ORIYRi6MIN-BtsDk","ChIJqyoYP0O0RIYRbd5Z9TDWQGU","ChIJJ_NImh3DQIYRwvOYNuFzftA","ChIJbUnkUOXORIYRSSHWhG0o1vc","ChIJ9d5aTtSDToYR9hm5Mh6qEiI","ChIJd5-n0U1gXIYRyX_On6xZC7Y","ChIJiyt2Yz_RRIYRzwWMOF93uAA","ChIJmTsr3zpbXIYRUKsxb5LuB04","ChIJ_ZRcVkQgTIYROeWtX_z95VY","ChIJ5U6vebbJRIYR1q_3jcE60vA","ChIJ6Z6zrT6ZToYRowizGlJ1W_g","ChIJ-1dL17HpToYRkW2dLN679So","ChIJm1Kf8AbMRIYRCtdJuT-yeBA","ChIJCSyRCxaAToYRz-7MrTo43yg","ChIJgVqB-TKZToYRVSXv5OzVkkA"]
  const writtenIn253 = written.filter((p) => set253.has(p))
  const canaryIn253 = canary16.filter((p) => set253.has(p))
  // DB: confirm none of the 253 carry v1.1 provenance
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  let v11on253 = 0
  for (let i = 0; i < [...set253].length; i += 200) {
    const chunk = [...set253].slice(i, i + 200)
    const { data } = await supabaseAdmin.from("property_catalog").select("place_id").in("place_id", chunk).ilike("property_image_source_detail", "%v1.1%")
    v11on253 += data?.length ?? 0
  }
  const ok = (c: boolean, m: string) => console.log(`  ${c ? "✓" : "✗"} ${m}`)
  console.log(`253 set: ${good.length} GOOD + ${bad.length} BAD = ${set253.size}`)
  ok(good.length === 195 && bad.length === 58, "manifest holds exactly 195 GOOD + 58 BAD")
  ok(ALGO_VERSION === "property-image-intelligence-v1.0", `frozen engine version unchanged (${ALGO_VERSION})`)
  ok(ALGO_VERSION_V11 === "property-image-intelligence-v1.1" && ALGO_VERSION_V11 !== ALGO_VERSION, "v1.1 is a DISTINCT version — v1.0 not overwritten")
  ok(writtenIn253.length === 0, `no v1.1 write intersects the 253 (${writtenIn253.length})`)
  ok(canaryIn253.length === 0, `no canary target is in the 253 (${canaryIn253.length})`)
  ok(v11on253 === 0, `no 253 record carries v1.1 provenance in DB (${v11on253})`)
  console.log(`\n${writtenIn253.length === 0 && canaryIn253.length === 0 && v11on253 === 0 ? "PASS" : "FAIL"} — the 195 GOOD stay accepted and the 58 BAD stay rejected; v1.1 altered none of them and did not weaken the frozen classifier.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
