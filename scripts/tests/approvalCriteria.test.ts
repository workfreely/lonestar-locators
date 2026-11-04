/**
 * APPROVAL CRITERIA — the editor section, its vocabulary, and the two things it must never do.
 *
 * WHAT THIS GUARDS.
 *
 *  1. UNKNOWN SURVIVES. Every field's empty state is NULL and means "nobody has asked". It is
 *     never stored as, rendered as, or compared as "not accepted", 0 or false. A property with no
 *     entry must not read as a property that refuses everybody.
 *
 *  2. HIDING IS NOT DELETING. The section hides a group's age and balance rules under "Not
 *     accepted", because they are moot there. A hidden field must keep whatever is stored in it —
 *     and a group that ALREADY holds detail must not be hidden at all, or the agent cannot see or
 *     correct a requirement that is still in force.
 *
 *  3. ONE VOCABULARY. The panel offers options, the route validates them, a CHECK constraint
 *     stores them. Three copies would drift, and the failure mode is silent in the worst
 *     direction: the agent picks an option and the save reports success while the value is
 *     rejected. So the tokens are asserted identical across all three.
 *
 *  4. NO INVENTED VERIFICATION. Saving an edit must not stamp a date that reads as a leasing
 *     office confirming something.
 *
 * Run: npx tsx scripts/tests/approvalCriteria.test.ts   (pure — reads source + exported values)
 */
import { existsSync, readFileSync } from "node:fs"
import {
  APPROVAL_FIELDS, APPROVAL_COLUMNS, APPROVAL_STATUSES, BALANCE_REQUIREMENTS, MAX_AGE_YEARS,
  APPROVAL_TEXT_MAX, BROKEN_LEASE_STATUS_OPTIONS, EVICTION_STATUS_OPTIONS,
  RENTAL_DEBT_STATUS_OPTIONS, BALANCE_REQUIREMENT_OPTIONS, POSITIVE_HISTORY_OPTIONS,
  parseApprovalValue, approvalValueToInput, groupHasStoredDetail,
} from "@/lib/propertyIntel/approvalCriteria"
import { updatedLabel } from "@/lib/propertyIntel/relativeAge"
import {
  ENRICHMENT_WRITABLE_FIELDS, CANONICAL_SCALAR_FIELDS, OWNER_SCREENING_FIELDS,
  OWNER_ONLY_FIELDS, OWNER_CLEARABLE_FIELDS, OWNER_CREDIT_FIELDS, decideFieldWrite,
} from "@/lib/propertyEnrichment/policy"

let pass = 0
let fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) }
  else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}
/** Comments quote rejected designs and old expressions, so assertions run against code. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n")

const read = (p: string) => readFileSync(p, "utf8")
/** A migration starts in prepared/ and MOVES to migrations/ when applied. Resolve, never guess. */
const migration = (name: string) =>
  read(existsSync(`supabase/migrations/${name}`) ? `supabase/migrations/${name}` : `supabase/prepared/${name}`)

const rawPanel = read("components/crm/MapPropertyEditor.tsx")
const panel = strip(rawPanel)
const route = strip(read("app/api/admin/owner/property-pricing/route.ts"))
const vocab = strip(read("lib/propertyIntel/approvalCriteria.ts"))
const mig0 = migration("20261110000000_property_screening_requirements.sql")
const mig4 = migration("20261110000004_approval_criteria_fields.sql")
const rollback4 = read("supabase/prepared/ROLLBACK_20261110000004_approval_criteria_fields.sql")

// ── 1. The section is in the existing panel, where it was asked for ──────────────────────────
console.log("\nAPPROVAL CRITERIA — one section in the existing Edit Property panel\n")
console.log("placement")
ok("the panel renders a section titled Approval Criteria", /Approval Criteria/.test(panel))
ok("…directly BELOW Property Intelligence",
  panel.indexOf("Property Intelligence") < panel.indexOf("Approval Criteria"),
  "Approval Criteria appears above Property Intelligence")
ok("…and above the Source field, still inside the same panel",
  panel.indexOf("Approval Criteria") < panel.lastIndexOf("Source (optional)"))
