// PASS 7 — verified Texas licence access enforcement.
//
// Covers the fourteen stated regression requirements. The routing half drives the
// REAL middleware; the predicate half drives the REAL shared module; and a
// TS-vs-SQL agreement check enumerates the whole truth table so the two mirrors
// cannot drift. Every source assertion is mutation-tested.
//
// Run: npx tsx scripts/auth/licenseEnforcement.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"

for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=")
  if (i > 0 && !line.trimStart().startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim()
}

import { NextRequest } from "next/server"
import { middleware } from "@/middleware"
import { passesLicenseGate, hasVerifiedLaunchLicense, LAUNCH_LICENSE_STATE } from "@/lib/license/status"
import { getAccessState } from "@/lib/billing/access"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const mw = strip(read("middleware.ts"))
const page = strip(read("app/verify-license/page.tsx"))
const client = strip(read("app/verify-license/_components/VerifyLicenseClient.tsx"))
const sql = read("supabase/manual/20261001_pass7_internal_demo_access.sql")
// The APPLIED body of lb_workspace_has_access, with SQL comments removed. Scoping
// matters: the file's prose explains why there is no admin bypass, and a naive
// search would match that explanation instead of the code.
const accessFn = (() => {
  const start = sql.indexOf("create or replace function public.lb_workspace_has_access")
  const body = sql.slice(start, sql.indexOf("$$;", start))
  return body.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
})()

const V = "2026-01-01T00:00:00Z"
const P = (verified: string | null, state: string | null, demo = false) => ({
  license_number: "0123456", license_verified_at: verified, license_state: state,
  license_rejected_at: null, license_rejection_reason: null, internal_demo_access: demo,
})

