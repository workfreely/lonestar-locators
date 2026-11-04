/**
 * CRIMINAL BACKGROUND — one sentence, two surfaces, nothing invented.
 *
 *   npx tsx scripts/leads/criminalScreeningLine.test.ts
 *
 * The offense CATEGORY has been collected by the Smart Form and stored on the lead since the
 * form shipped, and reached no agent-facing surface at all: it was absent from the Companion's
 * db-types, its contract, the DTO and the CRM's own card. This suite covers the shared formatter
 * that fixes that, the server-side gating that feeds it, and the two call sites.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { criminalScreeningLine } from "@bc/companion-shared"
import { buildActiveClientPayload } from "@/lib/companion/leadToDto"

let pass = 0, fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nthe sentence itself")
ok("background + category + age", criminalScreeningLine({
  background: "Felony", charge: "Drug Related", felonyAge: "3 years",
}) === "Felony · Drug Related · 3 years", String(criminalScreeningLine({ background: "Felony", charge: "Drug Related", felonyAge: "3 years" })))
ok("a misdemeanor reads its OWN age", criminalScreeningLine({
  background: "Misdemeanor", charge: "Theft / Fraud", misdemeanorAge: "1 year",
}) === "Misdemeanor · Theft / Fraud · 1 year")
ok("…and never the other one's", criminalScreeningLine({
  background: "Misdemeanor", felonyAge: "7+ years",
}) === "Misdemeanor")
ok("a category with no age still shows", criminalScreeningLine({ background: "Felony", charge: "DWI" }) === "Felony · DWI")
ok("an age with no category still shows", criminalScreeningLine({ background: "Felony", felonyAge: "5 years" }) === "Felony · 5 years")
ok("the bare background still shows", criminalScreeningLine({ background: "Felony" }) === "Felony")

console.log("\nsilence is not an answer, and \"None\" is")
ok("no background → no row at all", criminalScreeningLine({}) === null)
ok("…and a blank one is the same", criminalScreeningLine({ background: "   " }) === null)
ok("\"None\" is a complete answer", criminalScreeningLine({ background: "None" }) === "None")
// A category beside "None" would contradict the answer the renter actually gave.
ok("…and nothing is appended to it", criminalScreeningLine({
  background: "None", charge: "Assault", felonyAge: "3 years",
}) === "None")

console.log("\nit reports, it does not conclude")
{
  const src = read("packages/companion-shared/src/format/criminalScreening.ts")
  ok("no scoring, ranking or eligibility language", !/score|rank|eligib|approv|denied|exclude/i.test(src.split("*/")[1] ?? src))
  ok("the file says a charge is not a conviction", /never turns a reported CHARGE into a conviction/.test(src))
}

console.log("\nthe server gates what it sends")
{
  const dto = read("lib/companion/leadToDto.ts")
  ok("the charge travels only with a real background",
    /criminalCharge:\s*\n?\s*criminalBackground && criminalBackground !== "None" \? str\(lead\.criminal_charge\) : null/.test(dto))
  ok("the felony age is gated to a felony",
    /felonyAge: criminalBackground === "Felony" \? str\(lead\.felony_age\) : null/.test(dto))
  ok("the misdemeanor age is gated to a misdemeanor",
    /misdemeanorAge: criminalBackground === "Misdemeanor" \? str\(lead\.misdemeanor_age\) : null/.test(dto))
  ok("the contract carries the charge", /criminalCharge: z\.string\(\)\.nullish\(\)/.test(read("packages/companion-shared/src/leads/contract.ts")))
  ok("…and the row type names the column", /criminal_charge: string \| null;/.test(read("packages/companion-shared/src/leads/db-types.ts")))
}