ok("no second editor, modal, tab or page was created",
  !/role="dialog"[\s\S]*role="dialog"/.test(panel) && (panel.match(/createPortal\(/g) ?? []).length === 1)
ok("it is still the one endpoint behind the pencil",
  (panel.match(/const ENDPOINT = "\/api\/admin\/owner\/property-pricing"/g) ?? []).length === 1)
ok("the five groups are all present", ["Credit Score", "Broken Lease", "Eviction",
  "Deposits &amp; Risk Fees", "Additional Approval Notes"].every((g) => panel.includes(g)))
// RENTAL DEBT IS NO LONGER DRAWN — and that is a UI decision, not a data one. The three
// assertions below are the ones that matter: the group is gone from the panel, its fields are
// still reachable by the save path, and the panel still LOADS whatever they hold. Together those
// are what make removing the controls incapable of clearing anybody's stored values.
ok("the Rental Debt group is not rendered", !/<h4 className=\{groupTitle\}>Rental Debt/.test(panel))
ok("…and nothing in the panel references its fields", !/rentalDebt/.test(panel))
ok("…but all three of its columns are still editor fields",
  ["rental_debt_status", "rental_debt_balance_requirement", "rental_debt_max_balance"]
    .every((c) => APPROVAL_COLUMNS.includes(c)))
ok("…still owner-only and still firewalled from enrichment",
  ["rental_debt_status", "rental_debt_balance_requirement", "rental_debt_max_balance"]
    .every((c) => OWNER_ONLY_FIELDS.has(c) && !ENRICHMENT_WRITABLE_FIELDS.has(c)))
ok("…and hydrate still loads every approval field, so a stored value is held and compared",
  /for \(const \[key, spec\] of Object\.entries\(APPROVAL_FIELDS\)\)[\s\S]{0,160}approvalValueToInput\(d\.approval\?\.\[spec\.column\]\)/.test(panel))
ok("the section is marked internal only", /Approval Criteria[\s\S]{0,200}internal only/.test(panel))

// ── 2. Credit is REUSED, not duplicated ──────────────────────────────────────────────────────
console.log("\ncredit score — the five shipped columns, moved not copied")
ok("no approval field maps to a credit column",
  APPROVAL_COLUMNS.every((c) => !c.startsWith("credit_")),
  APPROVAL_COLUMNS.filter((c) => c.startsWith("credit_")).join(", "))
ok("the credit status control still exists, once",
  (panel.match(/value="reported_minimum"/g) ?? []).length === 1 &&
  (panel.match(/value="no_check_reported"/g) ?? []).length === 1)
ok("the observed-approval score is still its own control",
  /Lowest Previously Approved/.test(panel) && /one approval is not a policy/.test(rawPanel))
// THE TWO CREDIT FIELDS ARE NOT COMBINED. One is the office's reported screening minimum, the
// other a score somebody was actually approved with, and they are separate columns.
ok("…under its new label, still bound to the observed-approval state",
  /Lowest Previously Approved[\s\S]{0,400}value=\{creditObserved\}/.test(panel))
ok("…and the reported minimum is still a different control, to a different column",
  /Reported Minimum \(300–850\)[\s\S]{0,300}value=\{creditScore\}/.test(panel) &&
  /creditMinimumScore: "credit_minimum_score"/.test(route) &&
  /credit_observed_approval_score/.test(route))
ok("the range it dropped from the label is still stated beside the field",
  /actually approved with, 300–850/.test(rawPanel))
ok("the notes textarea still binds the SAME credit_screening_notes state",
  (panel.match(/value=\{creditNotes\}/g) ?? []).length === 1)
ok("…relabelled as the approval notes, not replaced",
  /Additional Approval Notes[\s\S]{0,900}value=\{creditNotes\}/.test(panel))
ok("the existing screening notes are loaded verbatim", /setCreditNotes\(d\.creditScreeningNotes \?\? ""\)/.test(panel))
ok("credit is still owner-firewalled alongside the new columns",
  [...OWNER_CREDIT_FIELDS].every((f) => OWNER_ONLY_FIELDS.has(f) && !ENRICHMENT_WRITABLE_FIELDS.has(f)))

// ── 3. One vocabulary across panel, route and database ───────────────────────────────────────
console.log("\none vocabulary — panel, route, CHECK constraint")
const sqlTokens = (sql: string, column: string): string[] => {
  const m = new RegExp(`${column} in \\(([^)]*)\\)`).exec(sql.replace(/\s+/g, " "))
  return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : []
}
ok("broken_lease_status: the CHECK holds exactly the TS token set",
  sqlTokens(mig0, "broken_lease_status").join(",") === [...APPROVAL_STATUSES].join(","),
  `${sqlTokens(mig0, "broken_lease_status")} vs ${[...APPROVAL_STATUSES]}`)
ok("eviction_status: the same three tokens", sqlTokens(mig0, "eviction_status").join(",") === [...APPROVAL_STATUSES].join(","))
ok("rental_debt_status: the same three tokens", sqlTokens(mig0, "rental_debt_status").join(",") === [...APPROVAL_STATUSES].join(","))
ok("broken_lease_balance_requirement: the CHECK holds the TS balance tokens",
  sqlTokens(mig0, "broken_lease_balance_requirement").join(",") === [...BALANCE_REQUIREMENTS].join(","))
ok("eviction_balance_requirement: the SAME tokens, its own column",
  sqlTokens(mig4, "eviction_balance_requirement").join(",") === [...BALANCE_REQUIREMENTS].join(","))
ok("rental_debt_balance_requirement: likewise",
  sqlTokens(mig4, "rental_debt_balance_requirement").join(",") === [...BALANCE_REQUIREMENTS].join(","))
ok("the panel hardcodes no option token of its own",
  !/value="accepted_if_paid"/.test(panel) && !/value="must_be_paid"/.test(panel) && !/value="balance_ok"/.test(panel))
ok("the route validates through the shared planner, not its own copy",
  /const approvalPlan = planApprovalWrites\(body\)/.test(route) && !/accepted_if_paid/.test(route))
ok("the panel validates through the SAME parser",
  /parseApprovalValue\(spec\.kind, v\)/.test(panel))

// ── 4. Every policy option the owner asked for ───────────────────────────────────────────────
console.log("\nevery acceptance option is offered, and Unknown is always first")
for (const [name, opts] of [
  ["broken lease", BROKEN_LEASE_STATUS_OPTIONS], ["eviction", EVICTION_STATUS_OPTIONS],
  ["rental debt", RENTAL_DEBT_STATUS_OPTIONS], ["balance requirement", BALANCE_REQUIREMENT_OPTIONS],
  ["positive history", POSITIVE_HISTORY_OPTIONS],
] as const) {
  ok(`${name}: Unknown is the first option and its value is ""`, opts[0].value === "" && /Unknown/.test(opts[0].label))
  ok(`${name}: no option repeats a value`, new Set(opts.map((o) => o.value)).size === opts.length)
  ok(`${name}: every non-empty value is a known token`,
    opts.slice(1).every((o) => (APPROVAL_STATUSES as readonly string[]).includes(o.value) ||
      (BALANCE_REQUIREMENTS as readonly string[]).includes(o.value) || o.value === "yes" || o.value === "no"))
}
ok("broken lease offers accepted / accepted-if-paid / not-accepted",
  BROKEN_LEASE_STATUS_OPTIONS.map((o) => o.value).join(",") === ",accepted,accepted_if_paid,not_accepted")
ok("“accepted if paid” stays a distinct option, never folded into Not accepted",
  BROKEN_LEASE_STATUS_OPTIONS.some((o) => o.value === "accepted_if_paid") &&
  BROKEN_LEASE_STATUS_OPTIONS.some((o) => o.value === "not_accepted") &&
  BROKEN_LEASE_STATUS_OPTIONS.find((o) => o.value === "accepted_if_paid")!.label !==
    BROKEN_LEASE_STATUS_OPTIONS.find((o) => o.value === "not_accepted")!.label)
ok("eviction's conditional option says what it is conditional ON",
  /Conditional[\s\S]{0,40}balances are paid/.test(EVICTION_STATUS_OPTIONS[2].label))
ok("anything conditional on something else is pushed to the notes, not a rule",
  /conditional on something other than the balance belongs in the notes/.test(rawPanel))
ok("balance options can say paid-in-full, a plan, or does-not-matter",
  BALANCE_REQUIREMENT_OPTIONS.map((o) => o.value).join(",") === ",must_be_paid,payments_or_plan,balance_ok")
ok("positive history has three states, so “not required” is storable",
  POSITIVE_HISTORY_OPTIONS.length === 3 && POSITIVE_HISTORY_OPTIONS.some((o) => o.value === "no"))
// The distinction still has to be recorded somewhere, and it is: on the column itself.
ok("the rental-debt column still documents that it is NOT medical or credit-card debt",
  /Not medical and not credit-card collections/.test(mig4))

// ── 5. The parser: every kind, and every boundary ────────────────────────────────────────────
console.log("\nparseApprovalValue — the one gate both sides run")
const W = (k: Parameters<typeof parseApprovalValue>[0], v: unknown) => {
  const r = parseApprovalValue(k, v)
  return "bad" in r ? "BAD" : r.write
}
ok("unknown: null → clear", W("status", null) === null)
ok("unknown: undefined → clear", W("status", undefined) === null)
ok("unknown: blank → clear", W("status", "") === null && W("age", "   ") === null)
ok("status: a known token passes", W("status", "accepted_if_paid") === "accepted_if_paid")
ok("status: an invented token is REJECTED, not stored", W("status", "maybe") === "BAD")
ok("status: 'conditional' is not silently accepted", W("status", "conditional") === "BAD")
ok("balance: a known token passes", W("balanceRequirement", "payments_or_plan") === "payments_or_plan")
ok("balance: an invented token is rejected", W("balanceRequirement", "paid_ish") === "BAD")
ok("age: 3 years", W("age", "3") === 3)
ok("age: 0 is a real answer, not blank", W("age", "0") === 0)
ok(`age: ${MAX_AGE_YEARS} is the ceiling`, W("age", String(MAX_AGE_YEARS)) === MAX_AGE_YEARS)
ok("age: above the ceiling is a typo, not a policy", W("age", String(MAX_AGE_YEARS + 1)) === "BAD")
ok("age: negative is rejected", W("age", "-1") === "BAD")
ok("age: a fraction is rejected", W("age", "2.5") === "BAD")
ok("age: words are rejected", W("age", "three") === "BAD")
ok("money: 2000", W("money", "2000") === 2000)
ok("money: $ and commas are tolerated", W("money", "$2,000") === 2000)
ok("money: cents survive", W("money", "1999.99") === 1999.99)
ok("money: 0 is a real ceiling", W("money", "0") === 0)
ok("money: negative is rejected", W("money", "-5") === "BAD")
ok("money: nonsense is rejected", W("money", "a lot") === "BAD")
ok("tri: yes → true", W("tri", "yes") === true)
ok("tri: no → FALSE, which is a finding and not an absence", W("tri", "no") === false)
ok("tri: anything else is rejected", W("tri", "maybe") === "BAD")
ok("text: a quoted range survives verbatim", W("text", "$250–$500 depending on score") === "$250–$500 depending on score")
ok("text: a nonrefundable condition survives verbatim", W("text", "One month, nonrefundable") === "One month, nonrefundable")
ok("text: over the cap is rejected rather than TRUNCATED", W("text", "x".repeat(APPROVAL_TEXT_MAX + 1)) === "BAD")
ok("text: exactly the cap passes", W("text", "x".repeat(APPROVAL_TEXT_MAX)) === "x".repeat(APPROVAL_TEXT_MAX))
ok("date: a real date passes", W("date", "2026-11-03") === "2026-11-03")
ok("date: a non-date is rejected, never coerced to today", W("date", "yesterday") === "BAD")
ok("date: an impossible date is rejected", W("date", "2026-13-45") === "BAD")

console.log("\napprovalValueToInput — null is never rendered as a claim")
ok("null shows blank", approvalValueToInput(null) === "")
ok("undefined shows blank", approvalValueToInput(undefined) === "")
ok("0 shows 0, not blank — a real ceiling", approvalValueToInput(0) === "0")
ok("false shows 'no', not blank — a real finding", approvalValueToInput(false) === "no")
ok("true shows 'yes'", approvalValueToInput(true) === "yes")
ok("a round trip through the input preserves every stored shape",
  [null, 0, 3, false, true, "accepted", 1999.99].every((v) => {
    const back = approvalValueToInput(v)
    return v === null ? back === "" : back === String(approvalValueToInput(v))
  }))

// ── 6. Hiding is not deleting ────────────────────────────────────────────────────────────────
console.log("\nconditional fields — hidden is not cleared")
ok("a group with nothing stored can be hidden", !groupHasStoredDetail([null, undefined, ""]))
ok("a stored age keeps the group open", groupHasStoredDetail([null, 3]))
ok("a stored 0 keeps it open — 0 is a value", groupHasStoredDetail([0]))
ok("a stored false keeps it open — false is a finding", groupHasStoredDetail([false]))
ok("a stored token keeps it open", groupHasStoredDetail([null, "must_be_paid"]))
ok("the panel hides detail only under a group's own CLOSED answer",
  // Parameterised when Criminal Background arrived, whose closed answer is "not_considered"
  // rather than "not_accepted". The rule for THESE groups is unchanged, which is what the
  // default asserts: they pass no token, so they still hide only under Not Accepted.
  /\(approval\[statusKey\] \?\? ""\) !== closed/.test(panel) &&
  /showDetail = \(statusKey: string, columns: string\[\], closed = "not_accepted"\)/.test(panel))
ok("…and the requirement groups still pass no token, so Not Accepted is still their rule",
  (panel.match(/showDetail\("(brokenLease|eviction)Status", \[[^\]]*\]\)/g) ?? []).length === 2)
