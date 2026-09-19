// Dry-run verification-path guarantees:
//  1) the dry-run and the real publish build the outgoing caption/hashtags payload from the SAME
//     single source of truth (buildInstagramCaptionPayload), so they can never drift;
//  2) the dry-run path is FAIL-CLOSED: no callable path to createReelContainer / publishReelContainer /
//     media_publish / getContainerStatus (it doesn't even import lib/social/instagram).
// Run: npx tsx scripts/social/dryRun.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { buildInstagramCaptionPayload, buildCaption, publishCaption, composeFinalCaption, type SourceMeta } from "@/lib/social/composePost"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8")
// Strip block comments + whole-line `//` comments so we test the actual CODE, not documentation
// (the dry-run files intentionally NAME the forbidden publishing APIs in their hard-boundary docs).
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")

const PUBLISH_ROUTE = "app/api/admin/social-autopilot/posts/[id]/publish/route.ts"
const DRYRUN_ROUTE = "app/api/admin/social-autopilot/posts/[id]/dry-run/route.ts"
const DRYRUN_LIB = "lib/social/dryRun.ts"

// ── 1) SAME SOURCE OF TRUTH — payload equivalence ──
const SEED = "d4c090e0-a9ae-4d43-800a-39310701c767"
const meta: SourceMeta = { market: "San Antonio", propertyType: null, special: null, socialSpecial: null, budgetRange: null, amenities: "yard, garage, pool" }
const HASHTAGS = ["#sanantonioapartments", "#satxapartments"]
const OLD_STORED = "Moving to San Antonio? You need to see this one.\n🏡 yard, garage, pool\nMy apartment locating service is completely free!\nSubmit the form to get your free custom apartment list."
const dbInput = { caption: OLD_STORED, hashtags: HASHTAGS, socialSpecial: null, sourceContentId: SEED, source: { market: "San Antonio", property_type: null, special: null, budget_range: null, amenities: "yard, garage, pool" } }

console.log("payload source of truth (buildInstagramCaptionPayload):")
ok("equals composeFinalCaption(publishCaption(...))", buildInstagramCaptionPayload(dbInput) === composeFinalCaption(publishCaption(OLD_STORED, meta, SEED), HASHTAGS))
ok("regenerates a generator-owned caption to canonical bullets", buildInstagramCaptionPayload(dbInput) === composeFinalCaption(buildCaption(meta, SEED), HASHTAGS))
ok("payload has 🏡 Amenities + bullets + hashtags", (() => { const p = buildInstagramCaptionPayload(dbInput); return p.includes("🏡 Amenities\n• yard\n• garage\n• pool") && p.endsWith("#sanantonioapartments #satxapartments") })())
ok("a MANUAL caption is published verbatim", buildInstagramCaptionPayload({ ...dbInput, caption: "Custom manual caption!" }) === composeFinalCaption("Custom manual caption!", HASHTAGS))

console.log("\nboth the real publish and the dry-run use the SAME payload function:")
const pub = read(PUBLISH_ROUTE), dl = read(DRYRUN_LIB), dr = read(DRYRUN_ROUTE)
ok("publish route builds payload via buildInstagramCaptionPayload", /buildInstagramCaptionPayload/.test(pub))
ok("dry-run core builds payload via buildInstagramCaptionPayload", /buildInstagramCaptionPayload/.test(dl))

// ── 2) FAIL-CLOSED — dry-run has NO callable path to publishing ──
const PUBLISH_APIS = /createReelContainer|publishReelContainer|media_publish|getContainerStatus/
console.log("\ndry-run is fail-closed (no callable publishing path):")
ok("dry-run CORE code calls no publishing API", !PUBLISH_APIS.test(codeOnly(dl)))
ok("dry-run ROUTE code calls no publishing API", !PUBLISH_APIS.test(codeOnly(dr)))
ok("dry-run CORE does not import lib/social/instagram", !/from ["']@\/lib\/social\/instagram["']/.test(dl))
ok("dry-run ROUTE does not import lib/social/instagram", !/from ["']@\/lib\/social\/instagram["']/.test(dr))
ok("dry-run ROUTE imports ONLY the dry-run core for its logic", /from ["']@\/lib\/social\/dryRun["']/.test(dr))
// Contrast (sanity): the REAL publish path CAN publish — proves the distinction is real, not vacuous.
ok("publish route DOES call createReelContainer in code (production can publish)", /createReelContainer/.test(codeOnly(pub)))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
