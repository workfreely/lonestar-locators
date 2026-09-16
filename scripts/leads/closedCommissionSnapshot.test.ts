// Closed-commission snapshot + publisher-platform normalization.
// Proves historical stability: a Sales Goals change never rewrites a prior close.
// Run: npx tsx scripts/leads/closedCommissionSnapshot.test.ts
import {
  estimateLeadCommission,
  resolveClosedCommissionSnapshot,
  sumClosedEstimatedCommission,
  toFrozenOrEstimate,
} from "@/lib/leads/commissionEstimate"
import { normalizeMetaPublisherPlatform } from "@/lib/meta/publisherPlatform"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

console.log("Snapshot at close uses canonical estimator + records method:")
const avgLead = { desired_rent: null }
const snapA = resolveClosedCommissionSnapshot(avgLead, "avg_commission", 1500)
ok("avg_commission → snapshot = avg", snapA.closed_estimated_commission === 1500)
ok("records method", snapA.closed_estimation_method === "avg_commission")
const budgetLead = { desired_rent: "$1,800 - $1,900" }
const snapB = resolveClosedCommissionSnapshot(budgetLead, "lead_budget", 1500)
ok("lead_budget → lower end of budget (1800)", snapB.closed_estimated_commission === 1800)
ok("lead_budget with no budget → falls back to avg", resolveClosedCommissionSnapshot({ desired_rent: "" }, "lead_budget", 1500).closed_estimated_commission === 1500)
ok("snapshot value == estimateLeadCommission (no second formula)", snapB.closed_estimated_commission === estimateLeadCommission(budgetLead, "lead_budget", 1500))

console.log("\nHistorical stability — Sales Goals change does NOT rewrite prior closes:")
// A lead closed while avg = $1,500 freezes 1500.
const closedLead = { crm_status: "closed", closed_estimated_commission: 1500, desired_rent: null }
// Later the agent raises avg to $2,000.
ok("closed lead keeps frozen 1500 even when avg is now 2000", sumClosedEstimatedCommission([closedLead], "avg_commission", 2000) === 1500)
ok("toFrozenOrEstimate prefers the frozen value", toFrozenOrEstimate(1500, closedLead, "avg_commission", 2000) === 1500)
// A brand-new OPEN lead forecasts at the NEW setting (live).
ok("open pipeline uses the NEW live estimate (2000)", estimateLeadCommission({ desired_rent: null }, "avg_commission", 2000) === 2000)
// Reclose after reopen recomputes against current settings.
ok("reclose snapshots against the NEW settings (2000)", resolveClosedCommissionSnapshot({ desired_rent: null }, "avg_commission", 2000).closed_estimated_commission === 2000)

console.log("\nPre-snapshot / legacy close falls back to a live estimate (never dropped):")
const legacyClose = { crm_status: "closed", closed_estimated_commission: null, desired_rent: null }
ok("null frozen → live estimate", sumClosedEstimatedCommission([legacyClose], "avg_commission", 1200) === 1200)
ok("mixed set sums frozen + fallback", sumClosedEstimatedCommission([closedLead, legacyClose], "avg_commission", 1200) === 1500 + 1200)
ok("numeric stored as string is coerced", sumClosedEstimatedCommission([{ closed_estimated_commission: "1750.5" }], "avg_commission", 999) === 1750.5)

console.log("\nPublisher platform — normalize known, never collapse unknown:")
ok("ig → Instagram", normalizeMetaPublisherPlatform("ig").label === "Instagram")
ok("fb → Facebook", normalizeMetaPublisherPlatform("fb").label === "Facebook")
ok("msg → Messenger", normalizeMetaPublisherPlatform("msg").label === "Messenger")
ok("an → Audience Network", normalizeMetaPublisherPlatform("an").label === "Audience Network")
ok("case/space insensitive", normalizeMetaPublisherPlatform("  IG ").label === "Instagram")
ok("empty → Unknown", normalizeMetaPublisherPlatform("").label === "Unknown" && normalizeMetaPublisherPlatform(null).key === "unknown")
ok("unknown token is surfaced, NOT forced to fb/ig", (() => { const p = normalizeMetaPublisherPlatform("whatsapp"); return p.label === "Whatsapp" && p.key === "whatsapp" })())

console.log(`\nClosed-commission snapshot unit: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
