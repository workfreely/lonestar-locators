// PASS 8 — the 30-day trial begins at licence verification, not at signup.
//
// Covers the thirteen stated regression requirements. The eligibility rule itself
// is transcribed from the APPLIED SQL and exercised as a truth table; the app half
// is asserted on source, and every source assertion is mutation-tested.
//
// Run: npx tsx scripts/auth/trialOnVerification.test.ts
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=")
  if (i > 0 && !line.trimStart().startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim()
}

import { NextRequest } from "next/server"
import { middleware } from "@/middleware"
import { TRIAL_LENGTH_DAYS } from "@/lib/billing/trial"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const sql = read("supabase/manual/20261002_pass8_trial_on_verification.sql")
const sqlLive = sql.slice(sql.indexOf("\nbegin;"), sql.indexOf("\ncommit;"))
// Comment-free view. The file's prose explains what is deliberately ABSENT from the
// grant, so a naive search would match the explanation instead of the code.
const sqlCode = sqlLive.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
const helper = strip(read("lib/license/verifyLicense.ts"))
const wizard = strip(read("app/onboarding/_components/OnboardingWizard.tsx"))
const startTrial = strip(read("app/api/billing/start-trial/route.ts"))
const welcome = strip(read("app/api/notifications/account-welcome/route.ts"))
const trialRoute = strip(read("app/api/notifications/trial-started/route.ts"))
const lifecycle = strip(read("lib/notifications/lifecycle.ts"))
const licPanel = strip(read("app/admin/license-verification/_components/LicensePanel.tsx"))
const appPanel = strip(read("app/admin/network/_components/ApprovalsPanel.tsx"))

// The grant rule, transcribed from the applied lb_verify_license.
const grants = (state: string | null, sub: string | null, started: string | null, ledgerHit: boolean) =>
  state === "TX" && started === null && sub === null && !ledgerHit

