// PRODUCTION SMOKE TEST — the client recommendation page.
//
// Purpose: catch a broken renter-facing page BEFORE a real client sees it. The
// gray-placeholder regression shipped, sat in production, and was found by a human
// opening a link on a phone. This is the check that should have found it first.
//
// SAFE AND REPEATABLE. Strictly READ-ONLY: it resolves shares that already exist
// through the same RPC the public page calls, and fetches image URLs with GET. It
// mints nothing, writes nothing, and touches no sent snapshot. Run it as often as
// you like, including immediately after every deploy.
//
// WHY IT RESOLVES RATHER THAN MINTS. Minting requires workspace membership
// (lb_create_client_share raises for a non-member), and a smoke test must not
// create rows in production anyway. Resolving is the half that matters: it is
// exactly what the client's browser does, so a pass here means a real token would
// render.
//
// Run:  npx tsx scripts/share/smokeClientPage.ts            (newest live share per lead)
//       npx tsx scripts/share/smokeClientPage.ts --lead 84  (one client)
//       npx tsx scripts/share/smokeClientPage.ts --images   (also GET every image URL)
//
// Exit 1 if any live share would render a degraded page.

import { readFileSync } from "node:fs"

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line.includes("=") || line.trimStart().startsWith("#")) continue
  const k = line.slice(0, line.indexOf("=")).trim()
  if (!process.env[k]) process.env[k] = line.slice(line.indexOf("=") + 1).trim()
}
const U = process.env.NEXT_PUBLIC_SUPABASE_URL!
const K = process.env.SUPABASE_SERVICE_ROLE_KEY!
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" }

const argLead = process.argv.includes("--lead") ? process.argv[process.argv.indexOf("--lead") + 1] : null
const checkImages = process.argv.includes("--images")

type Prop = {
  index: number; name: string; imageUrl: string | null; backupImageUrl: string | null
  googleRating: number | null; currentSpecial: string | null; websiteUrl: string | null
  reasons: string[] | null; favorited: boolean; startingPrice: number | null
}

let failures = 0
const problem = (s: string) => { failures++; console.log(`      ✗ ${s}`) }

async function main() {
  // The newest LIVE share per lead — what a client clicking their most recent link
  // would actually load. Disabled/revoked shares are excluded: they are meant to be
  // dead, so a degraded render there is not a defect.
  const q = `select=id,lead_id,list_number,token_hash,sent_at,created_at&disabled_at=is.null&revoked_at=is.null&order=created_at.desc`
      + (argLead ? `&lead_id=eq.${argLead}` : "")
  const shares = await (await fetch(`${U}/rest/v1/client_recommendation_shares?${q}`, { headers: H })).json()
  const newestPerLead = new Map<number, any>()
  for (const s of shares) if (!newestPerLead.has(s.lead_id)) newestPerLead.set(s.lead_id, s)

  console.log(`CLIENT PAGE SMOKE TEST — ${newestPerLead.size} live share(s), newest per client\n`)

  for (const s of [...newestPerLead.values()].sort((a, b) => a.lead_id - b.lead_id)) {
    // The exact call the public page makes (page.tsx passes the sha256 of the raw
    // token; we read the stored hash, which is the same value).
    const res = await fetch(`${U}/rest/v1/rpc/lb_resolve_client_recommendations`, {
      method: "POST", headers: H, body: JSON.stringify({ p_token_hash: s.token_hash }),
    })
    const data = await res.json()
    const share = Array.isArray(data) ? data[0] : data
    const label = `lead ${s.lead_id} list ${s.list_number}${s.sent_at ? " (SENT)" : ""}`

    if (!res.ok || !share) { console.log(`  ${label}: RESOLVER FAILED`); problem("resolver returned nothing"); continue }
    const props: Prop[] = share.properties ?? []
    console.log(`  ${label} — status "${share.status}", ${props.length} propert${props.length === 1 ? "y" : "ies"}`)

    if (share.status !== "active") { console.log(`      (paused/disabled — not a defect)`); continue }
    if (props.length === 0) { problem("an ACTIVE share resolves zero properties — the client sees an empty list"); continue }

    const n = props.length
    const has = (f: (p: Prop) => boolean) => props.filter(f).length
    const img = has((p) => !!p.imageUrl)
    const rating = has((p) => p.googleRating != null)
    const site = has((p) => !!p.websiteUrl)
    const reasons = has((p) => (p.reasons ?? []).length > 0)
    const special = has((p) => !!p.currentSpecial)
    console.log(`      image ${img}/${n} · rating ${rating}/${n} · website ${site}/${n} · reasons ${reasons}/${n} · special ${special}/${n}`)

    // An image is the single most visible failure — a card with none is the gray
    // placeholder this test exists to prevent.
    if (img < n) problem(`${n - img} propert${n - img === 1 ? "y" : "ies"} would render a GRAY PLACEHOLDER`)
    // A website is what makes the card actionable.
    if (site < n) problem(`${n - site} propert${n - site === 1 ? "y" : "ies"} would hide "View Property"`)
    // Ratings and reasons are degradations, not breakage — reported, not failed.
    if (rating < n) console.log(`      ⚠ ${n - rating} without a Google rating (row hidden)`)
    if (reasons < n) console.log(`      ⚠ ${n - reasons} without "Why I chose this for you"`)

    if (checkImages) {
      for (const p of props) {
        if (!p.imageUrl) continue
        try {
          const r = await fetch(p.imageUrl, { headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*" } })
          const ct = r.headers.get("content-type") ?? ""
          if (!r.ok || !/^image\//.test(ct)) problem(`${p.name}: image URL returned ${r.status} ${ct || "(no type)"}`)
        } catch (e) {
          problem(`${p.name}: image URL unreachable — ${(e as Error).message}`)
        }
      }
    }
  }

  console.log(failures === 0
    ? `\n✅ Every live client page renders completely.`
    : `\n❌ ${failures} problem(s) — a client opening one of these links would see a degraded page.`)
  process.exit(failures === 0 ? 0 : 1)
}
main()
