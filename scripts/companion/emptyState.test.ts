// Beast Sync empty state — "not connected" and "no messages" are DIFFERENT causes.
//
// The old UI showed one sentence for both: "No text messages found for {name} yet."
// That reads as a claim about the CLIENT, when the usual situation is that Beast Sync
// has never been paired — so no message from anyone could have been found. Measured
// 2026-10-01: device_tokens = 0, companion_messages = 0, yet the card blamed Ka'Leah.
//
// Run: npx tsx scripts/companion/emptyState.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}${d ? ` — ${d}` : ""}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const route = strip(read("app/api/ai-insights/sync/route.ts"))
const ui = strip(read("components/crm/LeadInsights.tsx"))

console.log("THE ROUTE SEPARATES THE TWO CAUSES:")
ok("it only classifies the 'no messages found' outcome", /\/\^no messages found\/i\.test\(message\.trim\(\)\)/.test(route))
ok("it checks device_tokens to decide which cause it was", /\.from\("device_tokens"\)/.test(route))
ok("…ignoring revoked devices", /\.is\("revoked_at", null\)/.test(route))
ok("…and only needs to know whether ANY exists", /\.limit\(1\)/.test(route))
ok("it returns a STABLE MACHINE CODE, not prose, for the UI to branch on",
  /reason: notConnected \? "not_connected" : "no_messages"/.test(route))

console.log("\nWORKSPACE ISOLATION — the caller's own session, never the service role:")
// device_tokens carries a "members read device_tokens" RLS policy scoped by
// is_active_workspace_member, so the session client can only ever see this
// workspace's devices. Using supabaseAdmin here would have leaked another
// workspace's pairing state into this workspace's empty state.
{
  const block = route.slice(route.indexOf("no messages found"), route.indexOf("return NextResponse.json({ error: message }, { status })"))
  ok("the device check uses the guarded session client", /await supabase\s*\n?\s*\.from\("device_tokens"\)/.test(block))
  ok("it does NOT use the service role", !/supabaseAdmin/.test(block))
  ok("the whole route never imports the admin client", !/supabase\/admin/.test(route))
}

console.log("\nTHE RAW BACKEND STRING IS STILL SUPPRESSED:")
ok("the UI never renders json.error for this case", (() => {
  // The only place error text reaches the DOM is the syncError path, and the
  // not-connected / no-messages branch must not feed it.
  const branch = ui.slice(ui.indexOf("no messages found"), ui.indexOf("} else {"))
  return !/setSyncError/.test(branch)
})())
ok("the copy is a literal, not interpolated from the server",
  /"Beast Sync isn't connected yet\. Connect Beast Sync on your Mac to sync Messages\."/.test(ui))
ok("no internal lead id or 'Mac Companion' appears in any user-facing string",
  !/Mac Companion/.test(ui) && !/for lead \$\{/.test(ui))

console.log("\nSTATE 1 — NO DEVICE PAIRED:")
ok("the UI tracks the cause separately", /const \[notConnected, setNotConnected\] = useState\(false\)/.test(ui))
ok("it is set from the route's machine code",
  /setNotConnected\(json\?\.reason === "not_connected" \|\| json\?\.notConnected === true\)/.test(ui))
ok("…and takes priority over the per-client sentence", (() => {
  const i = ui.indexOf("if (notConnected) {")
  const j = ui.indexOf("No text messages found for ${who} yet.`")
  return i > 0 && j > 0 && i < j
})())
ok("its copy names BEAST SYNC, never the client",
  /Beast Sync isn't connected yet/.test(ui))
ok("…and offers the next step", /Connect Beast Sync on your Mac to sync Messages/.test(ui))

console.log("\nSTATE 2 — PAIRED, BUT THIS CLIENT HAS NO MESSAGES:")
ok("the per-client sentence still exists", /No text messages found for \$\{who\} yet\./.test(ui))
ok("…and still falls back to the Sync prompt when nothing has run yet",
  /Click Sync to check for messages/.test(ui))
// BOTH reset sites, not just the one in the sync handler. The lead-change effect
// resets state when the selected lead changes; missing it there meant a lead that
// showed "Beast Sync isn't connected yet" carried that copy to the NEXT lead before
// any sync had run. Counting occurrences is what catches a forgotten site.
ok("notConnected is cleared everywhere noMessages is cleared",
  (ui.match(/setNoMessages\(false\)/g) ?? []).length === (ui.match(/setNotConnected\(false\)/g) ?? []).length,
  `${(ui.match(/setNoMessages\(false\)/g) ?? []).length} vs ${(ui.match(/setNotConnected\(false\)/g) ?? []).length}`)
ok("…including the lead-change effect, so the cause never leaks between leads", (() => {
  const eff = ui.slice(ui.indexOf("setOpen(false)"), ui.indexOf("loadBrief()", ui.indexOf("setOpen(false)")))
  return /setNoMessages\(false\)/.test(eff) && /setNotConnected\(false\)/.test(eff)
})())

console.log("\nTHE STATES ARE INDEPENDENT (neither implies the other):")
// notConnected is only ever set INSIDE the no-messages branch, so "connected but
// no messages" cannot accidentally render the not-connected copy, and a genuine
// transport/network failure still takes the visible error path.
// Set TRUE in exactly one place — inside the no-messages branch. (The two
// setNotConnected(false) resets are asserted separately above.)
ok("notConnected is set TRUE in exactly one place, inside the no-messages branch",
  (ui.match(/setNotConnected\((?!false\))/g) ?? []).length === 1,
  `${(ui.match(/setNotConnected\((?!false\))/g) ?? []).length} setter(s)`)
ok("a non-'no messages' failure still uses the visible error path", /setSyncError\(json\?\.error \?\? "Sync failed"\)/.test(ui))
ok("a network throw still uses the visible error path", /setSyncError\("Network error/.test(ui))

console.log("\nNOTHING ELSE CHANGED:")
ok("ingestion was not touched", !/companion_messages/.test(route))
ok("extraction was not touched", !/extract|generateAiInsights/.test(route))
ok("syncAiInsights is still the only generator called", (route.match(/syncAiInsights\(/g) ?? []).length === 1)
ok("the ownership 404 guard is intact", /if \(!ownedLead\)/.test(route))
ok("auth + membership guard is intact", /requireWorkspaceMember\(\)/.test(route))

console.log(`\nBeast Sync empty state: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
