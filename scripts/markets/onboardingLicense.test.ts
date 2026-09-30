// PASS 3 — Texas licence collection on the existing Business Profile step.
//
// Additive only: one field and one status chip inserted at the existing State →
// Markets seam. No new step, no new storage, no new verification system, and no
// access gating. These are source-level guards because the step is a large client
// component with no harness; each is mutation-tested.
//
// Run: npx tsx scripts/markets/onboardingLicense.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { TOTAL_STEPS, NUMBERED_STEPS } from "@/app/onboarding/_lib/types"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const STEP = "app/onboarding/_components/steps/StepBusinessProfile.tsx"
const step = strip(read(STEP))
const rawStep = read(STEP)
const types = strip(read("app/onboarding/_lib/types.ts"))
const wizard = strip(read("app/onboarding/_components/OnboardingWizard.tsx"))
const page = strip(read("app/onboarding/page.tsx"))

console.log("no new step, no new storage:")
ok("step count unchanged (6 internal, 5 numbered)", TOTAL_STEPS === 6 && NUMBERED_STEPS === 5)
ok("no new onboarding step component was added", !/Step(License|Verification)/.test(wizard))
ok("licence reuses profiles.license_number — no second column invented",
  /license_number/.test(types) && !/licence_number|license_no\b|licenseNum(?!ber)/.test(types))

console.log("\nthe verification stamp can never be written by the wizard:")
// finish() spreads OnboardingData straight into a profiles UPDATE, so anything in
// that type is a column the client writes. The guard trigger rejects a user write to
// license_verified_at, which would break the final onboarding step.
ok("finish() still spreads OnboardingData into a profiles update", /update\(\{\s*\.\.\.data,/.test(wizard))
ok("license_verified_at is NOT in OnboardingData", !/license_verified_at\s*:/.test(types))
ok("it travels as a separate read-only prop instead", /licenseVerifiedAt: string \| null/.test(wizard))
ok("the wizard passes it to the step", /<StepBusinessProfile [^>]*licenseVerifiedAt=\{licenseVerifiedAt\}/.test(wizard))
ok("it is never merged into the patched data", !/license_verified_at/.test(wizard))

console.log("\nreuse + pre-populate (never re-ask for what is already known):")
ok("page.tsx seeds the saved number", /license_number: profile\?\.license_number \?\? ""/.test(page))
ok("page.tsx passes the saved verification stamp", /licenseVerifiedAt=\{profile\?\.license_verified_at \?\? null\}/.test(page))
ok("the field initialises FROM the saved value", /useState\(data\.license_number\)/.test(step))
ok("verification is derived from the stamp, not re-entered", /const licenseVerified = !!licenseVerifiedAt/.test(step))

console.log("\npersistence goes through the canonical profile path:")
ok("the number rides the SAME onNext patch as license_state",
  /license_state: licenseState,[\s\S]{0,220}license_number: licenseNumber\.trim\(\)/.test(step))
ok("it is sent ONLY while unverified — a frozen column is never written back",
  /\.\.\.\(licenseVerified \? \{\} : \{ license_number: licenseNumber\.trim\(\) \}\)/.test(step))
ok("no new API route or RPC was introduced for licences",
  !/fetch\(["'`]\/api\/[^"'`]*licen/i.test(step) && !/rpc\(["'`]lb_verify_license/.test(step))
ok("the market write path is untouched", /rpc\("set_workspace_service_areas"/.test(step))

console.log("\nplacement — State → Licence → Markets on the existing screen:")
{
  const iState = step.indexOf("<label className={labelClass}>State</label>")
  const iLic = step.indexOf("Texas Real Estate License Number")
  const iMarkets = step.indexOf("stateMarkets.map(")
  ok("all three anchors found", iState > 0 && iLic > 0 && iMarkets > 0)
  ok("the licence sits AFTER State", iLic > iState)
  ok("the licence sits BEFORE Markets", iLic < iMarkets)
}
ok("it reuses the screen's own label/input classes, not new ones",
  /<label className=\{labelClass\}>Texas Real Estate License Number<\/label>/.test(step) && /\$\{inputClass\}/.test(step))
ok("the market selector markup is unchanged", /{stateMarkets\.map\(\(m\) => \{/.test(step))

console.log("\nstatus derivation — none / Pending / Verified:")
ok("verified renders the Verified chip", /licenseVerified \? \([\s\S]{0,260}Verified/.test(step))
ok("a number with no verification renders Pending verification", /licenseNumber\.trim\(\) \?[\s\S]{0,260}Pending verification/.test(step))
ok("an empty field renders no status at all", /: null\}/.test(step))
ok("Verified reuses the Profile page's green treatment", /#0f9d58/.test(step) && /#0f9d58/.test(read("components/crm/profile/ProfileClient.tsx")))

console.log("\nverified users keep the existing security semantics:")
ok("the input is read-only when verified", /readOnly=\{licenseVerified\}/.test(step))
ok("it is not re-enabled by any client-side branch", !/readOnly=\{false\}/.test(step))
ok("the DB guard trigger was NOT touched by this pass — protection stays server-side",
  !/lb_guard_verified_license/.test(step) && !/lb_guard_verified_license/.test(wizard))

console.log("\nNO ACCESS GATING IN THIS PASS:")
for (const [label, f] of [["middleware", "middleware.ts"], ["TS access helper", "lib/billing/access.ts"]] as const) {
  const src = strip(read(f))
  ok(`${label} carries no licence logic`, !/license_verified_at|licenseVerified|license_number/.test(src))
}
ok("the step starts/stops no trial", !/trial/i.test(step))
ok("the step adds no verification redirect", !/verification-pending|\/verify/.test(step))

console.log("\nevery CSS variable the new markup uses actually resolves:")
{
  const beast = read("app/locator-beast/beast.css")
  const used = [...new Set((rawStep.match(/var\(--beast-[a-z-]+\)/g) ?? []))]
  const missing = used.filter((v) => !beast.includes(`${v.slice(4, -1)}:`))
  ok(`all ${used.length} beast tokens defined (no invented token)`, missing.length === 0)
  if (missing.length) console.log("      missing: " + missing.join(", "))
}

console.log(`\nOnboarding licence: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
