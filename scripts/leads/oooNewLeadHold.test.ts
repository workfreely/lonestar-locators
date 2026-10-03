/**
 * OUT OF OFFICE — a lead that arrived while the locator was away is held out of
 * the New Lead opening pair, and NOTHING else changes.
 *
 * The risk this guards is asymmetric. Suppressing too little sends a client "I got
 * your form!" from someone who is not there. Suppressing too much silently stops
 * outreach for ordinary leads — far worse, and invisible until someone notices
 * nobody was contacted. So most of this file asserts the NEGATIVE: that leads with
 * ooo_held_at = null, and every other sequence family, behave exactly as before.
 *
 * Run: npx tsx scripts/leads/oooNewLeadHold.test.ts
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { enrollLifecycleRuns } from "@/lib/followup/engine"
import { InMemoryFollowupStore, type SeedLead } from "@/lib/followup/sim/inMemoryStore"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

async function main() {
  console.log("\nOUT OF OFFICE — NEW LEAD HOLD\n")

  console.log("THE GUARD IS WHERE IT SHOULD BE:")
  {
    const engine = strip(read("lib/followup/engine.ts"))
    const seedStart = engine.indexOf('case "new_lead": {')
    const seedEnd = engine.indexOf('case "list_sent":', seedStart)
    const newLeadBranch = seedStart >= 0 && seedEnd > seedStart ? engine.slice(seedStart, seedEnd) : ""

    ok("the new_lead seed branch was located", newLeadBranch.length > 0)
    ok("it holds on the lead's OWN stamp", /if \(row\.ooo_held_at\) return null/.test(newLeadBranch))
    ok("…returning null — the SAME path the staleness guard uses, so no run is created",
      /return null/.test(newLeadBranch))
    // The guard must read the LEAD, never the workspace's current state: otherwise
    // toggling OOO off would retroactively change old leads.
    ok("it never consults the workspace's current OOO state",
      !/out_of_office_enabled/.test(engine))
    ok("…and the hold is checked BEFORE the t1 seed is built",
      newLeadBranch.indexOf("ooo_held_at") < newLeadBranch.indexOf('step_key: "t1"'))

    // SCOPE: no other sequence family may consult it.
    for (const other of ["list_sent", "done_selecting", "application_status"]) {
      const i = engine.indexOf(`case "${other}":`)
      const j = engine.indexOf("case ", i + 6)
      const branch = i >= 0 ? engine.slice(i, j > i ? j : i + 400) : ""
      ok(`the ${other} branch does NOT reference ooo_held_at`, !/ooo_held_at/.test(branch))
    }
    ok("ooo_held_at appears EXACTLY once in the engine",
      (engine.match(/ooo_held_at/g) ?? []).length === 1,
      `found ${(engine.match(/ooo_held_at/g) ?? []).length}`)
  }

  console.log("\nBEHAVIOUR, through the real engine (the important half):")
  {
    const NOW = new Date("2026-10-03T16:00:00Z")
    const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
    const MIN = 60_000

    const seed = (over: Partial<SeedLead> = {}): SeedLead =>
      ({
        id: 1, first_name: "Sarah", phone: "(210) 555-1234", beds: "1", property_type: null,
        move_date: "2026-11-01", crm_status: "new", sms_opt_in: true, held_at: null,
        followup_opt_in: true, followup_enrolled_at: ago(60 * MIN), applied_at: null,
        created_at: ago(30 * MIN), ooo_held_at: null,
        owner_user_id: "owner-1", workspace_id: "ws-1",
        agentFirstName: "Jay", timeZone: "America/Chicago", accountAuthorized: true,
        ...(over as object),
      }) as SeedLead

    const enroll = async (lead: SeedLead) => {
      const st = new InMemoryFollowupStore(() => NOW)
      st.putLead(lead)
      const n = await enrollLifecycleRuns(st, NOW)
      return { n, runs: [...st.runs.values()] }
    }

    // THE REGRESSION THAT MATTERS: an ordinary lead must still seed t1.
    {
      const { n, runs } = await enroll(seed())
      ok("a NORMAL lead still enrols exactly one run", n === 1 && runs.length === 1)
      ok("…into new_lead at step t1, unchanged",
        runs[0]?.sequence_key === "new_lead" && runs[0]?.step_key === "t1",
        JSON.stringify({ seq: runs[0]?.sequence_key, step: runs[0]?.step_key }))
    }
    // The hold.
    {
      const { n, runs } = await enroll(seed({ ooo_held_at: ago(5 * MIN) } as Partial<SeedLead>))
      ok("an OOO-stamped lead enrols NOTHING", n === 0 && runs.length === 0,
        JSON.stringify(runs.map((r) => ({ seq: r.sequence_key, step: r.step_key }))))
      ok("…so no run exists to produce t1, and therefore none to advance to t2", runs.length === 0)
    }
    // Scope: the hold must not leak into another family.
    {
      const { n, runs } = await enroll(seed({ ooo_held_at: ago(5 * MIN), applied_at: ago(4 * 24 * 60 * MIN) } as Partial<SeedLead>))
      ok("an OOO-stamped lead with an application STILL enrols application_status",
        n === 1 && runs[0]?.sequence_key === "application_status",
        JSON.stringify({ n, seq: runs[0]?.sequence_key }))
      ok("…proving the hold is scoped to new_lead only", runs[0]?.step_key === "ask")
    }
  }

  console.log("\nTHE STAMP IS WRITTEN ONLY AT CREATION, ONLY WHEN AWAY:")
  {
    const submit = strip(read("app/api/leads/submit/route.ts"))
    ok("the submit route reads the workspace's OOO flag",
      /\.from\("workspaces"\)\s*\.select\("out_of_office_enabled"\)/.test(submit))
    ok("…scoped to THIS lead's workspace", /\.eq\("id", wsId\)/.test(submit))
    ok("…and stamps a timestamp only when enabled",
      /out_of_office_enabled\) \{[\s\S]{0,120}oooHeldAt = new Date\(\)\.toISOString\(\)/.test(submit))
    ok("the field is OMITTED entirely when not OOO (a normal row is byte-identical)",
      /\.\.\.\(oooHeldAt \? \{ ooo_held_at: oooHeldAt \} : \{\}\)/.test(submit))
    ok("a failed OOO check cannot fail lead creation",
      /try \{[\s\S]{0,400}out_of_office_enabled[\s\S]{0,400}\} catch/.test(submit))
    ok("nothing ever clears the stamp (it is history, not a latch)",
      !/ooo_held_at: null/.test(submit) && !/ooo_held_at = null/.test(strip(read("lib/followup/engine.ts"))))
  }

  console.log("\nNO SECOND TEXT CAN ESCAPE LATER:")
  {
    const engine = strip(read("lib/followup/engine.ts"))
    // t2 is only ever scheduled by advanceRun after t1 is ACKed; with no run at all
    // there is nothing to advance.
    ok("t2 is scheduled only from advanceRun, after a send is acknowledged",
      /nextStepEligibility\(seq, justSent, sentAtIso\)/.test(engine))
    ok("…and advanceRun is reached only via an ACK", /if \(intent\.run_id\) await advanceRun/.test(engine))
    // Belt and braces: even if the stamp were cleared, the 6h window blocks a
    // back-filled opening pair for a lead created days earlier.
    ok("a stale lead can never be back-filled into the opening pair",
      /now\.getTime\(\) - createdAt > NEW_LEAD_ENROLL_WINDOW_MS\) return null/.test(engine))
  }

  console.log("\nUNTOUCHED SYSTEMS:")
  {
    const engine = strip(read("lib/followup/engine.ts"))
    for (const forbidden of ["share.status", "/api/r/resume", "PausedResumeCard", "companion_messages", "criteria"]) {
      ok(`the engine change references no ${forbidden}`, !new RegExp(forbidden.replace(/[/.]/g, "\\$&")).test(engine))
    }
    const snapshot = strip(read("lib/followup/snapshot.ts"))
    ok("LEAD_COLUMNS selects the new column so the guard can see it",
      /ooo_held_at/.test(snapshot))
    ok("…and no other lead field was added or removed",
      /id, first_name, phone, beds, property_type, move_date, crm_status, sms_opt_in, held_at, followup_opt_in, followup_enrolled_at, applied_at, created_at, ooo_held_at, owner_user_id, workspace_id/.test(snapshot))
  }


}
main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
})
