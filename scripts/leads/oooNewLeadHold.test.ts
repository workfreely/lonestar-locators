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
        created_at: ago(30 * MIN), ooo_held_at: null, ooo_released_at: null,
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
    // The call gained an options argument on 2026-10-12 (a test-only `spacingMs` seam, undefined in
    // production). What matters here is unchanged and is what this now asserts: the ONLY place that
    // schedules the next step is advanceRun, and there is exactly one such call site.
    ok("t2 is scheduled only from advanceRun, after a send is acknowledged",
      /nextStepEligibility\(seq, justSent, sentAtIso/.test(engine)
      && (engine.match(/nextStepEligibility\(/g) ?? []).length === 1)
    ok("…and advanceRun is reached only via an ACK", /if \(intent\.run_id\) await advanceRun/.test(engine))
    // Belt and braces: even if the stamp were cleared, the 6h window blocks a
    // back-filled opening pair for a lead created days earlier.
    ok("a stale lead can never be back-filled into the opening pair",
      /now\.getTime\(\) - createdAt > NEW_LEAD_ENROLL_WINDOW_MS\) return null/.test(engine))
  }

  console.log("\nMANUAL START FOLLOW-UP — copy variant (new_lead/t1 only):")
  {
    const { resolveStepBody } = await import("@/lib/followup/sequences")
    const snap = (over: Record<string, unknown> = {}) =>
      ({ id: 1, firstName: "Bonita", agentFirstName: "Jay", beds: "1", propertyType: null,
         moveDate: "2026-11-01", moveMonthLabel: "November", crmStatus: "new", smsOptIn: true,
         heldAt: null, oooReleasedAt: null, accountAuthorized: true, followupOptIn: true,
         appliedAt: null, timeZone: "America/Chicago", ...over }) as never
    const share = {} as never

    const normalT1 = resolveStepBody("new_lead" as never, "t1", snap(), share)
    const oooT1 = resolveStepBody("new_lead" as never, "t1", snap({ oooReleasedAt: "2026-10-03T16:00:00Z" }), share)
    const normalT2 = resolveStepBody("new_lead" as never, "t2", snap(), share)
    const oooT2 = resolveStepBody("new_lead" as never, "t2", snap({ oooReleasedAt: "2026-10-03T16:00:00Z" }), share)

    ok("the NORMAL new-lead Text 1 is unchanged",
      normalT1 === "Hey Bonita it's Jay! I got your form for a 1 bedroom move in November.",
      JSON.stringify(normalT1))
    ok("an OOO-restarted lead gets the OOO Text 1 instead",
      oooT1 === "Hey Bonita, it's Jay! I'm back in the office and following up on your apartment request.",
      JSON.stringify(oooT1))
    ok("…and never says \"I got your form\"", !/I got your form/.test(oooT1))
    ok("Text 2 is the SAME location question either way",
      normalT2 === oooT2 && normalT2 === "Are you trying to stay near a specific address or side of town?",
      JSON.stringify({ normalT2, oooT2 }))
    // The variant must not leak into the chase steps.
    for (const step of ["contact_fu1", "contact_fu2", "contact_fu3"]) {
      const a = resolveStepBody("new_lead" as never, step, snap(), share)
      const b = resolveStepBody("new_lead" as never, step, snap({ oooReleasedAt: "2026-10-03T16:00:00Z" }), share)
      ok(`${step} is identical with and without the OOO stamp`, a === b)
    }
    // And not into another family.
    const ls = resolveStepBody("list_sent" as never, "fu1", snap(), share)
    const lsOoo = resolveStepBody("list_sent" as never, "fu1", snap({ oooReleasedAt: "2026-10-03T16:00:00Z" }), share)
    ok("list_sent copy is unaffected by the OOO stamp", ls === lsOoo)
  }

  console.log("\nTHE START FOLLOW-UP ENDPOINT:")
  {
    const route = strip(read("app/api/admin/leads/start-ooo-followup/route.ts"))
    ok("it is authenticated", /requireWorkspaceMember\(\)/.test(route))
    ok("ownership is checked with the CALLER'S session, not the service role",
      /guard\.supabase[\s\S]{0,120}\.from\("leads"\)/.test(route))
    ok("it requires ooo_held_at", /if \(!lead\.ooo_held_at\)/.test(route))
    ok("it requires crm_status = new", /!== "new"/.test(route))
    ok("an already-released lead is a NO-OP success", /if \(lead\.ooo_released_at\)[\s\S]{0,160}alreadyStarted: true/.test(route))
    // Must branch on the query RESULT, not merely contain the query: replacing
    // `if (active)` with `if (false)` leaves the surrounding text intact.
    ok("an existing active lifecycle run is a NO-OP success",
      /\.in\("status", \["waiting", "due"\]\)[\s\S]{0,200}alreadyStarted: true/.test(route) &&
      /if \(active\) \{[\s\S]{0,160}alreadyStarted: true/.test(route))
    ok("it creates exactly ONE run", (route.match(/\.from\("lead_followup_runs"\)[\s\S]{0,40}\.insert/g) ?? []).length === 1)
    ok("…as new_lead / t1 / step 0, eligible now",
      /sequence_key: "new_lead"[\s\S]{0,120}step_key: "t1"[\s\S]{0,80}step_index: 0/.test(route) &&
      /next_eligible_at: nowIso/.test(route))
    ok("…with session_date null so the one-active-lifecycle index applies", /session_date: null/.test(route))
    ok("a unique-violation race is treated as success, not an error", /23505/.test(route))
    // Anchor on the INSERT, not on `.from("lead_followup_runs")` — that string also
    // appears in the active-run SELECT above, which made this vacuously true.
    ok("the run is inserted BEFORE the stamp",
      route.indexOf('.from("lead_followup_runs").insert(') >= 0 &&
      route.indexOf('.from("lead_followup_runs").insert(') < route.indexOf("ooo_released_at: nowIso"),
      "a stamp written first would leave a lead that looks started with no run")
    {
      // Scoped to the UPDATE/INSERT payloads. ooo_held_at and crm_status legitimately
      // appear in the select list, the row type and the precondition checks; what
      // must never happen is either of them being WRITTEN.
      const writes = [...route.matchAll(/\.(update|insert)\(([\s\S]{0,400}?)\)\s*\n/g)].map((m) => m[2]).join("\n")
      ok("ooo_held_at is NEVER written", !/ooo_held_at/.test(writes), writes.slice(0, 200))
      ok("crm_status is never written", !/crm_status/.test(writes))
      ok("…and the only lead column written is ooo_released_at",
        /ooo_released_at: nowIso/.test(writes))
    }
    ok("no other sequence family is referenced",
      !/list_sent|done_selecting|application_status|resume_search|post_tour/.test(route))
  }

  console.log("\nLEAD CARD — badge and action visibility:")
  {
    const card = strip(read("components/crm/LeadCard.tsx"))
    const ctrl = strip(read("components/crm/OooFollowUpControls.tsx"))

    // The two conditions, read off the component rather than re-implemented here.
    ok("the badge shows for an OOO lead that is still New",
      /const isOooLead = !!lead\.ooo_held_at && String\(lead\.crm_status \?\? ""\)\.toLowerCase\(\) === "new"/.test(card))
    ok("the ACTION additionally requires not-yet-released",
      /const canStartOoo = isOooLead && !lead\.ooo_released_at/.test(card))
    // 1. a normal lead shows neither
    ok("a normal New lead shows neither (both conditions start from ooo_held_at)",
      /isOooLead = !!lead\.ooo_held_at/.test(card))
    // 3. released keeps the badge, loses the button
    ok("a RELEASED lead keeps the badge (badge ignores ooo_released_at)",
      !/const isOooLead =[^\n]*ooo_released_at/.test(card))
    ok("…and loses the button", /canStartOoo[^\n]*!lead\.ooo_released_at/.test(card))
    // 4. a non-New historical OOO lead shows no action
    ok("a non-New OOO lead shows no action (crm_status gates isOooLead)",
      /isOooLead[^\n]*crm_status/.test(card))
    ok("the badge renders on its own line, like the archive badge",
      /function oooLine\(\)[\s\S]{0,200}kb-pill kb-pill--neutral">OOO Lead/.test(card))
    ok("the action renders only when canStartOoo AND a handler is present",
      /\{canStartOoo && onStartOooFollowUp && \([\s\S]{0,160}OooFollowUpControls/.test(card))

    // 5/6/7 — in-flight and failure behaviour.
    ok("the button calls the authenticated endpoint",
      /fetch\("\/api\/admin\/leads\/start-ooo-followup"/.test(ctrl) && /method: "POST"/.test(ctrl))
    ok("…exactly once per click (guarded while busy)", /if \(state === "busy"\) return/.test(ctrl))
    ok("…and the button is disabled in flight", /disabled=\{state === "busy"\}/.test(ctrl))
    // A failure must not hide the button: the only non-idle terminal state is
    // "error", and the button's disabled condition names "busy" alone, so the
    // control is still clickable after a failed attempt.
    ok("a FAILED request leaves the action available (no optimistic hide)",
      /catch \{[\s\S]{0,60}setState\("error"\)/.test(ctrl)
      && /disabled=\{state === "busy"\}/.test(ctrl)
      && !/disabled=\{[^}]*"error"/.test(ctrl))
    {
      // Ordering only means something if BOTH anchors exist — a missing anchor
      // would otherwise make indexOf return -1 and pass vacuously.
      const guard = ctrl.indexOf("if (!res.ok) throw")
      const told = ctrl.indexOf("onStarted?.(leadId)")
      ok("…the parent is told ONLY after the API confirms",
        guard >= 0 && told >= 0 && guard < told)
    }
    ok("…and an error is surfaced to the locator", /kb-ooo-err/.test(ctrl))
    ok("clicks never open the card underneath", /e\.stopPropagation\(\)/.test(ctrl))

    // Isolation from Hold Resume.
    ok("it is a SEPARATE component from HoldControls",
      !/HoldControls/.test(ctrl) && /OooFollowUpControls/.test(card))
    ok("…rendered in its own block, not inside the hold block",
      card.indexOf("canStartOoo && onStartOooFollowUp") < card.indexOf("onHold && (onResumeHold"))
    const dash = strip(read("components/crm/DashboardClient.tsx"))
    ok("the handler is separate from handleResumeLead",
      /function handleStartOooFollowUp/.test(dash) && /function handleResumeLead/.test(dash))
    ok("…and only marks the lead released locally (the server did the work)",
      /handleStartOooFollowUp[\s\S]{0,400}ooo_released_at: releasedAt/.test(dash))
    ok("…never writing ooo_held_at or crm_status",
      !/handleStartOooFollowUp[\s\S]{0,400}(ooo_held_at|crm_status)/.test(dash))
    ok("…and never calling the hold endpoints",
      !/handleStartOooFollowUp[\s\S]{0,400}(buildResumeUpdate|hold_follow_up_at)/.test(dash))
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
      /id, first_name, phone, beds, property_type, move_date, crm_status, sms_opt_in, held_at, followup_opt_in, followup_enrolled_at, applied_at, created_at, ooo_held_at, ooo_released_at, owner_user_id, workspace_id/.test(snapshot))
  }


}
main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
})
