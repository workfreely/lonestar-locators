// PASS 6 — the licence-verification destination for the agent.
//
// Covers the ten stated regression requirements. Requirement 1 is exercised against
// the REAL middleware; the four display states are exercised against the REAL
// derivation module with the exact props the page builds; the rest are asserted on
// source, and every source assertion is mutation-tested.
//
// Run: npx tsx scripts/auth/verifyLicensePage.test.ts
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=")
  if (i > 0 && !line.trimStart().startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim()
}

import { NextRequest } from "next/server"
import { middleware } from "@/middleware"
import { licenseStatus, LICENSE_STATUS_LABEL, licenseRejectionReason } from "@/lib/license/status"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const PAGE = "app/verify-license/page.tsx"
const CLIENT = "app/verify-license/_components/VerifyLicenseClient.tsx"
const LAYOUT = "app/verify-license/layout.tsx"
const page = strip(read(PAGE))
const client = strip(read(CLIENT))
const mw = strip(read("middleware.ts"))

async function main() {
  console.log("route exists at one canonical authenticated path:")
  for (const f of [PAGE, CLIENT, LAYOUT]) ok(`${f} exists`, existsSync(path.join(process.cwd(), f)))
  ok("it does NOT collide with the owner's review queue",
    existsSync(path.join(process.cwd(), "app/admin/license-verification/page.tsx")) &&
    !existsSync(path.join(process.cwd(), "app/verify-license/_components/LicensePanel.tsx")))
  ok("no second onboarding wizard was created",
    !/OnboardingWizard|StepCard|StepNav|TOTAL_STEPS/.test(client) && !/OnboardingWizard/.test(page))

  console.log("\n1+10. AUTHENTICATION — Pass 5 boundary covers it, and still covers everything else:")
  {
    const anon = async (p: string) => {
      const res = await middleware(new NextRequest(new URL(p, "https://locatorbeast.com"), { headers: { host: "locatorbeast.com" } }))
      return { status: res.status, location: res.headers.get("location"), rewrite: res.headers.get("x-middleware-rewrite") }
    }
    const toLogin = (r: { status: number; location: string | null }) =>
      (r.status === 307 || r.status === 302) && (r.location ?? "").endsWith("/login")

    ok("/verify-license anonymous → 307 /login (server-side)", toLogin(await anon("/verify-license")))
    ok("it is in the Pass 5 protected pattern", /\(admin\|onboarding\|billing\|verify-license\|help\)/.test(mw))
    ok("it is an APP path, so the marketing host does not rewrite it to a 404",
      /\|billing\|verify-license\|smart-lead-form\|/.test(mw))
    ok("it is NOT rewritten under /locator-beast", ((await anon("/verify-license")).rewrite ?? "") === "")
    // Pass 5 behaviour must be untouched.
    for (const p of ["/admin", "/admin/leads", "/onboarding", "/billing", "/help"]) {
      ok(`Pass 5 still redirects ${p}`, toLogin(await anon(p)))
    }
    for (const p of ["/", "/features", "/login", "/signup", "/smart-lead-form"]) {
      ok(`Pass 5 still leaves ${p} public`, !toLogin(await anon(p)))
    }
    ok("the page ALSO checks auth itself (no client-only auth dependency)",
      /auth\.getUser\(\)/.test(page) && /if \(!user\) redirect\("\/login"\)/.test(page))
    ok("auth is decided on the SERVER — the client component never gates on a session",
      !/getSession|onAuthStateChange/.test(client))
  }

  console.log("\n2+3+4+5. THE FOUR STATES, derived by the shared module from the page's own props:")
  {
    // Exactly the object app/verify-license builds for the client component.
    const props = (n: string, rejectedAt: string | null = null, reason: string | null = null) => ({
      license_number: n, license_verified_at: null, license_rejected_at: rejectedAt, license_rejection_reason: reason,
    })
    ok("2. empty number → unsubmitted", licenseStatus(props("")) === "unsubmitted")
    ok("3. a saved number → pending (and is what pre-populates the input)", licenseStatus(props("0123456")) === "pending")
    ok("4. pending label is the existing vocabulary", LICENSE_STATUS_LABEL.pending === "Pending verification")
    ok("5. a rejection → rejected", licenseStatus(props("0123456", "2026-09-20T00:00:00Z", "Not on the TREC registry")) === "rejected")
    ok("5. the stored reason is what surfaces",
      licenseRejectionReason(props("0123456", "2026-09-20T00:00:00Z", "Not on the TREC registry")) === "Not on the TREC registry")
    ok("rejected label is the existing vocabulary", LICENSE_STATUS_LABEL.rejected === "Needs correction")

    ok("the page seeds the input from the SAVED number (no re-asking)",
      /licenseNumber: profile\?\.license_number \?\? ""/.test(page))
    ok("the input initialises from that prop", /useState\(initial\.licenseNumber\)/.test(client))
    ok("the saved licence STATE is reused, not re-asked",
      /licenseState: profile\?\.license_state \?\? ""/.test(page) && !/<select/.test(client))
    ok("all three states render distinct copy", /unsubmitted: \{[\s\S]{0,200}pending: \{[\s\S]{0,260}rejected: \{/.test(client))
    ok("the stored reason is rendered", /\{reason\}/.test(client))
    ok("status + reason come from the shared module, not a local re-derivation",
      /from "@\/lib\/license\/status"/.test(client) && /licenseStatus\(stored\)/.test(client) && !/"unsubmitted"\s*:/.test(client))
    // Pass 7 added the out_of_state page state, which is not a LicenseStatus, so the
  // chip now reads a small local map BUILT FROM the shared labels.
  ok("the chip still reuses LICENSE_STATUS_LABEL as its source",
    /CHIP\[status\]/.test(client) &&
    /unsubmitted: LICENSE_STATUS_LABEL\.unsubmitted/.test(client) &&
    /rejected: LICENSE_STATUS_LABEL\.rejected/.test(client))
  }

  console.log("\n6. CORRECTING a rejection returns to Pending via the EXISTING trigger:")
  ok("the client writes only license_number (+ state when unset)",
    /update\(\{\s*license_number: licenseNumber\.trim\(\),\s*\.\.\.\(initial\.licenseState \? \{\} : \{ license_state: LAUNCH_LICENSE_STATE \}\)/.test(client))
  {
    // Scoped to the UPDATE payload only. The component also builds a READ-ONLY object
    // named `stored` that legitimately carries those field names as derivation input —
    // asserting against the whole file would confuse reading them with writing them.
    const i = client.indexOf(".update({")
    const payload = i < 0 ? "" : client.slice(i, client.indexOf("})", i))
    ok("the update payload was located", payload.length > 20)
    ok("it NEVER writes the rejection columns — the trigger owns clearing them",
      !/license_rejected_at/.test(payload) && !/license_rejection_reason/.test(payload))
    ok("it never writes the verification stamp", !/license_verified_at/.test(payload))
    ok("the payload writes ONLY the licence number and an unset state",
      /^[\s\S]*license_number[\s\S]*license_state[\s\S]*$/.test(payload) &&
      (payload.match(/license_/g) ?? []).length === 2)
  }
  ok("it re-derives from the server after saving rather than faking the transition",
    /router\.refresh\(\)/.test(client))
  ok("no second 'resubmit' status was invented",
    !/resubmitted|"resubmit"|awaiting_resubmission/.test(client))
  ok("no new RPC or table was introduced",
    !/\.rpc\(/.test(client) && !/from\("license/.test(client) && !/lb_verify_license|lb_reject_license/.test(client))
  ok("it reuses the SAME storage path as Profile (a plain profiles UPDATE)",
    /from\("profiles"\)\s*\.update\(/.test(client) && /from\("profiles"\)/.test(strip(read("components/crm/profile/ProfileClient.tsx"))))

  console.log("\n7. A VERIFIED user never sees this page:")
  // Pass 7: the question became "does this user pass the launch gate?" so a verified
  // NON-Texas licence stays here instead of bouncing.
  ok("a user who PASSES the gate is redirected server-side",
    /if \(passesLicenseGate\(profile\)\) redirect\(WORKSPACE\)/.test(page))
  ok("to the existing canonical destination, not a new one",
    /const WORKSPACE = "\/admin\/leads"/.test(page) && /redirect\("\/admin\/leads"\)/.test(strip(read("app/onboarding/page.tsx"))))
  ok("a verified TEXAS licence still never renders this page",
    /if \(passesLicenseGate\(profile\)\) redirect\(WORKSPACE\)/.test(page) &&
    /derived === "verified" \? "out_of_state" : derived/.test(client))

  console.log("\n8. NO TRIAL CHANGE:")
  for (const [label, src] of [["page", page], ["client", client]] as const) {
    ok(`${label} touches no trial column`, !/trial_ends_at|trial_started_at|subscription_status/.test(src))
    ok(`${label} starts/consumes no trial`, !/lb_start_trial|startTrial|getAccessState/.test(src))
    ok(`${label} shows no countdown or trial copy`, !/days? remaining|trial has started|free trial/i.test(src))
  }

  console.log("\n9. NO ENFORCEMENT ADDED:")
  // PASS 7 turned enforcement on, so these three inverted. Their replacements assert
  // the same underlying safety: enforcement reads the ONE shared predicate and sends
  // people to the ONE destination, rather than growing a second rule.
  ok("enforcement reads the shared predicate, not a local licence check",
    /passesLicenseGate\(profile\)/.test(mw) &&
    !/license_verified_at\s*(!==|===)/.test(mw) && !/license_state\s*(!==|===)/.test(mw))
  ok("there is exactly ONE licence redirect target", (mw.match(/VERIFY_LICENSE_PATH/g) ?? []).length === 2)
  ok("the destination is still /verify-license", /const VERIFY_LICENSE_PATH = "\/verify-license"/.test(mw))
  ok("lb_workspace_has_access was not touched", !/lb_workspace_has_access/.test(page + client + mw))
  ok("getAccessState is still called exactly once in middleware, for billing",
    (mw.match(/getAccessState\(/g) ?? []).length === 1)
  ok("the entitlement gate still targets /admin minus /admin/billing",
    /pathname\.startsWith\(ADMIN_PREFIX\) && !pathname\.startsWith\(BILLING_SETTINGS_PREFIX\)/.test(mw))
  // A licence condition need not name a licence column to be one. Pin the two gate
  // decisions to their exact text so ANY extra term — however it is named — fails
  // here rather than only in the Pass 5 suite. (Found by mutation testing.)
  ok("the entitlement decision has no extra term grafted on",
    /if \(!needsEntitlement\) return null;/.test(mw))
  ok("the auth decision has no extra term grafted on",
    /if \(needsAuth && signedOut\) \{/.test(mw))
  ok("middleware still makes exactly ONE profiles query, now serving both gates",
    /subscription_status, trial_ends_at, onboarding_completed, license_verified_at, license_state, internal_demo_access/.test(mw) &&
    (mw.match(/from\("profiles"\)/g) ?? []).length === 1)
  ok("no other surface links users here yet (Pass 7 owns routing)", (() => {
    for (const f of ["components/crm/profile/ProfileClient.tsx", "app/onboarding/_components/steps/StepBusinessProfile.tsx",
                     "app/admin/layout.tsx", "lib/billing/access.ts"]) {
      if (/verify-license/.test(read(f))) return false
    }
    return true
  })())

  console.log("\nOUT OF SCOPE — untouched by Pass 6:")
  for (const [label, f] of [["access helper", "lib/billing/access.ts"], ["catalog", "lib/markets/catalog.ts"],
                            ["Smart Lead Form fields", "app/smart-lead-form/_components/form/sections/LeadFormFields.tsx"]] as const) {
    ok(`${label} carries no verify-license reference`, !/verify-license/.test(read(f)))
  }

  console.log("\nthe existing design system was reused, not extended:")
  ok("the layout mirrors /billing (beast-root + beast.css)",
    /beast-root/.test(read(LAYOUT)) && /locator-beast\/beast\.css/.test(read(LAYOUT)) &&
    /beast-root/.test(read("app/billing/layout.tsx")))
  ok("the page is noindex like /billing", /robots: \{ index: false, follow: false \}/.test(read(LAYOUT)))
  ok("it reuses the shared AppHeader", /<AppHeader variant="dark" forceDarkSurface \/>/.test(client))
  {
    const beast = read("app/locator-beast/beast.css")
    const used = [...new Set((read(CLIENT).match(/var\(--beast-[a-z-]+\)/g) ?? []))]
    const missing = used.filter((v) => !beast.includes(`${v.slice(4, -1)}:`))
    ok(`all ${used.length} beast tokens resolve (no invented token)`, missing.length === 0)
    if (missing.length) console.log("      missing: " + missing.join(", "))
  }
}

main().then(() => {
  console.log(`\nVerify-licence page: ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})
