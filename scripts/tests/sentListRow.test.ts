// RECOMMENDED PROPERTIES — the action row, and who counts as having viewed a list.
//
// Pure and offline. Run: `npx tsx scripts/tests/sentListRow.test.ts`
// No list is sent, no view is recorded.
//
// ── THE TRACKING DISCREPANCY ────────────────────────────────────────────────────────────────
// ?preview=1 covered the CRM's Preview button and nothing else. The agent also opens the REAL
// share link — from Sent List History, from the message they just sent — and that URL carries no
// preview flag, so the beacon fired and the list was recorded as viewed BY THE CLIENT.
// Production shows it plainly: lead 91's share was created at 16:28:44 and "viewed" at 16:28:51.
// Seven seconds. No renter reads a text and opens a list in seven seconds.

import { readFileSync } from "node:fs"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

/** Assertions about CONTROL FLOW must read code, not the prose describing it — a comment that
 *  names a function is not a call to it, and anchoring on one is how a test passes for the wrong
 *  reason (or, here, fails for one). */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|\s)\/\/.*$/, "$1"))
    .join("\n")
}

const view = readFileSync("app/api/r/view/route.ts", "utf8")
const viewCode = codeOnly(view)
const row = readFileSync("components/crm/BestMatches.tsx", "utf8")
const eng = readFileSync("components/crm/RecommendationEngagement.tsx", "utf8")

// ── INTERNAL OPENS DO NOT COUNT ─────────────────────────────────────────────────────────────
console.log("\nInternal opens are not client views")
ok("the beacon route checks for a signed-in caller", /supabase\.auth\.getUser\(\)/.test(view))
ok("and only skips someone in the share's OWN workspace", /from\("workspace_members"\)[\s\S]{0,260}\.eq\("workspace_id", share\.workspace_id\)[\s\S]{0,120}\.eq\("user_id", user\.id\)/.test(view))
ok("the skip returns without recording", /if \(membership\) \{[\s\S]{0,320}return NextResponse\.json\(\{ ok: true, counted: false \}\)/.test(view))
ok("the check runs BEFORE the RPC", viewCode.indexOf("auth.getUser()") < viewCode.indexOf("lb_record_client_share_view"))
// IDENTITY, NOT TIMING. A rule based on "too soon after creation" would silently discard a fast
// genuine client, and would be unfalsifiable from the data afterwards.
ok("nothing keys on elapsed time", !/created_at[\s\S]{0,200}Date\.now\(\)/.test(view) && !/seconds|elapsed/i.test(view.split("//").map((c, i) => (i ? "" : c)).join("")))
ok("the existing ?preview=1 guard is untouched", readFileSync("app/locator-beast/r/[token]/page.tsx", "utf8").includes("<ViewBeacon token={token} disabled={isPreview} />"))

console.log("\nGenuine client views still count")
// A renter has no account, so getUser() yields nothing and the RPC runs exactly as before.
ok("an unauthenticated caller falls through to the RPC", /const \{ data, error \} = await supabase\.rpc\("lb_record_client_share_view"/.test(view))
ok("the same RPC, so sessionization and notifications are unchanged", (viewCode.match(/lb_record_client_share_view/g) || []).length === 1)
ok("a signed-in user from ANOTHER workspace is not treated as internal", /if \(membership\)/.test(view))
ok("no historical row is rewritten by this route", !/\.update\(|\.delete\(/.test(view))

// ── ONE ROW ─────────────────────────────────────────────────────────────────────────────────
console.log("\nOne horizontal row")
const block = row.slice(row.indexOf("Recommendation actions"), row.indexOf("</SectionCard>"))
const blockCode = codeOnly(block)
ok("a single flex row, vertically centred", /className="mt-3 flex items-center gap-2 border-t/.test(block))
ok("order: Sent List History, engagement, divider, Send List", (() => {
  const a = blockCode.indexOf("Sent List History")
  const b = blockCode.indexOf("RecommendationEngagement")
  const c = blockCode.indexOf("h-5 w-px")
  const d = blockCode.lastIndexOf("Send List")
  return a > -1 && b > a && c > b && d > c
})())
ok("a subtle vertical divider, not a horizontal one", /h-5 w-px flex-none bg-\[var\(--crm-border-soft\)\]/.test(block))
ok("the divider is decorative", /<span aria-hidden className="ml-auto h-5 w-px/.test(block))
ok("both buttons keep their existing styles", /border border-\[var\(--crm-border\)\]/.test(block) && /bg-\[var\(--crm-accent\)\]/.test(block))
ok("neither button is allowed to wrap or shrink", (block.match(/flex-none/g) || []).length >= 2 && (block.match(/whitespace-nowrap/g) || []).length === 2)
ok("Send List no longer stretches across the row", !/inline-flex flex-1 items-center justify-center gap-1\.5 rounded-lg bg-\[var\(--crm-accent\)\]/.test(block))
ok("no second row and no added height", !/\bmt-2\b|\bflex-col\b|\bflex-wrap\b/.test(block))

console.log("\nIt survives a narrow panel")
ok("the engagement text truncates instead of pushing the button off", /min-w-0 flex-1 truncate/.test(eng))
ok("it is one line — no wrapping", /leading-none/.test(eng) && /truncate/.test(eng))
ok("the full text stays available on hover", /title=\{views > 0 && last \? `Viewed \$\{views\}× · Last viewed \$\{ago\(last\)\}`/.test(eng))

// ── THE ROW AGREES WITH THE HISTORY ─────────────────────────────────────────────────────────
console.log("\nHistory and engagement agree")
ok("both read the one existing endpoint", eng.includes("/api/admin/client-shares?leadId=") && !/\/api\/(?!admin\/client-shares)/.test(eng))
ok("no sent list ⇒ no engagement summary at all", /if \(rows\.length === 0\) return null/.test(eng))
ok("counts are summed across the client's lists", /rows\.reduce\(\(n, r\) => n \+ \(r\.viewSessionCount \?\? 0\), 0\)/.test(eng))
ok("last viewed is the most recent across them", /\.sort\(\)\s*\n\s*\.pop\(\)/.test(eng))
ok("the inline variant shows the SAME numbers as the block one", /const body =\s*\n\s*views > 0 && last \?/.test(eng))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