console.log("\nboth surfaces, one formatter, no new card")
{
  const companion = read("apps/beast-companion/src/sidepanel/lead/LeadPanelView.tsx")
  const crm = read("components/crm/LeadPanel.tsx")
  ok("the Companion composes the row with it", /criminalScreeningLine\(\{[\s\S]{0,200}charge: cs\.criminalCharge/.test(companion))
  ok("the CRM composes the same row with it", /criminalScreeningLine\(\{[\s\S]{0,200}charge: lead\.criminal_charge/.test(crm))
  ok("neither hand-rolls the old wording", !/\$\{cb\} \(\$\{age\}\)/.test(crm) && !/value: cs\.criminalBackground \}/.test(companion))
  // IT IS THE EXISTING SECTION. No second card, no new accordion, no new title.
  ok("the Companion still has exactly one Credit Screening section",
    (companion.match(/title="Credit Screening"/g) ?? []).length === 1)
  ok("…and still exactly one Criminal Background row",
    (companion.match(/label: "Criminal Background"/g) ?? []).length === 1)
  ok("the CRM still has exactly one Credit Screening card",
    (crm.match(/title="Credit Screening"/g) ?? []).length === 1)
  ok("…and still exactly one Criminal Background field",
    (crm.match(/label="Criminal Background"/g) ?? []).length === 1)
}

console.log("\nno new question is asked of the renter")
{
  const form = read("app/smart-lead-form/_components/form/sections/LeadFormFields.tsx")
  ok("the Smart Form still collects the same four fields",
    /criminal_background: formData\.criminalBackground/.test(form) &&
    /criminal_charge: formData\.criminalCharge/.test(form) &&
    /felony_age: formData\.felonyAge/.test(form) &&
    /misdemeanor_age: formData\.misdemeanorAge/.test(form))
  ok("the category vocabulary is unchanged",
    /"DWI",\s*\n\s*"Drug Related",\s*\n\s*"Assault",\s*\n\s*"Theft \/ Fraud",\s*\n\s*"Sex Offense",\s*\n\s*"Other",/.test(read("lib/formOptions.ts")))
  // THE EDITING WORKFLOW IS UNTOUCHED: the CRM's own lead form already edits the charge.
  ok("the existing client-editing form still edits the charge",
    /updateField\("criminal_charge"/.test(read("components/LeadFields.tsx")))
}

console.log("\nevery Smart Form answer, end to end through the real DTO")
{
  const screening = (lead: Record<string, unknown>) =>
    (buildActiveClientPayload({ id: 1, first_name: "T", ...lead }) as { lead: { creditScreening: Record<string, unknown> } })
      .lead.creditScreening
  const line = (lead: Record<string, unknown>) => {
    const cs = screening(lead)
    return criminalScreeningLine({
      background: cs.criminalBackground as string | null,
      charge: cs.criminalCharge as string | null,
      felonyAge: cs.felonyAge as string | null,
      misdemeanorAge: cs.misdemeanorAge as string | null,
    })
  }

  // Every value the Smart Form can produce, in the combinations an agent will actually meet.
  ok("Felony + category + age",
    line({ criminal_background: "Felony", criminal_charge: "Drug Related", felony_age: "3 years" })
      === "Felony · Drug Related · 3 years")
  ok("Misdemeanor + category + age",
    line({ criminal_background: "Misdemeanor", criminal_charge: "DWI", misdemeanor_age: "1 year" })
      === "Misdemeanor · DWI · 1 year")
  ok("None, with nothing appended",
    line({ criminal_background: "None", criminal_charge: "Assault", felony_age: "5 years" }) === "None")
  ok("a MISSING CHARGE still shows the background and age",
    line({ criminal_background: "Felony", felony_age: "7+ years" }) === "Felony · 7+ years")
  ok("…and a blank one behaves the same",
    line({ criminal_background: "Felony", criminal_charge: "   ", felony_age: "7+ years" }) === "Felony · 7+ years")
  ok("a MISSING AGE still shows the background and category",
    line({ criminal_background: "Misdemeanor", criminal_charge: "Theft / Fraud" }) === "Misdemeanor · Theft / Fraud")
  ok("neither one present → the background alone",
    line({ criminal_background: "Felony" }) === "Felony")
  ok("nothing answered → no row at all", line({}) === null)

  // THE GATING, proved on the DTO rather than on the formatter.
  ok("a felony's row carries no misdemeanor age",
    screening({ criminal_background: "Felony", felony_age: "3 years", misdemeanor_age: "1 year" }).misdemeanorAge === null)
  ok("a misdemeanor's row carries no felony age",
    screening({ criminal_background: "Misdemeanor", felony_age: "3 years", misdemeanor_age: "1 year" }).felonyAge === null)
  ok("a category never travels without a background",
    screening({ criminal_charge: "Assault" }).criminalCharge === null)
  ok("…nor beside \"None\"",
    screening({ criminal_background: "None", criminal_charge: "Assault" }).criminalCharge === null)

  // THE REST OF THE SCREENING BLOCK IS UNTOUCHED by this change.
  const other = screening({
    credit_score: "600", credit_history: "Eviction", eviction_age: "2 years", eviction_balance: "$500-$1,000",
    criminal_background: "Felony", criminal_charge: "DWI", felony_age: "3 years",
  })
  ok("credit score, history and the eviction pair still travel",
    other.creditScore === "600" && other.creditHistory === "Eviction" &&
    other.evictionAge === "2 years" && other.evictionBalance === "$500-$1,000",
    JSON.stringify(other))
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
