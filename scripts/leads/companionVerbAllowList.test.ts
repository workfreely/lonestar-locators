/**
 * COMPANION → CRM VERB BRIDGE — every handled verb must survive the allow-list.
 *
 * The bug this exists to prevent already shipped. `onVerb` in DashboardClient
 * gates incoming messages through a chain of `payload.verb !== "x" && …` tests
 * and returns early on anything unlisted. "automated-texting" had a full handler
 * — it POSTs to /api/leads/[id]/automated-texting — but was never added to that
 * chain, so the Companion's Automated Texts toggle posted a verb that was dropped
 * one step before its handler. No error, no log, no enrollment: the switch moved
 * and nothing happened.
 *
 * That failure is invisible by construction, which is why it survived review: the
 * handler reads as live code, and the gate reads as a list of things someone
 * clearly maintained. Nothing connects them except this test.
 *
 * So the check is structural rather than example-based: extract EVERY verb the
 * file handles, extract EVERY verb the gate admits, and require the first set to
 * be a subset of the second. A new handler added without a gate entry fails here
 * the moment it is written.
 *
 * Run: npx tsx scripts/leads/companionVerbAllowList.test.ts
 */
import { readFileSync } from "node:fs"
import path from "node:path"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

async function main() {
  console.log("\nCOMPANION VERB ALLOW-LIST\n")

  const dash = read("components/crm/DashboardClient.tsx")

  // The gate: every `payload.verb !== "x"` inside onVerb's early-return chain.
  const admitted = new Set(
    [...dash.matchAll(/payload\.verb !== "([a-z0-9-]+)"/g)].map((m) => m[1]!),
  )
  // The handlers: every `payload.verb === "x"` anywhere in the file.
  const handled = new Set(
    [...dash.matchAll(/payload\.verb === "([a-z0-9-]+)"/g)].map((m) => m[1]!),
  )

  console.log("THE SETS ARE NON-TRIVIAL (guards against a vacuous pass):")
  {
    ok(`the gate admits several verbs (found ${admitted.size})`, admitted.size >= 20)
    ok(`handlers exist for several verbs (found ${handled.size})`, handled.size >= 10)
  }

  console.log("\nEVERY HANDLED VERB IS ADMITTED BY THE GATE:")
  {
    const unreachable = [...handled].filter((v) => !admitted.has(v))
    ok("no handled verb is dropped before its handler", unreachable.length === 0,
      `UNREACHABLE: ${JSON.stringify(unreachable)}`)
    // Name the regression explicitly so a future reader sees what broke.
    ok("…specifically, 'automated-texting' reaches its handler",
      admitted.has("automated-texting") && handled.has("automated-texting"))
  }

  console.log("\nTHE COMPANION REALLY POSTS THAT VERB (the other end of the wire):")
  {
    const panel = read("apps/beast-companion/src/sidepanel/ProductionPanel.tsx")
    ok("the panel posts verb 'automated-texting'", /verb: "automated-texting"/.test(panel))
    ok("…via the lb-workflow-verb storage key the bridge relays",
      /"lb-workflow-verb"[\s\S]{0,400}verb: "automated-texting"/.test(panel))
    const menu = read("apps/beast-companion/src/sidepanel/menu/CompanionMenu.tsx")
    ok("the hamburger exposes the toggle that triggers it",
      /onToggleAutomatedTexts\?\.\(!automatedTexting\.enrolled\)/.test(menu))
  }

  console.log("\nTHE HANDLER'S BEHAVIOUR IS UNCHANGED (this fix is the gate only):")
  {
    ok("it still POSTs to the authoritative enrollment route",
      /fetch\(`\/api\/leads\/\$\{lead\.id\}\/automated-texting`/.test(dash))
    ok("…with the enabled flag from the payload",
      /const enabled = \(payload as \{ enabled\?: unknown \}\)\.enabled === true/.test(dash))
    ok("…and only mirrors followup_opt_in locally on success",
      /if \(res\.ok\)[\s\S]{0,160}followup_opt_in: enabled/.test(dash))
    ok("it still sends NOTHING itself (enrollment only, never a message)",
      !/\/api\/followup\/send|sendMessage|outbound/.test(
        dash.slice(dash.indexOf('payload.verb === "automated-texting"'),
                   dash.indexOf('payload.verb === "automated-texting"') + 900)))
  }

  console.log(`\n${pass} passed, ${fail} failed\n`)
  if (fail > 0) process.exit(1)
}

void main()
