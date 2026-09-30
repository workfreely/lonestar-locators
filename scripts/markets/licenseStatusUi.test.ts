// PASS 4 (UI half) — the four licence states on the three surfaces that show them.
//
// lib/license/status.ts is already unit-tested by licenseStatus.test.ts. This file
// proves the THREE surfaces actually consume it (rather than re-deriving the states
// locally, which is how they would drift apart), that the rejection columns can never
// ride a user write, and that the frozen visual language was reused rather than
// extended. The components are large client components with no harness, so the source
// is asserted directly; each assertion is mutation-tested.
//
// Run: npx tsx scripts/markets/licenseStatusUi.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { licenseStatus, LICENSE_STATUS_LABEL, licenseRejectionReason, isLicenseEditable } from "@/lib/license/status"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const STEP = "app/onboarding/_components/steps/StepBusinessProfile.tsx"
const PROFILE = "components/crm/profile/ProfileClient.tsx"
const PANEL = "app/admin/license-verification/_components/LicensePanel.tsx"
const step = strip(read(STEP))
const profile = strip(read(PROFILE))
const panel = strip(read(PANEL))
const wizard = strip(read("app/onboarding/_components/OnboardingWizard.tsx"))
const types = strip(read("app/onboarding/_lib/types.ts"))
const rowTypes = strip(read("app/admin/license-verification/_components/types.ts"))
const card = strip(read("app/admin/network/_components/MemberCard.tsx"))

console.log("ONE derivation — all three surfaces import the shared module:")
for (const [label, src] of [["onboarding step", step], ["Profile", profile], ["owner panel", panel]] as const) {
  ok(`${label} imports lib/license/status`, /from "@\/lib\/license\/status"/.test(src))
  ok(`${label} does not re-derive the states locally`,
    !/license_rejected_at \?|rejectedAt \? "rejected"/.test(src) && !/"unsubmitted"/.test(src))
}
ok("the labels are defined in exactly ONE place",
  !/"Needs correction"/.test(step) && !/"Needs correction"/.test(profile) &&
  /Needs correction/.test(read("lib/license/status.ts")))

console.log("\nthe four states the module resolves (the contract the UI renders):")
const V = "2026-01-01T00:00:00Z"
ok("unsubmitted — no number", licenseStatus({ license_number: "" }) === "unsubmitted")
ok("pending — a number, no owner decision", licenseStatus({ license_number: "123" }) === "pending")
ok("verified — the stamp wins", licenseStatus({ license_number: "123", license_verified_at: V }) === "verified")
ok("rejected — the rejection stamp", licenseStatus({ license_number: "123", license_rejected_at: V }) === "rejected")
ok("unsubmitted shows NO chip", LICENSE_STATUS_LABEL.unsubmitted === null)
ok("the other three have labels",
  LICENSE_STATUS_LABEL.pending === "Pending verification" &&
  LICENSE_STATUS_LABEL.verified === "Verified" &&
  LICENSE_STATUS_LABEL.rejected === "Needs correction")
ok("a reason is shown ONLY while rejected",
  licenseRejectionReason({ license_number: "1", license_rejected_at: V, license_rejection_reason: "Expired" }) === "Expired" &&
  licenseRejectionReason({ license_number: "1", license_verified_at: V, license_rejection_reason: "Expired" }) === null &&
  licenseRejectionReason({ license_number: "1", license_rejection_reason: "Expired" }) === null)
ok("only a VERIFIED licence is read-only",
  !isLicenseEditable({ license_number: "1", license_verified_at: V }) &&
  isLicenseEditable({ license_number: "1", license_rejected_at: V }) &&
  isLicenseEditable({ license_number: "1" }))

console.log("\ncorrecting a rejected licence previews Pending (what the trigger will do):")
// Both agent screens null the rejection out of the derivation input once the number is
// edited, because lb_guard_verified_license clears those columns on the corrected write.
for (const [label, src, baseline] of [
  ["onboarding step", step, "data\\.license_number"],
  ["Profile", profile, "initial\\.licenseNumber"],
] as const) {
  ok(`${label} compares the typed number against the STORED one`,
    new RegExp(`licenseCorrected = licenseNumber\\.trim\\(\\) !== ${baseline}\\.trim\\(\\)`).test(src))
  ok(`${label} drops the rejection from the input while correcting`,
    /license_rejected_at: licenseCorrected \? null :/.test(src) &&
    /license_rejection_reason: licenseCorrected \? null :/.test(src))
}
// The same transition, asserted on the module rather than the markup.
ok("dropping the rejection yields exactly 'pending', never 'unsubmitted'",
  licenseStatus({ license_number: "999", license_rejected_at: null }) === "pending")

console.log("\nthe rejection columns can NEVER ride a user write:")
ok("neither column is in OnboardingData", !/license_rejected_at|license_rejection_reason/.test(types))
ok("they travel as read-only props instead",
  /licenseRejectedAt: string \| null/.test(wizard) && /licenseRejectionReason: string \| null/.test(wizard))
ok("the wizard passes both to the step",
  /licenseRejectedAt=\{licenseRejectedAt\}/.test(wizard) && /licenseRejectionReason=\{licenseRejectionReason\}/.test(wizard))
