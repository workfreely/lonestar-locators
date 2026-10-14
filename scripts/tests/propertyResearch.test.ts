// REUSABLE PROPERTY RESEARCH — identity, isolation, and what may reach marketing.
//
// Pure and offline. Run: `npx tsx scripts/tests/propertyResearch.test.ts`
// No database, no network, no production write.
//
// The failure this guards is specific and expensive: research about one building appearing on
// another building's video. Two paths lead there — a missing place_id matching "the first row",
// and one account reading another's notes — so both are asserted, not assumed.

import { readFileSync, existsSync } from "node:fs"
import {
  researchKeyFor, isMarketable, unverifiedClaims, CLAIM_STATUSES,
  type PropertyResearchRecord,
} from "@/lib/social/propertyResearch"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n")

// ── TWO VIDEOS OF ONE PROPERTY RESOLVE TO ONE RECORD ────────────────────────────────────────
console.log("\nReuse across videos")
const OWNER = "c567c077-d3f4-4532-8807-a54795f753f5"
const v1 = { owner_user_id: OWNER, place_id: "PLACE_A" }
const v2 = { owner_user_id: OWNER, place_id: "PLACE_A" }
const k1 = researchKeyFor(v1), k2 = researchKeyFor(v2)
ok("two videos of the same property resolve to the same key", JSON.stringify(k1) === JSON.stringify(k2))
ok("and that key is (owner, place) — never place alone", k1?.ownerUserId === OWNER && k1?.placeId === "PLACE_A")

console.log("\nA different property inherits nothing")
ok("a different place_id is a different key", JSON.stringify(researchKeyFor({ owner_user_id: OWNER, place_id: "PLACE_B" })) !== JSON.stringify(k1))
ok("the SAME place under another owner is a different key", JSON.stringify(researchKeyFor({ owner_user_id: "other-owner", place_id: "PLACE_A" })) !== JSON.stringify(k1))

// ── A MISSING place_id MERGES NOTHING ───────────────────────────────────────────────────────
// This is the dangerous case: two unidentified properties must not collapse into one record
// because both happen to have no id.
console.log("\nMissing place_id is handled safely")
for (const [label, c] of [
  ["null place_id", { owner_user_id: OWNER, place_id: null }],
  ["empty place_id", { owner_user_id: OWNER, place_id: "" }],
  ["whitespace place_id", { owner_user_id: OWNER, place_id: "   " }],
  ["null owner", { owner_user_id: null, place_id: "PLACE_A" }],
  ["nothing at all", null],
] as const) {
  ok(`${label} ⇒ no key, so no record is reused`, researchKeyFor(c) === null)
}
const api = codeOnly(readFileSync("app/api/admin/social-autopilot/property-research/route.ts", "utf8"))
ok("the endpoint refuses a blank placeId rather than returning a row", /if \(!placeId\) return NextResponse\.json\(\{ research: null, reason: "no_place_id" \}\)/.test(api))
ok("and that check runs BEFORE any query", api.indexOf("no_place_id") < api.indexOf('.from("social_property_research")'))
ok("the UI never fetches without a placeId", /if \(!open \|\| !placeId\) return/.test(readFileSync("components/crm/social/VerifiedPropertyDetails.tsx", "utf8")))

// ── OWNERSHIP IS THE DATABASE'S ─────────────────────────────────────────────────────────────
console.log("\nAuthorization")
ok("the route accepts no owner id from the caller", !/owner_user_id/.test(api))
ok("it uses the request-scoped client, so RLS applies", /await createClient\(\)/.test(api) && !/supabaseAdmin/.test(api))
ok("unauthenticated is refused", /if \(!user\) return NextResponse\.json\(\{ error: "unauthorized" \}, \{ status: 401 \}\)/.test(api))
ok("the endpoint is read-only", !/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(api))
const mig = readFileSync("supabase/migrations/20261019000000_social_property_research.sql", "utf8")
ok("RLS is enabled AND forced", /enable row level security/.test(mig) && /force row level security/.test(mig))
ok("the owner policy is account-scoped", /using \(is_platform_admin\(\) and owner_user_id = auth\.uid\(\)\)/.test(mig))
ok("the agent policy requires a real connection", /c\.agent_user_id = auth\.uid\(\)/.test(mig))
ok("…AND that the content was actually shared", /sc\.available_to_agents/.test(mig))
ok("one row per (owner, place_id)", /unique \(owner_user_id, place_id\)/.test(mig))

// ── NOTHING REACHES MARKETING BY ITSELF ─────────────────────────────────────────────────────
console.log("\nTime-sensitive claims")
ok("every status is representable", CLAIM_STATUSES.length === 5)
ok("ONLY verified_current is marketable", CLAIM_STATUSES.filter(isMarketable).join() === "verified_current")
const rec: PropertyResearchRecord = {
  placeId: "PLACE_A",
  stable: {},
  pricing: {
    startingPrices: { oneBed: { value: "$1,270", status: "conflicting", verifiedAt: "2026-10-14" } },
    specials: [
      { value: "8 Weeks Free", status: "conflicting", verifiedAt: "2026-10-14", appliesTo: "select units" },
      { value: "Look & Lease", status: "verified_current", verifiedAt: "2026-10-14" },
    ],
  },
  sources: [],
  unresolved: [],
}
const bad = unverifiedClaims(rec)
ok("an unverifiable price is flagged", bad.some((b) => b.claim.value === "$1,270"))
ok("a conflicting special is flagged", bad.some((b) => b.claim.value === "8 Weeks Free"))
ok("a verified special is NOT flagged", !bad.some((b) => b.claim.value === "Look & Lease"))
ok("the flag carries the claim, so a reviewer sees what would have been asserted", bad[0]?.claim.verifiedAt === "2026-10-14")
ok("qualifications survive", bad.find((b) => b.claim.value === "8 Weeks Free")?.claim.appliesTo === "select units")

// ── THE EXISTING WORKFLOW IS UNTOUCHED ──────────────────────────────────────────────────────
console.log("\nNothing existing moved")
const pr = readFileSync("components/crm/social/PropertyResearch.tsx", "utf8")
ok("THIS VIDEO fields preserved", /This Video/.test(pr))
ok("PROPERTY STARTING PRICES preserved", /Property Starting Prices/i.test(pr))
ok("the Save button is unchanged", /Save Property Research/.test(pr))
ok("the collapsible is read-only — it renders no input", !/<input/.test(readFileSync("components/crm/social/VerifiedPropertyDetails.tsx", "utf8")))
// CODE, not the comment that explains the rule — the prose says "overlay, caption" on purpose.
ok("it copies nothing into marketing fields", !/setFields|setPlan|overlay|caption|hashtag/i.test(codeOnly(readFileSync("components/crm/social/VerifiedPropertyDetails.tsx", "utf8"))))
// preparedPost must keep its home in social_content.details.
ok("details.preparedPost is untouched", /preparedPost/.test(readFileSync("app/api/admin/social-autopilot/content/[id]/route.ts", "utf8")))
// The migration READS social_content inside the agent RLS policy, which is correct and is the
// point. What it must never do is ALTER it.
ok("the new table does not ALTER social_content", !/alter\s+table\s+(public\.)?social_content/i.test(mig))
ok("…and the agent policy does read it, which is how sharing is enforced", /from public\.social_content sc/.test(mig))
ok("no render/publish/schedule column is referenced", !/render_status|rendered_storage_path|scheduled_at|published_at/.test(mig + api))
ok("the research migration exists", existsSync("supabase/migrations/20261019000000_social_property_research.sql"))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
