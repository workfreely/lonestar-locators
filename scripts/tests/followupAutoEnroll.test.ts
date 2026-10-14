// FOLLOW-UP AGENT — automatic enrolment of Smart Lead Form submissions.
//
// Pure and offline. Run: `npx tsx scripts/tests/followupAutoEnroll.test.ts`
//
// Enrolment is the Follow-Up Agent's only switch: the tick already runs every minute and finds
// nothing because no lead has ever been enrolled. So the entire risk of this feature is that it
// enrols somebody it should not, and every test below is a refusal.
//
// The two that matter most:
//   • with NO configuration, nobody is enrolled — merging this code sends nothing;
//   • a lead without SMS consent is refused whatever the configuration says.

import {
  shouldAutoEnroll,
  autoEnrollPhones,
  autoEnrollGenerallyEnabled,
  AUTO_ENROLL_PHONES_FLAG,
  AUTO_ENROLL_ENABLED_FLAG,
} from "@/lib/followup/autoEnroll"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

const TEST_PHONE = "+12108955766"
const OTHER_PHONE = "+19995551234"
const base = { isNewLead: true, smsOptIn: true, accountAuthorized: true, phoneE164: TEST_PHONE }
const env = (o: Record<string, string>): NodeJS.ProcessEnv => o as NodeJS.ProcessEnv

// ── OFF BY DEFAULT ──────────────────────────────────────────────────────────────────────────
console.log("\nDisabled by default")
ok("no configuration ⇒ nobody is enrolled", shouldAutoEnroll({ ...base, env: env({}) }).enroll === false)
ok("and the reason says so", shouldAutoEnroll({ ...base, env: env({}) }).reason === "not_enabled")
ok("an empty allowlist is empty", autoEnrollPhones(env({ [AUTO_ENROLL_PHONES_FLAG]: "" })).length === 0)
ok("general activation defaults off", autoEnrollGenerallyEnabled(env({})) === false)

// ── CONSENT CANNOT BE OVERRIDDEN BY CONFIGURATION ───────────────────────────────────────────
console.log("\nConsent is not negotiable")
const allowlisted = env({ [AUTO_ENROLL_PHONES_FLAG]: TEST_PHONE })
const allOn = env({ [AUTO_ENROLL_PHONES_FLAG]: TEST_PHONE, [AUTO_ENROLL_ENABLED_FLAG]: "true" })
for (const [label, e] of [["allowlisted", allowlisted], ["generally enabled", allOn]] as const) {
  ok(`${label}: no consent ⇒ refused`, shouldAutoEnroll({ ...base, smsOptIn: false, env: e }).enroll === false)
  ok(`${label}: null consent ⇒ refused`, shouldAutoEnroll({ ...base, smsOptIn: null, env: e }).enroll === false)
  ok(`${label}: undefined consent ⇒ refused`, shouldAutoEnroll({ ...base, smsOptIn: undefined, env: e }).enroll === false)
}
ok("the refusal names consent", shouldAutoEnroll({ ...base, smsOptIn: false, env: allOn }).reason === "no_consent")

// ── THE OTHER HARD REFUSALS ─────────────────────────────────────────────────────────────────
console.log("\nOther refusals, checked before any flag")
ok("an unauthorized account is refused", shouldAutoEnroll({ ...base, accountAuthorized: false, env: allOn }).enroll === false)
ok("a resubmission is refused", shouldAutoEnroll({ ...base, isNewLead: false, env: allOn }).enroll === false)
ok("a lead with no phone is refused", shouldAutoEnroll({ ...base, phoneE164: null, env: allOn }).enroll === false)
ok("an empty phone is refused", shouldAutoEnroll({ ...base, phoneE164: "   ", env: allOn }).enroll === false)

// ── THE SUPERVISED-TEST ALLOWLIST ───────────────────────────────────────────────────────────
console.log("\nThe allowlist enrols exactly one number")
ok("the allowlisted number enrols", shouldAutoEnroll({ ...base, env: allowlisted }).enroll === true)
ok("and says why", shouldAutoEnroll({ ...base, env: allowlisted }).reason === "allowlisted")
ok(
  "ANY OTHER NUMBER IS REFUSED — this is what keeps the test isolated",
  shouldAutoEnroll({ ...base, phoneE164: OTHER_PHONE, env: allowlisted }).enroll === false,
)
ok(
  "a near-miss number is refused (exact match only)",
  shouldAutoEnroll({ ...base, phoneE164: "+1210895576", env: allowlisted }).enroll === false,
)
ok(
  "an unformatted variant is refused — the stored value is always E.164",
  shouldAutoEnroll({ ...base, phoneE164: "2108955766", env: allowlisted }).enroll === false,
)
ok("two numbers may be listed", autoEnrollPhones(env({ [AUTO_ENROLL_PHONES_FLAG]: `${TEST_PHONE}, ${OTHER_PHONE}` })).length === 2)

// ── GENERAL ACTIVATION ──────────────────────────────────────────────────────────────────────
console.log("\nGeneral activation")
ok(
  "exactly \"true\" enables every consenting submission",
  shouldAutoEnroll({ ...base, phoneE164: OTHER_PHONE, env: env({ [AUTO_ENROLL_ENABLED_FLAG]: "true" }) }).enroll === true,
)
// A flag like this must not be turned on by a truthy-looking value.
for (const v of ["TRUE ", "True", "1", "yes", "on", "enabled", "false", ""]) {
  const enrolled = shouldAutoEnroll({ ...base, phoneE164: OTHER_PHONE, env: env({ [AUTO_ENROLL_ENABLED_FLAG]: v }) }).enroll
  const expected = v.trim().toLowerCase() === "true"
  ok(`${JSON.stringify(v)} ⇒ ${expected ? "enabled" : "NOT enabled"}`, enrolled === expected)
}

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
