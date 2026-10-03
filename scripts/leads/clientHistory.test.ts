/**
 * CLIENT HISTORY — structured history of the five tracked search criteria.
 *
 * The rules this protects, in the order they matter:
 *
 *   1. ONE event per meaningful update, never one per field. "within 20 minutes of
 *      Lackland AFB" moves the destination AND the maximum, and it is one thing the
 *      client said, so it is one chronological entry carrying both changes.
 *   2. It is narrow. Exactly five criteria; an edit to anything else records
 *      nothing. This is not generic CRM audit logging.
 *   3. It never invents. Blank form answers are omitted, and leads created before
 *      this shipped start empty rather than being reconstructed — their original
 *      submissions were never preserved.
 *   4. It never breaks a save. History is recorded after a successful write and is
 *      fire-and-forget on both paths.
 *   5. Current criteria stay the source of truth for matching; this is display
 *      only and never feeds searchCriteria.
 *
 * Run: npx tsx scripts/leads/clientHistory.test.ts
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  diffCriteria,
  initialCriteria,
  criteriaChangedMetadata,
  normalizedValue,
  displayValue,
  TRACKED_CRITERIA,
  SOURCE_LABELS,
} from "@/lib/leads/criteriaHistory"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const LEAD = {
  id: 84,
  neighborhoods: "Downtown San Antonio, Westover Hills",
  desired_rent: "$1,600",
  move_date: "2026-12-10",
  commute_anchor_label: "",
  commute_max_minutes: null,
  notes: "unrelated",
  crm_status: "New",
}

console.log("\nCLIENT HISTORY\n")

console.log("SCOPE — exactly five criteria, deliberately closed:")
{
  ok("the tracked set is the five agreed criteria",
    JSON.stringify(TRACKED_CRITERIA) ===
      JSON.stringify(["desired_areas", "commute_destination", "max_drive", "budget", "move_date"]),
    `got ${JSON.stringify(TRACKED_CRITERIA)}`)
  ok("the three sources are named", Object.keys(SOURCE_LABELS).join(",") === "form,edit_client,conversation")
}

console.log("\n1. A NEW FORM seeds the criteria actually supplied:")
{
  const changes = initialCriteria(LEAD)
  const fields = changes.map((c) => c.field)
  ok("records the supplied criteria", fields.includes("desired_areas") && fields.includes("budget") && fields.includes("move_date"))
  ok("…and OMITS the blank ones (no fabricated answers)",
    !fields.includes("commute_destination") && !fields.includes("max_drive"),
    `got ${JSON.stringify(fields)}`)
  ok("seeded values have an empty `from` (first value, not a change)", changes.every((c) => c.from === ""))
  ok("the move date renders as a calendar date", changes.find((c) => c.field === "move_date")?.to === "12/10/2026")
  ok("it is ONE event carrying all of them",
    criteriaChangedMetadata("form", changes)?.changes.length === changes.length)
  // A form supplying none of the five must record nothing at all.
  ok("a form with none of the five records NOTHING",
    criteriaChangedMetadata("form", initialCriteria({ first_name: "Sam" })) === null)
}

console.log("\n2. ONE tracked criterion changed → ONE event with ONE change:")
{
  const changes = diffCriteria(LEAD, { desired_rent: "$1,800" })
  ok("exactly one change", changes.length === 1)
  ok("…it is Budget, with both sides", changes[0]?.label === "Budget" && changes[0]?.from === "$1,600" && changes[0]?.to === "$1,800")
  ok("…and it is one event", criteriaChangedMetadata("edit_client", changes)?.changes.length === 1)
}

console.log("\n3. MULTIPLE criteria in ONE save → still ONE event:")
{
  // The Lackland case from the brief: one sentence, two criteria.
  const changes = diffCriteria(LEAD, { commute_anchor_label: "Lackland AFB", commute_max_minutes: 20 })
  ok("two changes in one update", changes.length === 2)
  ok("…Commute / Destination → Lackland AFB",
    changes.some((c) => c.label === "Commute / Destination" && c.to === "Lackland AFB" && c.from === ""))
  ok("…Max Drive → 20 min", changes.some((c) => c.label === "Max Drive" && c.to === "20 min"))
  ok("…and Desired Areas is UNTOUCHED (a destination is not an area)",
    !changes.some((c) => c.field === "desired_areas"))
  const meta = criteriaChangedMetadata("edit_client", changes)
  ok("ONE event, not two", meta !== null && meta.changes.length === 2)
  ok("…carrying the source", meta?.source === "edit_client")

  // A budget + areas edit in the same save is likewise one entry.
  const multi = diffCriteria(LEAD, { desired_rent: "$1,800", neighborhoods: "Alamo Ranch" })
  ok("a Budget + Desired Areas save is also ONE event of two changes", multi.length === 2)
  ok("…Desired Areas is REPLACED, not appended",
    multi.find((c) => c.field === "desired_areas")?.to === "Alamo Ranch")
  ok("…and the original areas survive in `from`",
    multi.find((c) => c.field === "desired_areas")?.from === "Downtown San Antonio, Westover Hills")
}

console.log("\n4. A NO-OP save records nothing:")
{
  ok("identical values → no changes", diffCriteria(LEAD, { desired_rent: "$1,600" }).length === 0)
  ok("…so no event is produced", criteriaChangedMetadata("edit_client", diffCriteria(LEAD, LEAD)) === null)
  // Formatting-only differences are not changes.
  ok("whitespace-only difference is NOT a change", diffCriteria(LEAD, { desired_rent: " $1,600 " }).length === 0)
  ok("CSV respacing is NOT a change",
    diffCriteria(LEAD, { neighborhoods: "Downtown San Antonio,Westover Hills" }).length === 0)
  ok("re-saving the same move date is NOT a change", diffCriteria(LEAD, { move_date: "2026-12-10" }).length === 0)
  ok("null vs \"\" for an absent maximum is NOT a change",
    diffCriteria(LEAD, { commute_max_minutes: "" }).length === 0)
}

console.log("\n5. UNRELATED edits record nothing:")
{
  ok("changing notes alone → no event",
    criteriaChangedMetadata("edit_client", diffCriteria(LEAD, { notes: "called her" })) === null)
  ok("changing stage/phone/email alone → no event",
    diffCriteria(LEAD, { crm_status: "Contacted", phone: "+12105551212", email: "a@b.com" }).length === 0)
  ok("an untracked field alongside a tracked one records ONLY the tracked one",
    diffCriteria(LEAD, { notes: "x", desired_rent: "$1,800" }).length === 1)
}

console.log("\n6. A LEAD WITH NO HISTORY is normal, never reconstructed:")
{
  // Clearing a criterion is a real change and records an empty `to`.
  const cleared = diffCriteria(LEAD, { desired_rent: "" })
  ok("clearing a criterion IS a change", cleared.length === 1 && cleared[0].to === "")
  ok("…and keeps the previous value in `from`", cleared[0].from === "$1,600")
  // A lead with nothing set produces no seed at all.
  ok("a lead with no criteria yields no seed", initialCriteria({ id: 1 }).length === 0)
  const dto = strip(read("lib/companion/leadToDto.ts"))
  ok("the DTO tolerates a lead with no history rows", /if \(!Array\.isArray\(rows\)\) return \[\]/.test(dto))
  ok("…and skips malformed/legacy rows rather than rendering them half-empty",
    /if \(!source \|\| !Array\.isArray\(meta\.changes\)\) continue/.test(dto))
  ok("…no backfill or reconstruction exists anywhere",
    !/backfill|reconstruct/i.test(strip(read("lib/leads/criteriaHistory.ts"))))
}

console.log("\n7. SEARCH CRITERIA behaviour is untouched:")
{
  const dto = strip(read("lib/companion/leadToDto.ts"))
  ok("desiredAreas still derives from neighborhoods ?? submarkets",
    /desiredAreas: str\(lead\.neighborhoods\) \?\? str\(lead\.submarkets\)/.test(dto))
  ok("commuteDestination still uses the shared criterion formatter",
    /commuteDestination: clientCommuteCriterion\(lead\.commute_anchor_label, lead\.commute_max_minutes\)/.test(dto))
  ok("moveDate still passes through raw", /moveDate: str\(lead\.move_date\)/.test(dto))
  ok("clientHistory is a SIBLING of searchCriteria, not inside it",
    /\},\s*clientHistory: toClientHistory/.test(dto))
  const contract = strip(read("packages/companion-shared/src/leads/contract.ts"))
  {
    // Scope to the schema's OWN body — the new history schemas are declared just
    // after it, so a proximity match would false-positive.
    const i = contract.indexOf("searchCriteriaSchema = z.object({")
    const body = i >= 0 ? contract.slice(i, contract.indexOf("});", i)) : ""
    ok("the searchCriteria schema body was located", body.length > 0)
    ok("the searchCriteria schema itself is unchanged (no history field added to it)",
      !/clientHistory/.test(body))
  }
  ok("clientHistory is optional on the contract (older payloads still validate)",
    /clientHistory: z\.array\(clientHistoryEntrySchema\)\.nullish\(\)/.test(contract))
}

console.log("\n8. The Companion accordion:")
{
  const view = strip(read("apps/beast-companion/src/sidepanel/lead/LeadPanelView.tsx"))
  ok("a Client History SectionCard exists", /title="Client History"/.test(view))
  ok("…COLLAPSED by default", /title="Client History"\s+defaultOpen=\{false\}/.test(view))
  ok("…using the existing SectionCard primitive (no new accordion)",
    /<SectionCard[^>]*title="Client History"/.test(view))
  ok("…positioned directly after Credit Screening",
    view.indexOf('title="Credit Screening"') < view.indexOf('title="Client History"') &&
    view.indexOf('title="Client History"') < view.indexOf('title="Client Notes"'))
  ok("…with a small neutral empty state", /No recorded criteria changes yet\./.test(view))
  ok("…rendering newest first (sorted in the DTO)",
    /new Date\(b\.occurredAt\)\.getTime\(\) - new Date\(a\.occurredAt\)\.getTime\(\)/.test(strip(read("lib/companion/leadToDto.ts"))))
  ok("…and a seeded value shows alone, with no arrow out of nothing",
    /c\.from \? `\$\{c\.from\} → \$\{c\.to \|\| "—"\}` : c\.to \|\| "—"/.test(view))
  // Credit Screening must be exactly as it was.
  ok("Credit Screening is unchanged and still collapsed",
    /title="Credit Screening"\s+defaultOpen=\{false\}/.test(view))

  // The empty state is a plain statement of fact, not an aside — muted by token,
  // never italic.
  const css = read("apps/beast-companion/src/sidepanel/lead/panel.css")
  const emptyRule = css.slice(css.indexOf(".lp-history-empty"), css.indexOf("}", css.indexOf(".lp-history-empty")))
  ok("the empty state is muted via the secondary token", /--lb-text-secondary/.test(emptyRule))
  ok("…and is NOT italic", !/font-style:\s*italic/.test(emptyRule))

  // Client History is unconditional: an empty accordion is a dependable place to
  // look, so it must never be hidden the way Client Notes is.
  ok("Client History renders even with no entries (not wrapped in a hasValue guard)",
    !/hasValue\(lead\.clientHistory\)[\s\S]{0,40}title="Client History"/.test(view))
}

console.log("\n9. CLIENT NOTES is conditional; CLIENT HISTORY is not:")
{
  const view = strip(read("apps/beast-companion/src/sidepanel/lead/LeadPanelView.tsx"))
  ok("Client Notes renders ONLY when the client actually submitted notes",
    /hasValue\(lead\.clientNotes\) && \(/.test(view))
  // hasValue is what makes "null, empty, or whitespace-only" one rule.
  ok("…and hasValue treats whitespace-only as absent",
    /if \(typeof v === "string"\) return v\.trim\(\)\.length > 0;/.test(view))
  ok("…nullish too", /if \(v === null \|\| v === undefined\) return false;/.test(view))
  // Order holds in BOTH cases: Client History sits before Client Notes, so
  // dropping the notes card leaves Client History last rather than re-ordering.
  ok("order is Search Criteria → Credit Screening → Client History → Client Notes",
    view.indexOf('title="Search Criteria"') < view.indexOf('title="Credit Screening"') &&
    view.indexOf('title="Credit Screening"') < view.indexOf('title="Client History"') &&
    view.indexOf('title="Client History"') < view.indexOf('title="Client Notes"'))
  ok("…so with no notes the panel simply ends at Client History",
    view.indexOf('title="Client History"') < view.indexOf("hasValue(lead.clientNotes)"))
  // The notes DATA is untouched — this is a render guard, nothing more.
  ok("the notes value is still rendered verbatim when present",
    /<p className="lp-notes">\{lead\.clientNotes\}<\/p>/.test(view))
}

console.log("\nSAFETY — a history write can never break a save:")
{
  const modal = strip(read("components/LeadFormModal.tsx"))
  const submit = strip(read("app/api/leads/submit/route.ts"))
  // Compared against the CALL SITE, not the import at the top of the file.
  ok("Edit Client records only AFTER the update succeeded",
    modal.indexOf("alert(\"Could not save changes\")") < modal.indexOf("recordTimelineEvent({ leadId"))
  ok("…via the fire-and-forget timeline helper", /recordTimelineEvent\(\{ leadId: lead\.id, type: "criteria_changed"/.test(modal))
  ok("…and the save path itself is unchanged", /const \{ data, error \} = await supabase[\s\S]{0,80}\.update\(patch\)/.test(modal))
  ok("the form seed is wrapped in try/catch so creation cannot fail on it",
    /try \{[\s\S]{0,400}criteriaChangedMetadata\("form"[\s\S]{0,600}\} catch/.test(submit))
  ok("…and it runs after a successful insert", submit.indexOf("insertError") < submit.indexOf('criteriaChangedMetadata("form"'))
  ok("the page attaches history best-effort, never failing the CRM",
    /catch \(e\) \{[\s\S]{0,160}Error attaching client history/.test(strip(read("app/admin/leads/page.tsx"))))
}

console.log("\nBOUNDARIES — nothing automated is touched:")
{
  const hist = strip(read("lib/leads/criteriaHistory.ts"))
  for (const forbidden of ["followup", "sms_opt_in", "opt_out", "companion_messages", "intent", "ai_client_briefs", "cursor"]) {
    ok(`criteriaHistory never references ${forbidden}`, !new RegExp(forbidden, "i").test(hist))
  }
  ok("…and it performs no I/O at all (pure)", !/supabase|fetch\(/.test(hist))
  ok("the timeline type was added without a migration (type is plain text)",
    /criteria_changed/.test(strip(read("lib/leads/timeline.ts"))) &&
    /type\s+text not null/.test(read("supabase/migrations/20260727000001_add_lead_timeline.sql")))
  ok("the page query is scoped to criteria_changed only",
    /\.eq\("type", "criteria_changed"\)/.test(strip(read("app/admin/leads/page.tsx"))))
}

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