async function main() {
  console.log("1+5. THE EXACT CONDITION — verified AND Texas, or the demo exemption:")
  ok("1. verified + TX passes", passesLicenseGate(P(V, "TX")))
  ok("5. verified + IL does NOT pass", !passesLicenseGate(P(V, "IL")))
  ok("5. verified + no state does NOT pass", !passesLicenseGate(P(V, null)))
  ok("2. unsubmitted does not pass", !passesLicenseGate({ license_number: "", license_state: "TX" }))
  ok("3. pending does not pass", !passesLicenseGate(P(null, "TX")))
  ok("4. rejected does not pass",
    !passesLicenseGate({ ...P(null, "TX"), license_rejected_at: V, license_rejection_reason: "typo" }))
  ok("the demo exemption passes without a verified licence", passesLicenseGate(P(null, "TX", true)))
  ok("the exemption requires a REAL true, never a truthy value",
    !passesLicenseGate({ ...P(null, "TX"), internal_demo_access: 1 as unknown as boolean }) &&
    !passesLicenseGate({ ...P(null, "TX"), internal_demo_access: undefined }))
  ok("hasVerifiedLaunchLicense ignores the exemption (it is the LICENCE rule alone)",
    !hasVerifiedLaunchLicense(P(null, "TX", true)) && hasVerifiedLaunchLicense(P(V, "TX")))
  ok("eligibility is NOT inferred from a licence number alone", !passesLicenseGate(P(null, "TX")))
  ok("the launch state constant is TX", LAUNCH_LICENSE_STATE === "TX")

  console.log("\n12. TYPESCRIPT AND SQL AGREE — the full truth table, both mirrors:")
  {
    // The SQL predicate, transcribed from lb_workspace_has_access in the applied file.
    const sqlLicence = (v: string | null, st: string | null, demo: boolean) =>
      (v !== null && st === "TX") || demo
    let mismatches = 0
    for (const v of [null, V]) for (const st of [null, "TX", "IL", "GA"]) for (const demo of [false, true]) {
      const ts = passesLicenseGate(P(v, st, demo))
      const db = sqlLicence(v, st, demo)
      if (ts !== db) { mismatches++; console.log(`      MISMATCH verified=${v} state=${st} demo=${demo}: ts=${ts} sql=${db}`) }
    }
    ok(`all 16 combinations agree between TS and SQL`, mismatches === 0)
    // …and that the transcription matches what is actually deployed.
    ok("the SQL mirror really contains the licence conjunct",
      /p\.license_verified_at is not null and p\.license_state = 'TX'/.test(sql) &&
      /or p\.internal_demo_access/.test(sql))
    {
      // Two independent `and (...)` groups, licence first, billing second — not one
      // group where an `or` could let either satisfy the whole condition.
      const licenceAt = accessFn.indexOf("p.license_verified_at is not null and p.license_state = 'TX'")
      const billingAt = accessFn.indexOf("p.subscription_status = 'active'")
      const between = accessFn.slice(licenceAt, billingAt)
      ok("the SQL keeps licence and billing as SEPARATE conjuncts (neither substitutes)",
        licenceAt > 0 && billingAt > licenceAt && /\)\s*and \(/.test(between))
      ok("the demo exemption sits INSIDE the licence conjunct, not beside billing",
        /or p\.internal_demo_access/.test(between))
    }
    ok("TS compares the state EXACTLY like SQL (no normalisation drift)",
      !passesLicenseGate(P(V, "tx")) && !passesLicenseGate(P(V, " TX")))
  }

  console.log("\n6+7+8. LICENCE AND BILLING COMPOSE — neither bypasses the other:")
  {
    const billing = (sub: string | null, trialEnds: string | null) =>
      getAccessState({ subscription_status: sub, trial_ends_at: trialEnds, organization_status: null }).allowed
    const future = new Date(Date.now() + 864e5).toISOString()
    const product = (v: string | null, st: string | null, demo: boolean, sub: string | null, te: string | null) =>
      passesLicenseGate(P(v, st, demo)) && billing(sub, te)

    ok("6. verified TX + live billing → product", product(V, "TX", false, "active", null))
    ok("7. verified TX + DEAD billing → blocked (licence never bypasses billing)",
      !product(V, "TX", false, "canceled", null))
    ok("8. live billing + no licence → blocked (billing never bypasses licence)",
      !product(null, "TX", false, "active", null) && billing("active", null))
    ok("verified non-TX + live billing → blocked", !product(V, "IL", false, "active", null))
    ok("demo exemption + live billing → product", product(null, "TX", true, "active", null))
    ok("demo exemption + DEAD billing → blocked (the exemption is LICENCE-only)",
      !product(null, "TX", true, "canceled", null))
    ok("a live trial still counts as billing", product(V, "TX", false, "trialing", future))
    ok("getAccessState itself is UNCHANGED — it knows nothing about licences",
      !/license|internal_demo/i.test(strip(read("lib/billing/access.ts"))))
  }

  console.log("\n2+3+4. ROUTING — every ineligible state is sent to /verify-license:")
  {
    const req = (p: string) => new NextRequest(new URL(p, "https://locatorbeast.com"), { headers: { host: "locatorbeast.com" } })
    const anon = async (p: string) => {
      const res = await middleware(req(p))
      return { status: res.status, location: res.headers.get("location"), rewrite: res.headers.get("x-middleware-rewrite") }
    }
    const to = (r: { status: number; location: string | null }, dest: string) =>
      (r.status === 307 || r.status === 302) && (r.location ?? "").endsWith(dest)

    // Anonymous still hits the Pass 5 auth gate FIRST — licence never runs before auth.
    ok("ordering: anonymous /admin/leads → /login, NOT /verify-license", to(await anon("/admin/leads"), "/login"))
    ok("the gate reads the licence via the shared module, not a local copy",
      /passesLicenseGate\(profile\)/.test(mw) && /from "@\/lib\/license\/status"/.test(mw))
    ok("the redirect target is /verify-license", /const VERIFY_LICENSE_PATH = "\/verify-license"/.test(mw))
    ok("licence is evaluated BEFORE entitlement",
      mw.indexOf("passesLicenseGate(profile)") < mw.indexOf("getAccessState({"))
    ok("authentication is evaluated BEFORE licence",
      mw.indexOf("if (needsAuth && signedOut)") < mw.indexOf("passesLicenseGate(profile)"))
    ok("the profile is fetched ONCE for both gates",
      (mw.match(/from\("profiles"\)/g) ?? []).length === 1 &&
      /license_verified_at, license_state, internal_demo_access/.test(mw))
    ok("the licence gate fails CLOSED (a redirect, not a fall-through)",
      /if \(needsLicense && !passesLicenseGate\(profile\)\) \{[\s\S]{0,220}NextResponse\.redirect/.test(mw))
    // Without these two, the exempt pattern could still be CORRECT while no longer
    // being consulted, and the billing gate could be short-circuited — both of which
    // every other assertion here would happily pass. (Found by mutation testing.)
    ok("the exempt pattern is actually CONSULTED by the gate",
      /const needsLicense = needsAuth && !LICENSE_EXEMPT_PATTERN\.test\(pathname\);/.test(mw))
    ok("the entitlement early-return is CONDITIONAL, so billing still runs after licence",
      /if \(!needsEntitlement\) return null;/.test(mw) &&
      /if \(!needsEntitlement\) return null;[\s\S]{0,700}getAccessState\(\{/.test(mw))
  }

  console.log("\n9+10. NO LOOPS — the resolution routes are exempt:")
  {
    const exempt = ["/verify-license", "/onboarding", "/billing", "/admin/billing", "/admin/profile", "/admin/license-verification"]
    // Drive the REAL regex parsed out of middleware source, not a copy of it.
    const src = mw.match(/const LICENSE_EXEMPT_PATTERN =\s*(\/[\s\S]*?\/);/)?.[1]
    ok("the exempt pattern was found in source", !!src)
    const re = new RegExp(src!.slice(1, src!.lastIndexOf("/")))
    for (const p of exempt) ok(`  ${p} matches the exempt pattern`, re.test(p))
    for (const p of ["/admin/leads", "/admin/network", "/admin/sent-lists", "/help", "/admin/control-center"]) {
      ok(`  ${p} is NOT exempt (enforcement applies)`, !re.test(p))
    }
    ok("9. /verify-license redirects onward ONLY when the gate passes — no bounce",
      /if \(passesLicenseGate\(profile\)\) redirect\(WORKSPACE\)/.test(page) &&
      !/licenseStatus\(profile\) === "verified"/.test(page))
    ok("9. a verified non-TX user therefore STAYS on /verify-license",
      !passesLicenseGate(P(V, "IL")))
    ok("10. onboarding is exempt, so a new user can still enter a licence", re.test("/onboarding"))
  }

  console.log("\nVERIFIED NON-TX gets a real destination, not a dead end:")
  ok("the page grows an out_of_state state", /out_of_state: \{/.test(client))
  ok("it is derived, not guessed", /derived === "verified" \? "out_of_state" : derived/.test(client))
  ok("the frozen licence is READ-ONLY (the DB would refuse a write)", /readOnly=\{frozen\}/.test(client))
  ok("it links to the relicensing path", /href="\/admin\/profile"/.test(client))
  ok("that path is exempt, so the link cannot bounce", /admin\\\/profile/.test(mw))
  ok("out_of_state did NOT become a fifth LicenseStatus",
    !/"out_of_state"/.test(strip(read("lib/license/status.ts"))))

  console.log("\n11. ADMIN — authorization untouched, verification still operable:")
  ok("is_platform_admin is still the canonical check", /rpc\("is_platform_admin"\)/.test(mw))
  ok("it still requires a real boolean true", /isPlatformAdmin === true/.test(mw))
  ok("no blanket admin bypass was added to the licence gate",
    !/isPlatformAdmin[\s\S]{0,80}needsLicense/.test(mw) && !/needsLicense[\s\S]{0,80}isPlatformAdmin/.test(mw))
  ok("the owner's review queue is reachable by PATH exemption instead", re0("/admin/license-verification"))
  ok("the SQL mirror has NO caller-identity bypass (would expose every workspace)",
    !/is_platform_admin/.test(accessFn))
  ok("the SQL mirror evaluates the workspace OWNER, not the caller",
    /join public\.profiles p on p\.id = w\.created_by/.test(accessFn) && !/auth\.uid\(\)/.test(accessFn))

  console.log("\n13+14. PUBLIC SURFACES UNCHANGED:")
  {
    const anon = async (p: string) => {
      const res = await middleware(new NextRequest(new URL(p, "https://locatorbeast.com"), { headers: { host: "locatorbeast.com" } }))
      return { status: res.status, location: res.headers.get("location"), rewrite: res.headers.get("x-middleware-rewrite") }
    }
    for (const p of ["/", "/features", "/pricing", "/login", "/signup", "/forgot-password", "/privacy", "/terms",
                     "/smart-lead-form", "/smart-lead-form/some-agent", "/auth/callback", "/thank-you"]) {
      const r = await anon(p)
      const redirected = (r.status === 307 || r.status === 302) && /\/(login|verify-license)$/.test(r.location ?? "")
      ok(`${p} still public`, !redirected)
    }
    ok("14. the Smart Lead Form market filtering is untouched",
      /launchMarketsForSlugs\(serviceAreaSlugs\)/.test(read("app/smart-lead-form/_components/form/sections/LeadFormFields.tsx")))
    ok("a public /r/<token> share still rewrites",
      ((await anon("/r/lbr_abcdefghijklmnopqrstuvwxyz012345")).rewrite ?? "").includes("/locator-beast/r/"))
  }

  console.log("\nNO TRIAL LOGIC CHANGED:")
  ok("middleware starts/extends/resets no trial", !/trial_started_at|lb_start_trial|startTrial/.test(mw))
  ok("it still only READS the two billing columns it always did",
    /subscription_status, trial_ends_at, onboarding_completed/.test(mw))
  ok("the verify page touches no trial field", !/trial/i.test(page) && !/trial/i.test(client))
  ok("the SQL changed no trial semantics",
    /p\.subscription_status = 'active'/.test(sql) &&
    /p\.trial_ends_at is not null\s*\n\s*and p\.trial_ends_at > now\(\)/.test(sql) &&
    !/trial_started_at/.test(sql))
  ok("no Stripe call was added", !/stripe/i.test(mw) && !/stripe/i.test(page) && !/stripe/i.test(client))

  console.log("\nOUT OF SCOPE — untouched by Pass 7:")
  for (const [label, f] of [["service-area RPC caller", "components/crm/profile/ProfileClient.tsx"],
                            ["market catalog", "lib/markets/catalog.ts"]] as const) {
    ok(`${label} has no licence-gate logic`, !/passesLicenseGate|internal_demo_access/.test(read(f)))
  }
  ok("the Pass 4 status derivation is unchanged",
    /export function licenseStatus/.test(read("lib/license/status.ts")) &&
    /if \(filled\(p\.license_verified_at\)\) return "verified"/.test(read("lib/license/status.ts")))
}

// Small helper used once above, defined after use for readability.
function re0(p: string) {
  const src = mw.match(/const LICENSE_EXEMPT_PATTERN =\s*(\/[\s\S]*?\/);/)?.[1]
  if (!src) return false
  return new RegExp(src.slice(1, src.lastIndexOf("/"))).test(p)
}

main().then(() => {
  console.log(`\nLicence enforcement: ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})
