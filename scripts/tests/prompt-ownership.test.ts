/**
 * Interactive-prompt ownership proofs (pure logic + source invariants, no DB/UI).
 * Enforces: one workflow event → one interactive owner; the non-owning surface
 * never opens the same interactive decision. Also asserts the CRM/Companion mirrors
 * are identical and the legacy CRM workflow-button panel stays disabled.
 *
 *   npx tsx scripts/tests/prompt-ownership.test.ts
 */
import { readFileSync } from "node:fs"
import {
  WORKFLOW_PROMPT_OWNER as CRM_MAP,
  workflowPromptOwner,
  isCompanionOwned,
  isCrmOwned,
  crmMayConfirm,
  companionMayConfirm,
} from "../../lib/workflow/promptOwnership"
import { WORKFLOW_PROMPT_OWNER as COMPANION_MAP } from "../../packages/companion-shared/src/workflow/promptOwnership"

let failures = 0
function ok(c: boolean, m: string) { if (!c) { failures++; console.error("✗", m) } else console.log("✓", m) }

// ── Map totality + single owner per prompt ────────────────────────────────────
const ids = Object.keys(CRM_MAP) as (keyof typeof CRM_MAP)[]
ok(ids.length >= 17, "ownership map covers every audited interactive prompt")
ok(ids.every((id) => CRM_MAP[id] === "companion" || CRM_MAP[id] === "crm"), "every prompt has exactly one owner (companion|crm)")

// ── Companion owns the traveling confirmations ────────────────────────────────
for (const id of ["contact_outcome", "build_list_choice", "list_built", "send_list", "contact_follow_up", "post_list_follow_up", "schedule_tour"] as const) {
  ok(workflowPromptOwner(id) === "companion", `${id} → Companion-owned`)
  ok(companionMayConfirm(id) === true, `${id}: Companion may confirm`)
}

// ── CRM owns the contextual/heavy operations ──────────────────────────────────
for (const id of ["guest_card", "application", "confirm_lease", "invoice_details", "send_invoice", "commission_paid", "send_rebate", "tour_follow_up", "timezone_confirm", "archive"] as const) {
  ok(workflowPromptOwner(id) === "crm", `${id} → CRM-owned`)
  ok(isCrmOwned(id) && companionMayConfirm(id) === false, `${id}: Companion never confirms (delegates via verb)`)
  ok(crmMayConfirm(id, false) === true, `${id}: CRM confirms it (no initiation needed)`)
}

// ── The core no-duplicate rule for Companion-owned prompts ─────────────────────
// The CRM must NOT spontaneously confirm a Companion-owned prompt.
for (const id of ["send_list", "list_built", "contact_follow_up", "post_list_follow_up", "build_list_choice", "schedule_tour"] as const) {
  ok(crmMayConfirm(id, false) === false, `CRM must NOT spontaneously confirm ${id}`)
  ok(crmMayConfirm(id, true) === false, `CRM cannot confirm ${id} even if CRM-initiated (not a sanctioned exception)`)
}

// ── The ONE sanctioned CRM-initiated exception: contact_outcome via manual drag ──
ok(crmMayConfirm("contact_outcome", false) === false, "contact_outcome: CRM must NOT confirm spontaneously")
ok(crmMayConfirm("contact_outcome", true) === true, "contact_outcome: CRM MAY confirm when CRM-initiated (New→Contacted drag)")
ok(isCompanionOwned("contact_outcome"), "contact_outcome is Companion-owned (drag is the exception, not the default)")

// ── Mirror parity: the CRM and Companion maps must be identical ───────────────
ok(JSON.stringify(CRM_MAP) === JSON.stringify(COMPANION_MAP), "CRM and Companion ownership maps are identical (no drift)")

// ── The legacy CRM workflow-button Lead Panel stays OFF in production ──────────
// (SHOW_LEGACY_LEAD_PANEL=false is what neutralizes the prior audit's duplicate CRM
// Contact/Build/Send/FU buttons — assert it hasn't been re-enabled.)
const dash = readFileSync(new URL("../../components/crm/DashboardClient.tsx", import.meta.url), "utf8")
ok(/const\s+SHOW_LEGACY_LEAD_PANEL\s*=\s*false/.test(dash), "SHOW_LEGACY_LEAD_PANEL === false (legacy CRM workflow panel not rendered)")
// The CRM contact-confirmation opener is gated by the ownership helper.
ok(/crmMayConfirm\("contact_outcome",\s*\/\* initiatedInCrm \*\/\s*true\)/.test(dash), "CRM drag contact confirmation is gated by crmMayConfirm(contact_outcome, true)")

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