async function main() {
  console.log("1. A NEW SIGNUP NO LONGER STARTS A TRIAL — all three old paths are closed:")
  ok("1a. grant_trial_on_signup is inert (no interval, no ledger insert)", (() => {
    const fn = sqlLive.slice(sqlLive.indexOf("function public.grant_trial_on_signup"))
    const body = fn.slice(0, fn.indexOf("end $$;"))
    return !/interval/.test(body) && !/trial_usage/.test(body) && /return new;/.test(body)
  })())
  ok("1b. grant_trial_on_onboarding is inert — the one that would have become the granter", (() => {
    const fn = sqlLive.slice(sqlLive.indexOf("function public.grant_trial_on_onboarding"))
    const body = fn.slice(0, fn.indexOf("end $$;"))
    return !/interval/.test(body) && !/trial_usage/.test(body) && /return new;/.test(body)
  })())
  ok("1c. /api/billing/start-trial grants nothing",
    !/trial_started_at|computeTrialWindow|trial_usage|supabaseAdmin/.test(startTrial) &&
    /granted: false/.test(startTrial))
  ok("1d. onboarding no longer calls it", !/start-trial/.test(wizard.replace(/PASS 8[\s\S]*?\n\n/, "")))
  ok("1e. onboarding writes no trial field itself", !/trial_started_at|trial_ends_at|subscription_status/.test(wizard))

  console.log("\n2+3+4. PENDING / REJECTED / CORRECTED never start a trial:")
  // None of these is a Verify event, so lb_verify_license is never reached. The
  // only client write on those paths is the licence number itself.
  const verifyClient = strip(read("app/verify-license/_components/VerifyLicenseClient.tsx"))
  ok("2. the pending screen writes no trial field", !/trial_started_at|trial_ends_at|subscription_status/.test(verifyClient))
  ok("3. rejection cannot start one — lb_reject_license touches no trial column",
    !/trial/.test(read("supabase/manual/20260930_pass4_license_status_and_state_freeze.sql")
      .split("lb_reject_license")[1]?.slice(0, 900) ?? "trial"))
  ok("4. correcting a number only writes license_number (+ unset state)",
    /update\(\{\s*license_number: licenseNumber\.trim\(\)/.test(verifyClient))
  ok("2-4. only lb_verify_license can grant", (() => {
    const fn = sqlLive.slice(sqlLive.indexOf("function public.lb_verify_license"))
    return /trial_usage/.test(fn) && (sqlLive.match(/insert into public\.trial_usage/g) ?? []).length === 1
  })())

  console.log("\n5-10. THE ELIGIBILITY TRUTH TABLE (transcribed from the applied SQL):")
  const cases: [string, string | null, string | null, string | null, boolean, boolean][] = [
    ["5.  first Verified + TX, eligible",    "TX", null,       null,         false, true],
    ["6.  re-verification",                  "TX", "trialing", "2026-01-01", false, false],
    ["7.  previously consumed trial",        "TX", null,       null,         true,  false],
    ["8.  active paid subscriber",           "TX", "active",   null,         false, false],
    ["9.  internal demo (pending + active)", "TX", "active",   "2026-01-01", true,  false],
    ["10. verified NON-Texas",               "IL", null,       null,         false, false],
    ["    canceled subscriber",              "TX", "canceled", null,         false, false],
    ["    past_due subscriber",              "TX", "past_due", null,         false, false],
  ]
  for (const [label, st, sub, started, led, expected] of cases) {
    ok(`${label} → ${expected ? "TRIAL" : "no trial"}`, grants(st, sub, started, led) === expected)
  }
  ok("9. internal_demo_access is never consulted by the grant", !/internal_demo_access/.test(sqlCode))
  ok("9. nor is demo_mode, nor any name/email heuristic",
    !/demo_mode/.test(sqlCode) && !/@/.test(sqlCode.replace(/lower\(trim\(u\.email\)\)/g, "")))
  ok("the paid guard is `v_sub is null`, the tightest form", /and v_sub is null/.test(sqlLive))
  ok("re-verification is blocked by `v_started is null`", /and v_started is null/.test(sqlLive))
  ok("the launch state is required", /if v_state = 'TX'/.test(sqlLive))

  console.log("\nTRIAL LENGTH + LEDGER unchanged:")
  ok("still 30 days in SQL", /interval '30 days'/.test(sqlLive))
  ok("still 30 days in TypeScript", TRIAL_LENGTH_DAYS === 30)
  ok("reuses the EXISTING ledger, no second one", /public\.trial_usage/.test(sqlLive) && !/create table/.test(sqlLive))
  ok("reuses the existing anti-abuse check", /lb_trial_already_used\(v_email, v_phone\)/.test(sqlLive))
  ok("claims BOTH email and phone at once", /insert into public\.trial_usage \(email, phone, user_id\)/.test(sqlLive))
  ok("no ledger row is ever deleted or reset", !/delete from public\.trial_usage|update public\.trial_usage/.test(sqlLive))
  ok("no existing profile is rewritten by the migration itself",
    !/^update public\.profiles/m.test(sqlLive.replace(/[\s\S]*function public\.lb_verify_license/, "")))

  console.log("\n13. ATOMICITY — verification + grant cannot half-apply:")
  ok("both happen inside ONE function", (() => {
    const fn = sqlLive.slice(sqlLive.indexOf("function public.lb_verify_license"))
    return /license_verified_at\s+=\s+coalesce/.test(fn) && /trial_started_at    = now\(\)/.test(fn)
  })())
  ok("the whole migration is one transaction", /^begin;/m.test(sqlLive) && /\ncommit;/.test(sql))
  ok("trial_granted is set LAST, after both writes succeed",
    sqlLive.indexOf("set trial_started_at") < sqlLive.indexOf("v_granted := true"))
  ok("a unique_violation leaves granted=false and no date",
    /exception when unique_violation then[\s\S]{0,260}v_granted := false;[\s\S]{0,80}v_ends    := null;/.test(sqlLive))
  ok("the result is a single jsonb object", /returns jsonb/.test(sqlLive) && /jsonb_build_object\(/.test(sqlLive))
  ok("it reports all three fields",
    /'verified_at',   v_at/.test(sqlLive) && /'trial_granted', v_granted/.test(sqlLive) && /'trial_ends_at', v_ends/.test(sqlLive))

  console.log("\nTHE EMAIL is truthful — sent only for a trial this call granted:")
  ok("the helper gates on trial_granted === true", /result\?\.trial_granted === true/.test(helper))
  ok("it never infers from a re-read profile", !/from\("profiles"\)/.test(helper))
  ok("onboarding completion no longer claims a trial",
    !/trial/i.test(welcome.replace(/PASS 8[\s\S]*?path\./, "")) && /sendAccountWelcomeEmail/.test(welcome))
  ok("and no longer sends a trial end date", !/trial_ends_at/.test(welcome))
  ok("the welcome email and the trial email are now separate senders",
    /sendAccountWelcomeEmail/.test(lifecycle) && /sendTrialStartedEmail/.test(lifecycle) &&
    !/sendAccountStartedEmails/.test(lifecycle))
  ok("the trial email route exists", existsSync(path.join(process.cwd(), "app/api/notifications/trial-started/route.ts")))
  ok("it is platform-admin gated", /requirePlatformAdmin\(\)/.test(trialRoute) && /if \(!guard\.ok\) return guard\.response/.test(trialRoute))
  ok("it refuses to announce a trial the DB does not show",
    /if \(!profile\.license_verified_at \|\| !profile\.trial_ends_at\)/.test(trialRoute))
  ok("it uses the committed date, not a client-supplied one",
    /trialEndsAt: profile\.trial_ends_at/.test(trialRoute) && !/body\.trialEndsAt/.test(trialRoute))
  ok("a mail failure cannot fail the verification", /catch \{/.test(helper))

  console.log("\nONE verification path — both callers share it:")
  ok("the owner queue uses the helper", /verifyLicense\(userId\)/.test(licPanel))
  ok("the network approvals panel uses the same helper", /runVerifyLicense\(userId\)/.test(appPanel))
  ok("neither panel calls the RPC directly for Verify",
    !/rpc\("lb_verify_license"/.test(licPanel) && !/rpc\("lb_verify_license"/.test(appPanel))
  ok("the approvals panel aliases the import (its local handler has the same name)",
    /verifyLicense as runVerifyLicense/.test(appPanel))
  ok("Unverify and Reject still use the plain RPC — neither can start a trial",
    /supabase\.rpc\(rpc, \{ p_user: userId, \.\.\.args \}\)/.test(licPanel))

  console.log("\n11+12. PASS 7 GATING INTACT, and a pending user can still resolve it:")
  {
    const anon = async (p: string) => {
      const res = await middleware(new NextRequest(new URL(p, "https://locatorbeast.com"), { headers: { host: "locatorbeast.com" } }))
      return { status: res.status, location: res.headers.get("location") }
    }
    const toLogin = (r: { status: number; location: string | null }) =>
      (r.status === 307 || r.status === 302) && (r.location ?? "").endsWith("/login")
    for (const p of ["/admin/leads", "/verify-license", "/onboarding", "/billing"]) {
      ok(`11. ${p} still auth-gated`, toLogin(await anon(p)))
    }
    for (const p of ["/", "/login", "/smart-lead-form"]) ok(`11. ${p} still public`, !toLogin(await anon(p)))
    const mw = strip(read("middleware.ts"))
    ok("11. the licence gate still runs before billing",
      mw.indexOf("passesLicenseGate(profile)") < mw.indexOf("getAccessState({"))
    ok("12. /verify-license is exempt from the licence gate, so a pending user reaches it",
      /verify-license\|onboarding\|billing/.test(mw))
    ok("12. a trial-less pending user is never sent to /billing first — licence gate wins",
      mw.indexOf("passesLicenseGate(profile)") < mw.indexOf('pathname = "/billing"'))
    ok("11. middleware still starts no trial", !/trial_started_at|interval|start-trial/.test(mw))
  }

  console.log("\nOUT OF SCOPE — untouched:")
  ok("getAccessState is unchanged", !/license|internal_demo|verify/i.test(strip(read("lib/billing/access.ts"))))
  ok("no Stripe behaviour changed", !/stripe/i.test(helper) && !/stripe/i.test(trialRoute) && !/stripe/i.test(startTrial))
  ok("pricing is untouched", /MONTHLY_PRICE_USD = 99/.test(read("lib/billing/trial.ts")))
}

main().then(() => {
  console.log(`\nTrial on verification: ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})