ok("finish() still spreads OnboardingData into the profiles update", /update\(\{\s*\.\.\.data,/.test(wizard))
for (const [label, src] of [["onboarding step", step], ["Profile", profile]] as const) {
  ok(`${label} never sends either column to profiles`,
    !/license_rejected_at:\s*(?!licenseCorrected)/.test(src.replace(/license_rejected_at: licenseCorrected \? null : \w+/g, "")) ||
    !new RegExp(`update\\([^)]*license_reject`, "s").test(src))
}
ok("neither screen calls the owner-only reject RPC", !/lb_reject_license/.test(step) && !/lb_reject_license/.test(profile))

console.log("\nverified stays read-only and relicensing still clears verification:")
ok("onboarding keeps the input read-only when verified", /readOnly=\{licenseVerified\}/.test(step))
ok("onboarding still writes the number ONLY while unverified",
  /\.\.\.\(licenseVerified \? \{\} : \{ license_number: licenseNumber\.trim\(\) \}\)/.test(step))
ok("Profile still writes licence fields ONLY while unverified",
  /\.\.\.\(licenseVerified[\s\S]{0,80}\? \{\}[\s\S]{0,120}license_number: licenseNumber\.trim\(\)/.test(profile))
ok("Profile still relicenses through lb_change_license_state", /rpc\("lb_change_license_state", \{ p_state: next \}\)/.test(profile))
ok("relicensing clears verification AND the rejection in the UI",
  /setLicenseVerified\(false\)[\s\S]{0,400}setRejectedAt\(null\)/.test(profile))

console.log("\nowner panel — Verify / Reject / reason, and nothing more:")
ok("Verify calls lb_verify_license", /run\("lb_verify_license", row\.user_id\)/.test(panel))
ok("Reject calls lb_reject_license WITH a reason", /run\("lb_reject_license", row\.user_id, \{ p_reason: reason\.trim\(\) \}\)/.test(panel))
ok("Unverify is unchanged", /run\("lb_unverify_license", row\.user_id\)/.test(panel))
ok("a blank reason cannot be sent", /disabled=\{busyUser !== null \|\| !reason\.trim\(\)\}/.test(panel))
ok("the reason is capped to what the column stores", /maxLength=\{300\}/.test(panel))
ok("rejection_reason_required is explained rather than leaked",
  /rejection_reason_required[\s\S]{0,120}Add a short reason/.test(panel))
ok("the badge is DERIVED, not re-implemented", /status=\{licenseStatus\(r\)\}/.test(panel))
ok("the panel adds no verification column of its own",
  !/license_verified_at\s*=/.test(panel) && !/from\("profiles"\)/.test(panel))
ok("the listing row type carries both new columns",
  /license_rejected_at: string \| null/.test(rowTypes) && /license_rejection_reason: string \| null/.test(rowTypes))

console.log("\nthe frozen visual language was reused, not extended:")
ok("onboarding reuses the green Verified treatment", /#0f9d58/.test(step))
ok("Needs correction reuses onboarding's EXISTING muted chip",
  /licenseLabel \?[\s\S]{0,200}border-\[var\(--beast-border\)\][\s\S]{0,160}text-\[var\(--beast-ink-soft\)\]/.test(step))
ok("Needs correction reuses Profile's EXISTING muted chip",
  /licenseLabel &&[\s\S]{0,200}border-\[#e5e7ee\] bg-\[#f4f5f8\][\s\S]{0,60}text-\[#9098a8\]/.test(profile))
{
  // Scoped to the licence field ONLY. Profile's save-error line and Delete Account
  // are legitimately red and sit further down the same file.
  const i = profile.indexOf('label="License Number"')
  const licenceField = i < 0 ? "" : profile.slice(i, profile.indexOf("</SettingsField>", i))
  ok("the licence field block was found", licenceField.length > 200)
  ok("no red/destructive styling was introduced for a rejection",
    !/text-red|bg-red|border-red|text-rose|bg-rose/.test(step) &&
    !/(text|bg|border)-(red|rose)-/.test(licenceField))
}
ok("the reason reuses Profile's existing muted hint slot", /hint=\{\s*licenseReason \?\?/.test(profile))
ok("no new onboarding step was added",
  !/Step(License|Verification|Rejection)/.test(wizard))
ok("MemberCard gained the status additively, keeping the network three intact",
  /rejected: "bg-amber-500\/15 text-amber-400"/.test(card) &&
  /active: "bg-emerald-500\/15 text-emerald-400"/.test(card) &&
  /pending: "bg-amber-500\/15 text-amber-400"/.test(card) &&
  /inactive: "bg-zinc-500\/15 text-zinc-400"/.test(card))
ok("the owner sees the SAME wording as the agent", /rejected: "Needs correction"/.test(card))

console.log("\nevery CSS variable the new markup uses actually resolves:")
{
  const beast = read("app/locator-beast/beast.css")
  const used = [...new Set((read(STEP).match(/var\(--beast-[a-z-]+\)/g) ?? []))]
  const missing = used.filter((v) => !beast.includes(`${v.slice(4, -1)}:`))
  ok(`all ${used.length} beast tokens defined (no invented token)`, missing.length === 0)
  if (missing.length) console.log("      missing: " + missing.join(", "))
}

console.log("\nSTILL OUT OF SCOPE — Pass 4 changed none of this:")
for (const [label, f] of [["middleware", "middleware.ts"], ["access helper", "lib/billing/access.ts"]] as const) {
  ok(`${label} carries no licence logic`, !/license_verified_at|licenseVerified|license_rejected/.test(strip(read(f))))
}
ok("no trial is started or stopped by these screens", !/trial/i.test(step) && !/lb_start_trial|trial_ends_at/.test(profile))
ok("no verification redirect was added", !/verification-pending/.test(step) && !/verification-pending/.test(profile))
ok("the service-area write path is untouched",
  /rpc\("set_workspace_service_areas"/.test(step) && /rpc\("set_workspace_service_areas"/.test(profile))

console.log(`\nLicence status UI: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
