/**
 * Approval V1 — management-intelligence risk (evidence-only). Pure, no DB:
 *   npx tsx scripts/tests/approval.test.ts
 *
 * Row contract: Approval: [Risk] · [Mgmt] · [Key reason]
 * Rules under test: the three supplied management entries map to fixed risk + compact
 * display + key reason; unknown management is Unverified (NOT High) with the name only;
 * missing management is Unverified with NO name and NO risk inference; V1 never emits
 * High; and "Mgmt Support" (compact) is used, never "Management Support".
 */
import { evaluateApproval } from "@bc/companion-shared"

let pass = 0,
  fail = 0
const eq = (a: unknown, b: unknown, name: string) => {
  if (a === b) pass++
  else {
    fail++
    console.error("✗", `${name} (got ${JSON.stringify(a)})`)
  }
}
const ok = (c: boolean, name: string) => {
  if (c) pass++
  else {
    fail++
    console.error("✗", name)
  }
}

// ── Supplied management intelligence → fixed risk + compact display + reason ───
{
  const r = evaluateApproval({ propertyManagement: "Management Support" })
  eq(r.risk, "Low", "Management Support → Low")
  eq(r.mgmt, "Mgmt Support", "compact display 'Mgmt Support' (never 'Management Support')")
  eq(r.reason, "Second chance", "Management Support reason")
}
{
  const r = evaluateApproval({ propertyManagement: "Abbey Residential" })
  eq(r.risk, "Moderate", "Abbey → Moderate")
  eq(r.mgmt, "Abbey", "Abbey compact display")
  eq(r.reason, "Conditional deposit", "Abbey reason")
}
{
  const r = evaluateApproval({ propertyManagement: "Willow Bridge Property Management" })
  eq(r.risk, "Low", "Willow Bridge → Low")
  eq(r.mgmt, "Willow Bridge", "Willow Bridge compact display")
  eq(r.reason, "1099 friendly", "Willow Bridge reason")
}

// ── Unknown management → Unverified + name, NO risk inference (never High) ─────
{
  const r = evaluateApproval({ propertyManagement: "Greystar Management LLC" })
  eq(r.risk, "Unverified", "unknown management → Unverified (NOT High)")
  eq(r.mgmt, "Greystar", "unknown name shown compactly (suffixes trimmed)")
  eq(r.reason, null, "unknown management has no key reason")
}

// ── Missing management → Unverified, no name, no inference (never penalizes) ───
{
  const r = evaluateApproval({ propertyManagement: null })
  eq(r.risk, "Unverified", "missing management → Unverified")
  eq(r.mgmt, null, "missing management shows no name")
  eq(r.reason, null, "missing management has no reason")
}
{
  const r = evaluateApproval({})
  eq(r.risk, "Unverified", "absent field → Unverified")
  eq(r.mgmt, null, "absent field shows no name")
}

// ── V1 never fabricates High ──────────────────────────────────────────────────
{
  const samples = ["Management Support", "Abbey Residential", "Willow Bridge", "Greystar", "", "Random Co"]
  ok(samples.every((m) => evaluateApproval({ propertyManagement: m }).risk !== "High"), "V1 never produces High")
}

// ── Case-insensitive substring match against the SAD text ─────────────────────
{
  const r = evaluateApproval({ propertyManagement: "  ABBEY residential communities  " })
  eq(r.risk, "Moderate", "match is case-insensitive + trims whitespace")
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