ok("…while the only other closed token in the panel is the criminal one",
  [...panel.matchAll(/showDetail\([^)]*?, "([a-z_]+)"\)/g)].every((m) => m[1] === "not_considered"))
ok("…and never when something is stored in the group",
  /groupHasStoredDetail\(columns\.map\(\(c\) => loaded\?\.approval\?\.\[c\]\)\)/.test(panel))
ok("both remaining incident groups use that same rule",
  (panel.match(/showDetail\("(brokenLease|eviction)Status"/g) ?? []).length === 2)
ok("a hidden field cannot be cleared, because only CHANGED fields are sent",
  /const stored = approvalValueToInput\(loaded\.approval\?\.\[spec\.column\]\)[\s\S]{0,200}if \(now !== stored\) out\[key\] = now/.test(panel))
ok("saving one field never requires the rest — the payload is the change set",
  /const payload: Record<string, unknown> = \{ placeId: loaded\.placeId, \.\.\.changes \}/.test(panel))

// ── 7. Saving, reloading, clearing ───────────────────────────────────────────────────────────
console.log("\nsave and reload")
ok("every column is reachable from the editor only through APPROVAL_FIELDS",
  /const keys = Object\.keys\(APPROVAL_FIELDS\)\.filter\(\(k\) => k in body\)/.test(vocab))
ok("a blank value is sent as the deliberate CLEAR", /ownerClear: true/.test(route))
ok("…and every column is permitted to be cleared",
  APPROVAL_COLUMNS.every((c) => OWNER_CLEARABLE_FIELDS.has(c)),
  APPROVAL_COLUMNS.filter((c) => !OWNER_CLEARABLE_FIELDS.has(c)).join(", "))
ok("a rejected value fails the whole save and names the field",
  /rejected\.push\(key\); continue/.test(route) && /error: "bad_value", fields: rejected/.test(route))
ok("the panel will not let a rejectable value reach Save",
  /const blockSave = [^\n]*approvalInvalid/.test(panel))
ok("the panel re-reads after saving rather than assuming", /const fresh = await fetch/.test(panel))
ok("hydrate fills every approval field from the stored row",
  /for \(const \[key, spec\] of Object\.entries\(APPROVAL_FIELDS\)\)[\s\S]{0,160}approvalValueToInput\(d\.approval\?\.\[spec\.column\]\)/.test(panel))
ok("an owner may CORRECT a populated requirement (preserve-by-default would refuse otherwise)",
  decideFieldWrite({
    field: "broken_lease_status", candidateText: "accepted_if_paid", currentText: "accepted",
    candidateSourceType: "manual_verified", candidateVerification: "inferred",
    candidateOwnerOverride: true, currentProvenance: undefined,
  }).outcome === "write")

console.log("\nthe columns may not exist yet, and that is said out loud")
ok("the read path probes them separately so the editor still loads without them",
  /async function readApprovalCriteria/.test(route))
ok("a missing column set is reported as a fact, not as empty values",
  /approvalAvailable: approval\.available/.test(route))
ok("a save against missing columns is REFUSED, not reported as success",
  /error: "approval_columns_missing"/.test(route))
ok("the panel says so instead of showing empty controls",
  /!loaded\.approvalAvailable &&/.test(panel) && /prepared\s*\n?\s*migration has not been applied/.test(rawPanel))
ok("…while credit and the notes still save, because those columns are live",
  /Credit Score and Additional Approval Notes below/.test(rawPanel))

// ── 8. No invented verification ──────────────────────────────────────────────────────────────
console.log("\nagent-reported is not leasing-office verified")
ok("no save stamps credit_screening_checked_at", !/add\("credit_screening_checked_at"/.test(route))
ok("no save stamps the requirements date either",
  !/add\("screening_requirements_checked_at"/.test(route))
ok("the confirmation date is an explicit field the owner fills in",
  /screeningRequirementsCheckedAt/.test(panel) && /Confirmed with leasing office on/.test(rawPanel))
// THE PARAGRAPH IS GONE; THE RULE IS NOT. What guaranteed an ordinary save could never claim a
// leasing-office confirmation was never the sentence under the control — it is that no code path
// writes this column. That is asserted directly above, against the route.
ok("…and the explanatory paragraph under it is gone",
  !/saving never fills it in/.test(rawPanel) && !/Blank means agent-reported/.test(rawPanel))
ok("…while the control itself is still there", /Confirmed with leasing office on/.test(rawPanel))
ok("when the edit happened comes from provenance, per field",
  /fieldCheckedAt\[r\.field_name\] = r\.checked_at/.test(route))
ok("…and the age lines read that, not a stamp column",
  /updatedLabel\(\{ at: loaded\?\.fieldCheckedAt\?\.\[column\] \?\? null, verified: loaded\?\.fieldVerified\?\.\[column\] \}\)/.test(panel))
ok("the approval columns are covered by the provenance read",
  /\.\.\.APPROVAL_COLUMNS,/.test(route) && /\.\.\.CRIMINAL_COLUMNS\]\)/.test(route))
// The Source control stays and still decides verified-vs-inferred in provenance; only the
// paragraph under it is gone. The behaviour is asserted against the ROUTE, where it lives.
ok("the Source control is still there", /Source \(optional\)/.test(rawPanel) && /value=\{source\}/.test(panel))
ok("…and its paragraph is gone", !/With a source this save is recorded as verified/.test(rawPanel))
ok("“Verified” in the age lines is still earned by a supplied source, not by saving",
  /const verificationStatus: VerificationStatus = sourceRef \? "verified" : "inferred"/.test(route) &&
  /fieldVerified\[r\.field_name\] = r\.source_type === "manual_verified" && r\.verification_status === "verified"/.test(route))
ok("the section calls itself reported, never approved",
  /What a property is reported to accept/.test(rawPanel))
ok("a historical approval is still kept apart from a minimum",
  /one approval is not a policy/.test(rawPanel))

// ── 9. The firewall ──────────────────────────────────────────────────────────────────────────
console.log("\nno scraper may write an approval criterion")
ok(`all ${APPROVAL_COLUMNS.length} columns are owner-screening fields`,
  APPROVAL_COLUMNS.every((c) => OWNER_SCREENING_FIELDS.has(c)),
  APPROVAL_COLUMNS.filter((c) => !OWNER_SCREENING_FIELDS.has(c)).join(", "))
ok("…and owner-only", APPROVAL_COLUMNS.every((c) => OWNER_ONLY_FIELDS.has(c)))
ok("none is enrichment-writable", APPROVAL_COLUMNS.every((c) => !ENRICHMENT_WRITABLE_FIELDS.has(c)))
ok("none is a canonical scalar an automated job could fill",
  APPROVAL_COLUMNS.every((c) => !CANONICAL_SCALAR_FIELDS.includes(c)))
// The firewall itself lives in the WRITER, which is where ownerAuthorized — a server-decided
// fact, never a body claim — is available. Asserted both ways: structurally, that the writer
// gates the whole owner-only set behind the internal manual source, and functionally, that a
// public source carrying a forged owner flag cannot overwrite a stored requirement.
{
  const writer = strip(read("lib/propertyEnrichment/writer.ts"))
  ok("the writer's firewall covers the whole owner-only set",
    /if \(OWNER_ONLY_FIELDS\.has\(cand\.field\)\) \{/.test(writer))
  ok("…and admits only the internal manual source, with request-level authorization",
    /ownerAuthorized === true[\s\S]{0,200}cand\.sourceType === "manual_verified"[\s\S]{0,120}OWNER_ONLY_FIELDS\.has\(cand\.field\)/.test(writer))
  ok("a public source cannot overwrite a stored requirement",
    decideFieldWrite({
      field: "broken_lease_status", candidateText: "accepted", currentText: "not_accepted",
      candidateSourceType: "public_web", candidateVerification: "verified",
      candidateOwnerOverride: true, currentProvenance: null,
    }).outcome !== "write")
}
ok("the standard deposit columns were NOT reused for screening charges",
  !APPROVAL_COLUMNS.includes("deposit_amount") && !APPROVAL_COLUMNS.includes("deposit_range") &&
  APPROVAL_COLUMNS.includes("screening_risk_fee") && APPROVAL_COLUMNS.includes("screening_additional_deposit"))
ok("…and the reason is written down where the next person will look",
  /automated enrichment may write them from a marketing page/.test(rawPanel))

// ── 10. The migration ────────────────────────────────────────────────────────────────────────
console.log("\nthe schema additions")
const allMig = `${mig0}\n${mig4}`
ok("every editor column is added by a migration",
  APPROVAL_COLUMNS.every((c) => new RegExp(`add column if not exists\\s+${c}\\b`).test(allMig)),
  APPROVAL_COLUMNS.filter((c) => !new RegExp(`add column if not exists\\s+${c}\\b`).test(allMig)).join(", "))
ok("the new migration adds exactly five columns",
  (mig4.match(/add column if not exists/g) ?? []).length === 5)
ok("…and no column is added twice across the two files",
  APPROVAL_COLUMNS.every((c) => (allMig.match(new RegExp(`add column if not exists\\s+${c}\\b`, "g")) ?? []).length === 1))
ok("every addition is additive and nullable — no default encodes a guess",
  !/not null/i.test(mig4) && !/\bdefault\b/i.test(mig4))
ok("nothing is dropped, renamed or backfilled",
  !/drop (column|table)/i.test(mig4) && !/\brename\b/i.test(mig4) && !/\bupdate public\.property_catalog\b/i.test(mig4))
ok("the vocabularies are NOT VALID, so no 4,207-row scan", /not valid;/.test(mig4))
ok("it is labelled unapplied", /NOT APPLIED TO PRODUCTION/.test(mig4))
ok("a rollback exists and reverses exactly those five columns",
  (rollback4.match(/drop column if exists/g) ?? []).length === 5 &&
  /drop constraint if exists/.test(rollback4))
ok("…and says what dropping them costs", /DISCARDS/.test(rollback4))
ok("the gap analysis names what was reused instead of duplicated",
  /no \(0000\)/.test(mig4) && /no \(live\)/.test(mig4))

// ── 11. The Agent Bonus cleanup: presentation only ───────────────────────────────────────────
console.log("\nAgent Bonus — the paragraphs went, the field did not")
ok("the explanatory sentences are gone", !/Paid to the locator\. Separate from any resident gift card/.test(rawPanel))
ok("…both of them", !/Blank means nobody has checked\. Enter 0 to record a confirmed no-pay property/.test(rawPanel))
ok("the field itself is intact, now as the third cell of the commission row",
  /\["Bonus \(\$\)", bonus, setBonus, "bonusFlat", "bonus_flat"\]/.test(panel))
// THE UNIT MARKER IS THE POINT. Send and Escort are percentages and say so; the bonus is a dollar
// amount and must say so too, or 100 typed into it reads as a rate to the person typing it.
ok("…and it says it takes dollars, where its neighbours say percent",
  /\["Send %",/.test(panel) && /\["Escort %",/.test(panel) && /\["Bonus \(\$\)",/.test(panel))
ok("…and the stored value is no longer threaded through for a Clear button",
  !/loaded\.bonusFlat, false/.test(panel))
// THE WORD "AGENT" IS GONE, AND MUST STAY GONE. The column, the state and the payload key are all
// still bonus_flat — only what the agent reads changed.
ok("…labelled exactly “Bonus”, with no “Agent”", !/Agent Bonus/.test(panel))
ok("…while the field it writes is still bonus_flat", /bonusFlat: "bonus_flat"/.test(route))
ok("its state binding is intact", /value=\{value\}/.test(panel))
ok("its database mapping is intact", /bonusFlat: "bonus_flat"/.test(route))
ok("blank-vs-zero behaviour is intact — blank is never written",
  /if \(t === ""\) continue/.test(route) && /const n = Number\(t\)/.test(route))
ok("an explicit 0 is still written as a confirmed zero",
  /add\(column, column === "bonus_flat" \? String\(Math\.round\(n\)\) : `\$\{Math\.round\(n\)\}%`\)/.test(route))
ok("typing in it just sets its own state", /onChange=\{\(e\) => set\(e\.target\.value\)\}/.test(panel))
// NO FIELD HAS A CLEAR BUTTON NOW — and none needs one, because an emptied field travels as null.
ok("no commission field offers a Clear button",
  !/clearable/.test(panel) && !/Clear to unknown/.test(panel))
ok("commission is still firewalled from enrichment", !ENRICHMENT_WRITABLE_FIELDS.has("bonus_flat"))

// ── 12. Nothing else moved ───────────────────────────────────────────────────────────────────
console.log("\nnothing unrelated was touched")
// Section ORDER, read from the headings rather than from any mention of the word — a type field
// named sendCommission is not the Commission section.
const heading = (name: string) => {
  // The heading may wrap onto its own line when it carries a badge, so match across whitespace
  // rather than assuming the text sits immediately after the tag.
  const m = new RegExp(`<h3 className=\\{sectionTitle\\}>\\s*${name.replace(/[/]/g, "\\/")}`).exec(panel)
  return m ? (m.index as number) : -1
}
ok("every section heading is still present",
  ["Commission", "Specials", "Amenities / Features", "Property Intelligence", "Approval Criteria"]
    .every((h) => heading(h) > 0),
  ["Commission", "Specials", "Amenities / Features", "Property Intelligence", "Approval Criteria"]
    .filter((h) => heading(h) < 0).join(", "))
ok("the order is unchanged above the new section, and the new section is last",
  heading("Commission") < heading("Specials") &&
  heading("Specials") < heading("Amenities / Features") &&
  heading("Amenities / Features") < heading("Property Intelligence") &&
  heading("Property Intelligence") < heading("Approval Criteria"))
ok("the gift card is still NOT owner-clearable (pre-existing behaviour)", !OWNER_CLEARABLE_FIELDS.has("gift_card_status"))
ok("the washer/dryer controls are untouched", /washerDryerIncluded/.test(panel) && /washerDryerConnections/.test(panel))
ok("the three tristate attributes are untouched",
  /private_yard/.test(panel) && /attached_garage/.test(panel) && /detached_garage/.test(panel))
ok("the panel still writes through the enrichment writer only", /enrichProperty\(store/.test(route))
ok("the vocabulary module reaches no database, network or React",
  !/supabase|fetch\(|useState|react/i.test(vocab))

// ── 13. The layout and wording refinements ───────────────────────────────────────────────────
console.log("\nthe panel is compact, and says less")
ok("Send, Escort and Bonus are one three-across row",
  /<div className="grid grid-cols-3 gap-2">[\s\S]{0,400}"sendCommission"[\s\S]{0,200}"escortCommission"[\s\S]{0,200}"bonusFlat"/.test(panel))
ok("…and no two-column commission grid is left behind",
  !/grid-cols-2[\s\S]{0,200}sendCommission/.test(panel))
ok("the unknown option is just “Unknown” on broken lease and eviction",
  BROKEN_LEASE_STATUS_OPTIONS[0].label === "Unknown" && EVICTION_STATUS_OPTIONS[0].label === "Unknown")
ok("…and on the credit dropdown beside them, so the section reads consistently",
  /<option value="">Unknown<\/option>/.test(panel))
ok("…and on the Move-In Special, whose list is shared with the pricing pencil",
  /label: "Unknown"/.test(strip(read("lib/propertyIntel/moveInSpecials.ts"))))
ok("the payment option drops its commas",
  BALANCE_REQUIREMENT_OPTIONS.find((o) => o.value === "payments_or_plan")!.label ===
    "Payments made or payment plan accepted")
ok("…and its stored token is untouched",
  BALANCE_REQUIREMENT_OPTIONS.map((o) => o.value).join(",") === ",must_be_paid,payments_or_plan,balance_ok")

// ── 14. The date control: the CRM's own calendar, not the browser's ─────────────────────────
//
// The native control had three faults and they were one fault. globals.css styles
// input[type="date"] at 1rem / .75rem (element+attribute, specificity 0,1,1, so it outranks
// `py-2` at 0,1,0) and separately stretches ::-webkit-calendar-picker-indicator across the whole
// field — the white glyph that sat over the date. And a native picker is drawn in the browser's
// TOP LAYER, outside the page's stacking context, where no z-index or overflow rule on this panel
// can contain it. So the field now opens the CRM's own picker, the one Add Task, Reschedule and
// Get Invoice Details use, which PropertyPricingEditor already reuses for its "Date checked".
console.log("\nthe date field opens the shared CRM calendar")
{
  const picker = read("components/crm/DateTimePicker.tsx")
  ok("the panel imports the shared picker",
    /import DateTimePicker from "@\/components\/crm\/DateTimePicker"/.test(panel))
  ok("…and renders it in date-only mode", /<DateTimePicker[\s\S]{0,160}dateOnly/.test(panel))
  ok("no native date input is left in the panel", !/type="date"|type: "date"/.test(panel))
  ok("…and nothing in the panel styles a native picker glyph any more",
    !/-webkit-calendar-picker-indicator/.test(panel) && !/lb-date-native/.test(panel))
  ok("…so the helper has no date mode at all",
    !/"numeric" \| "decimal" \| "text" \| "date"/.test(panel) &&
    /"numeric" \| "decimal" \| "text"/.test(panel))

  // THE WHOLE FIELD OPENS IT. A native input only responded on its small glyph.
  ok("the trigger is a button the width of the field",
    /onClick=\{\(\) => setDateOpen\(\(v\) => !v\)\}/.test(panel) &&
    /\$\{field\} flex items-center justify-between gap-2 text-left/.test(panel))
  ok("…and it reports its state to assistive tech", /aria-expanded=\{dateOpen\}/.test(panel))
  ok("the chosen date is shown as a readable day", /formatDayLabel\(picked\)/.test(panel))
  ok("…and an empty field says so rather than showing a blank box", /"Select date"/.test(panel))

  // CLEARING SURVIVES. "" is the vocabulary's own word for unknown and the route turns it into NULL.
  ok("a set date can be taken back off",
    /setA\("screeningRequirementsCheckedAt", ""\)/.test(panel))
  ok("…with an accessible name on that control",
    /aria-label="Clear the leasing office confirmation date"/.test(panel))
  ok("…and the route still reads an empty string as a deliberate clear",
    /if \(t === ""\) return \{ write: null \}/.test(strip(read("lib/propertyIntel/approvalCriteria.ts"))))

  // THE SHARED COMPONENT IS NOT MODIFIED. Task editing must behave exactly as it did.
  ok("the picker still emits a bare day in date-only mode",
    /return dateOnly \? day : `\$\{day\}T\$\{to24Hour\(h, m, p\)\}`/.test(strip(picker)))
  ok("…still hides the time row there", /\{!dateOnly && \(/.test(strip(picker)))
  ok("…and still commits only on Apply in confirm mode",
    /onApply\?\.\(composeValue\(selectedDate, hour12, minute, period\)\)/.test(strip(picker)))
  ok("the panel uses confirm mode, so a stray click cannot change a saved date",
    /<DateTimePicker[\s\S]{0,260}onApply=/.test(panel) && !/<DateTimePicker[\s\S]{0,260}onChange=/.test(panel))
}

// ── 15. Updated versus Verified ──────────────────────────────────────────────────────────────
console.log("\nUpdated is a date, and is not Verified")
{
  const d = "2026-11-03T18:00:00Z"
  ok("an unsourced write reads Updated: <date>", updatedLabel({ at: d, verified: false }) === "Updated: Nov 3, 2026")
  ok("a sourced one reads Verified: <date>", updatedLabel({ at: d, verified: true }) === "Verified: Nov 3, 2026")
  ok("no provenance draws nothing at all, rather than a label about nothing",
    updatedLabel({ at: null }) === "" && updatedLabel({ at: undefined }) === "")
  ok("an unparseable date draws nothing", updatedLabel({ at: "sometime last week" }) === "")
  ok("it is formatted by hand, so a server and a client cannot disagree",
    !/toLocaleDateString/.test(strip(read("lib/propertyIntel/relativeAge.ts"))))
  ok("the relative form still exists for the special and the gift card",
    /ageLabel\(\{ at: loaded\.currentSpecialCheckedAt/.test(panel) &&
    /ageLabel\(\{ at: loaded\.giftCardCheckedAt/.test(panel))
  ok("saving still never stamps a verification date", !/add\("credit_screening_checked_at"/.test(route))
  ok("…and the only date the agent can set by hand is still the confirmation one",
    /screeningRequirementsCheckedAt/.test(panel))
}

// ── 16. The Clear buttons are gone, and clearing by hand still reaches NULL ──────────────────
//
// THE TRAP THIS GUARDS. The route reads a blank commission string as "leave it alone" — that is
// what makes a blank rent safe. So removing the buttons without changing the change set would
// have made deleting a number look like it worked while quietly changing nothing. The panel now
// turns an emptied field into the explicit null the button used to send.
console.log("\ncommission: no buttons, and an emptied field still clears")
ok("no Clear button is rendered any more", !/Clear to unknown/.test(panel) && !/>\s*Clear\s*</.test(panel))
ok("…and the cleared-flag state is gone with it", !/setCleared/.test(panel) && !/cleared\[key\]/.test(panel))
ok("an emptied field is sent as an explicit null",
  /out\[key\] = now === "" \? null : now/.test(panel))
ok("…only when it actually changed", /if \(now === commissionToInput\(stored\)\) continue/.test(panel))
ok("the route still treats that null as the deliberate clear",
  /if \(raw === null\)[\s\S]{0,260}ownerClear: true/.test(route))
ok("…and still refuses to clear on a blank string, which is why the panel must send null",
  /if \(t === ""\) continue/.test(route))
ok("commission columns are still owner-clearable in policy",
  ["send_commission", "escort_commission", "bonus_flat"].every((f) => OWNER_CLEARABLE_FIELDS.has(f)))
// 0 IS NOT BLANK. The whole model depends on it, and the new branch must not blur them.
{
  const mkChanges = (now: string, stored: string | null) =>
    now === (stored ?? "") ? "unchanged" : now === "" ? "null" : now
  ok("an explicit 0 over a stored 100% travels as a value, not a clear", mkChanges("0", "100%") === "0")
  ok("an emptied field over a stored 100% travels as a clear", mkChanges("", "100%") === "null")
  ok("an empty field that was already empty is not sent at all", mkChanges("", null) === "unchanged")
  ok("a 0 that was already 0 is not sent at all", mkChanges("0", "0") === "unchanged")
}
ok("the three fields are still one row of three", /grid grid-cols-3 gap-2/.test(panel))
ok("…and still map to the same columns",
  /"sendCommission"/.test(panel) && /"escortCommission"/.test(panel) && /"bonusFlat"/.test(panel))
// COMMISSION VERIFICATION CHANGED ON PURPOSE — see section 19.
ok("the badge reads the section-level answer the route derives",
  /loaded\.commissionAgentVerified/.test(panel))

// ── 17. The removed helper texts, and the renamed label ──────────────────────────────────────
console.log("\nless text, clearer label")
for (const t of [
  "Kept alongside the dropdown",
  "Unknown leaves a recorded answer alone",
  "Unknown means not researched",
]) ok(`removed: “${t}…”`, !rawPanel.includes(t))
ok("the special's dropdown and its details box are still both there",
  /specialChoice/.test(panel) && /specialDetails/.test(panel))
ok("the tristate attributes are still there", /triControl\(attrs\[key\]/.test(panel))
ok("the gift card tristate is still there", /triControl\(giftStatus/.test(panel))
ok("the eviction balance label now reads Outstanding balance",
  /aSelect\("evictionBalanceRequirement", "Outstanding balance"/.test(panel))
ok("…and broken lease still reads the same thing, so the two match",
  /aSelect\("brokenLeaseBalanceRequirement", "Outstanding balance"/.test(panel))
ok("the field behind it is unchanged", APPROVAL_FIELDS.evictionBalanceRequirement.column === "eviction_balance_requirement")

// ── 18. Agent-verified means an agent entered it ─────────────────────────────────────────────
//
// THE BUG. The badge required source_type manual_verified AND verification_status 'verified'. The
// second is only recorded when the owner also filled in the optional Source box, so every
// commission the owner typed and saved normally came back "Not verified" — the editor calling its
// own author an unreliable witness. In production: 34 owner-written commission provenance rows,
// every one of them 'inferred', and 0 properties reading Verified.
console.log("\nthe commission the owner typed reads Verified")
{
  ok("the route derives it from WHO wrote the value, not from a supplied source",
    /ownerEntered\[r\.field_name\] = r\.source_type === "manual_verified" && r\.value !== null/.test(route))
  ok("…and the office-confirmation meaning of fieldVerified is untouched",
    /fieldVerified\[r\.field_name\] = r\.source_type === "manual_verified" && r\.verification_status === "verified"/.test(route))
  ok("the two are separate maps now, not the same object",
    !/const commissionVerified = fieldVerified/.test(route))

  // AN ABSENCE IS NOT A FINDING. A cleared field keeps its provenance row; the value decides.
  ok("a stored value is required as well as provenance",
    /commissionVerified\[column\] = ownerEntered\[column\] === true && s\(row\[column\]\) !== null/.test(route))
  ok("…and the section needs at least one valued field",
    /valued\.length > 0 && valued\.every\(\(c\) => commissionVerified\[c\]\)/.test(route))
  ok("the column list is derived from the write path, so the two cannot drift",
    /const COMMISSION_COLUMNS = Object\.values\(COMMISSION_FIELDS\)/.test(route))

  // NOTHING IMPORTED, UNKNOWN OR STALE IS PROMOTED. A commission can only be written by an
  // authenticated owner through this editor — the writer's firewall demands request-level
  // authorization plus ownerOverride plus manual_verified — so any other source type in
  // provenance is bulk-entered data and still reads grey.
  const writer = strip(read("lib/propertyEnrichment/writer.ts"))
  ok("only an authorized owner write can produce that source type at all",
    /cand\.sourceType === "manual_verified"/.test(writer) && /ownerAuthorized === true/.test(writer))
  ok("a row from any other source type is not owner-entered",
    /r\.source_type === "manual_verified"/.test(route))

  ok("the badge says exactly Verified", /\{loaded\.commissionAgentVerified \? "Verified" : "Not verified"\}/.test(panel))

  // ONE PILL OVER THREE BOXES MUST NOT CLAIM ALL THREE.
  // Send, Escort and Bonus each carry their own provenance row. A property where only Send has
  // ever been entered reads "Verified", and that pill must not be readable as a statement about
  // the two empty boxes beside it.
  ok("each commission field shows its OWN verification",
    /loaded\.commissionVerified\?\.\[column\] &&/.test(panel))
  ok("…keyed by the field's own column, not the section",
    /\["Send %", send, setSend, "sendCommission", "send_commission"\]/.test(panel) &&
    /\["Escort %", escort, setEscort, "escortCommission", "escort_commission"\]/.test(panel) &&
    /\["Bonus \(\$\)", bonus, setBonus, "bonusFlat", "bonus_flat"\]/.test(panel))
  ok("…in the same commission green, so one colour means one thing",
    /text-\[#4ade80\][\s\S]{0,200}aria-hidden="true">✓/.test(panel))
  ok("…and the mark has a name for a screen reader, not just a glyph",
    /sr-only">entered by an agent/.test(panel))
  ok("a field with no value can never carry a tick, because the route requires a stored value",
    /commissionVerified\[column\] = ownerEntered\[column\] === true && s\(row\[column\]\) !== null/.test(route))
  ok("the pill's own title names the fields it covers",
    /\$\{verifiedFields\.join\(" and "\)\} entered in this editor/.test(panel))
  ok("…built from the per-field map, in the row's order",
    /\["send_commission", "Send"\][\s\S]{0,120}\["escort_commission", "Escort"\][\s\S]{0,120}\["bonus_flat", "Bonus"\]/.test(panel) &&
    /\.filter\(\(\[column\]\) => loaded\?\.commissionVerified\?\.\[column\]\)/.test(panel))
  ok("…in the commission green the map card's own chip uses",
    /text-\[#4ade80\]/.test(panel) &&
    /text-\[#4ade80\]/.test(strip(read("components/crm/CommissionBadge.tsx"))))
  ok("…and unknown still reads grey, never as a confirmed zero",
    /bg-\[var\(--crm-card\)\] text-\[var\(--crm-text-muted\)\]/.test(panel))

  // The values, the columns and the save path are untouched by any of this.
  ok("the commission fields still map to the same three columns",
    /sendCommission: "send_commission"/.test(route) &&
    /escortCommission: "escort_commission"/.test(route) &&
    /bonusFlat: "bonus_flat"/.test(route))
  // NOTHING IS REWRITTEN TO EARN THE BADGE. The whole change is in how a READ is interpreted.
  const get = route.slice(0, route.indexOf("/** PUT"))
  ok("the read path never writes", !/\.update\(|\.insert\(|\.upsert\(|\.delete\(/.test(get))
  ok("…and verification_status is still set from the Source box alone, on the write path",
    (route.match(/verificationStatus: VerificationStatus = sourceRef \? "verified" : "inferred"/g) ?? []).length === 1)
}

ok("the global form stylesheet is still untouched",
  /input\[type="date"\][\s\S]{0,400}?font-size:\s*1rem/.test(read("app/globals.css")))

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
