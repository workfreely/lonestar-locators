// INTERNAL COMPLIMENTARY ACCESS — the entitlement state machine.
//
// Pure and offline. Run: `npx tsx scripts/tests/complimentaryAccess.test.ts`
//
// ── WHAT THIS GUARDS ────────────────────────────────────────────────────────────────────────
// Adding a fourth access source to a gate that protects every paying subscriber has exactly two
// ways of going wrong, and the tests below exist for those two:
//
//   1. IT GRANTS TOO MUCH. An absent, null or merely truthy value must never entitle anyone. Every
//      existing caller omits the field, so "omitted" has to behave precisely as it did before.
//   2. IT CHANGES SOMEONE ELSE'S ANSWER. A paying, trialing, cancelled, past-due or expired account
//      must reach the same verdict it reached before this field existed.
//
// Each assertion below was verified to fail with its branch removed.

import { getAccessState, type BillingProfile } from "@/lib/billing/access"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

const future = new Date(Date.now() + 7 * 864e5).toISOString()
const past = new Date(Date.now() - 7 * 864e5).toISOString()
const state = (p: BillingProfile) => getAccessState(p)

// ── the new source ──────────────────────────────────────────────────────────────────────────
console.log("\nComplimentary access")
ok(
  "a grant entitles an account with no subscription and no trial",
  state({ subscription_status: null, trial_ends_at: null, complimentary_access: true }).allowed === true,
)
ok(
  "and it reports its own reason, not 'subscribed' or 'organization'",
  state({ subscription_status: null, trial_ends_at: null, complimentary_access: true }).reason === "complimentary",
)
ok(
  "it survives an EXPIRED trial — the grant is independent of trial state",
  state({ subscription_status: "trialing", trial_ends_at: past, complimentary_access: true }).allowed === true,
)
ok(
  "it survives a CANCELED subscription",
  state({ subscription_status: "canceled", trial_ends_at: null, complimentary_access: true }).allowed === true,
)
ok(
  "it survives PAST_DUE",
  state({ subscription_status: "past_due", trial_ends_at: null, complimentary_access: true }).allowed === true,
)

// ── it must not grant on anything other than an explicit true ───────────────────────────────
console.log("\nOnly an explicit true grants")
ok("false does not grant", state({ subscription_status: null, trial_ends_at: null, complimentary_access: false }).allowed === false)
ok("null does not grant", state({ subscription_status: null, trial_ends_at: null, complimentary_access: null }).allowed === false)
ok("omitted does not grant", state({ subscription_status: null, trial_ends_at: null }).allowed === false)
// A truthy-but-not-true value is the classic way a flag leaks. The type forbids it; the runtime
// check is what actually holds, because this value arrives from a database row.
ok(
  "a truthy non-boolean does not grant",
  state({ subscription_status: null, trial_ends_at: null, complimentary_access: 1 as unknown as boolean }).allowed === false,
)
ok(
  "the string \"false\" does not grant",
  state({ subscription_status: null, trial_ends_at: null, complimentary_access: "false" as unknown as boolean }).allowed === false,
)

// ── NOBODY ELSE'S VERDICT MOVES ─────────────────────────────────────────────────────────────
// The same inputs that existed before the field, with the field absent, must give the same answers.
console.log("\nEveryone else is unaffected")
const unchanged: Array<[string, BillingProfile, boolean, string]> = [
  ["paid subscriber", { subscription_status: "active", trial_ends_at: null }, true, "subscribed"],
  ["live trial", { subscription_status: "trialing", trial_ends_at: future }, true, "trialing"],
  ["active network member", { subscription_status: null, trial_ends_at: null, organization_status: "active" }, true, "organization"],
  ["pending network member", { subscription_status: null, trial_ends_at: null, organization_status: "pending" }, false, "no_subscription"],
  ["cancelled", { subscription_status: "canceled", trial_ends_at: null }, false, "canceled"],
  ["past due", { subscription_status: "past_due", trial_ends_at: null }, false, "past_due"],
  ["expired trial", { subscription_status: "trialing", trial_ends_at: past }, false, "trial_expired"],
  ["never subscribed", { subscription_status: null, trial_ends_at: null }, false, "no_subscription"],
]
for (const [label, profile, allowed, reason] of unchanged) {
  const s = state(profile)
  ok(`${label}: ${allowed ? "allowed" : "denied"} / ${reason}`, s.allowed === allowed && s.reason === reason)
}

// ── precedence: a real subscription is still reported as a subscription ─────────────────────
// If complimentary were checked first, a paying customer would read as a freebie and the billing
// page would tell them the wrong thing about their own account.
console.log("\nPrecedence")
ok(
  "a paying subscriber with a grant still reads as 'subscribed'",
  state({ subscription_status: "active", trial_ends_at: null, complimentary_access: true }).reason === "subscribed",
)
ok(
  "a live trial with a grant still reads as 'trialing'",
  state({ subscription_status: "trialing", trial_ends_at: future, complimentary_access: true }).reason === "trialing",
)

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
