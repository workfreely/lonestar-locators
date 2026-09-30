// PASS 5 — server-side authentication boundary.
//
// These drive the REAL exported middleware with real NextRequest objects. For an
// anonymous request no Supabase call happens (the absence of a session cookie is
// itself the answer), so every case below is deterministic and offline.
//
// What this file does NOT assert: that a signed-in user is let through. That needs a
// live session, which cannot be forged here. It is covered instead by (a) the gate
// structurally returning null for every authenticated path, asserted on the source,
// and (b) production verification with a real browser session.
//
// Run: npx tsx scripts/auth/serverAuthBoundary.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"

// middleware reads Supabase env at call time; without it the gate short-circuits to
// "not configured — never block" and every assertion below would vacuously pass.
for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=")
  if (i > 0 && !line.trimStart().startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim()
}

import { NextRequest } from "next/server"
import { middleware } from "@/middleware"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const HOST = "https://locatorbeast.com"
const PROJECT_REF = "onwrrajmklxtnabekzcy"
const AUTH_COOKIE = `sb-${PROJECT_REF}-auth-token`

/** The shape @supabase/ssr actually stores: `base64-<base64url(JSON session)>`.
 *  A value it cannot parse is treated as NO session and never reaches the network,
 *  so the outage test below needs a real one to be meaningful. */
function wellFormedSessionCookie() {
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url")
  const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "11111111-1111-1111-1111-111111111111", exp: now + 3600, role: "authenticated" })}.sig`
  return "base64-" + Buffer.from(JSON.stringify({
    access_token: jwt, refresh_token: "rt-test", expires_at: now + 3600, expires_in: 3600,
    token_type: "bearer",
    user: { id: "11111111-1111-1111-1111-111111111111", aud: "authenticated", role: "authenticated" },
  })).toString("base64url")
}

// NextRequest does not derive a `host` header from the URL, and the marketing rewrite
// is host-scoped — without this the rewrite half would silently never fire and the
// public-route assertions would pass for the wrong reason.
const withHost = (pathname: string) =>
  new NextRequest(new URL(pathname, HOST), { headers: { host: "locatorbeast.com" } })

/** Drive the real middleware for an ANONYMOUS request (no session cookie). */
async function anon(pathname: string) {
  const res = await middleware(withHost(pathname))
  return {
    status: res.status,
    location: res.headers.get("location"),
    // Next marks an internal rewrite with this header; a plain pass-through has neither.
    rewrite: res.headers.get("x-middleware-rewrite"),
  }
}
const redirectsToLogin = (r: Awaited<ReturnType<typeof anon>>) =>
  (r.status === 307 || r.status === 302) && (r.location ?? "").endsWith("/login")

async function main() {
  console.log("1+2+3. UNAUTHENTICATED protected routes redirect SERVER-SIDE (no shell):")
  const PROTECTED = [
    "/admin", "/admin/leads", "/admin/profile", "/admin/license-verification",
    "/admin/network", "/admin/sent-lists", "/admin/control-center",
    "/admin/billing",            // entitlement-exempt, but NOT auth-exempt
    "/onboarding", "/billing", "/help", "/help/getting-started",
  ]
  for (const p of PROTECTED) {
    const r = await anon(p)
    ok(`${p} → 307 /login`, redirectsToLogin(r))
  }
  {
    // "Not rendered before the redirect" — the response IS the redirect: it carries no
    // rewrite to a protected segment and no body was produced for one.
    const r = await anon("/admin/leads")
    ok("the /admin response is a redirect, not a rewrite into the app shell", r.rewrite === null)
    ok("it does not resolve to a 200", r.status !== 200)
  }

  console.log("\n7+8+9. PUBLIC routes are untouched (the site did NOT go private):")
  const PUBLIC = [
    "/",                          // marketing home (rewritten to /locator-beast)
    "/features", "/pricing", "/about", "/contact",
    "/login", "/signup", "/forgot-password", "/reset-password",
    "/auth/callback",             // ESTABLISHES the session — gating it would deadlock sign-in
    "/smart-lead-form", "/smart-lead-form/some-agent",   // public renter intake
    "/authorize/instagram",
    "/privacy", "/terms", "/thank-you",
  ]
  for (const p of PUBLIC) {
    const r = await anon(p)
    ok(`${p} is NOT redirected to /login`, !redirectsToLogin(r))
  }

  console.log("\nroute mapping still works (the rewrite half of middleware is unchanged):")
  {
    const home = await anon("/")
    ok("marketing home still rewrites under /locator-beast", (home.rewrite ?? "").includes("/locator-beast"))
    const feat = await anon("/features")
    ok("/features still rewrites under /locator-beast", (feat.rewrite ?? "").includes("/locator-beast"))
    const share = await anon("/r/lbr_abcdefghijklmnopqrstuvwxyz012345")
    ok("a public /r/<token> share link still rewrites, never redirects",
      (share.rewrite ?? "").includes("/locator-beast/r/") && !redirectsToLogin(share))
    const asset = await anon("/demo/sarah-mitchell.png")
    ok("a /public static asset is left alone", !redirectsToLogin(asset) && asset.rewrite === null)
    // The API surface belongs to the LATER security pass — it must not start redirecting.
    for (const p of ["/api/leads/submit", "/api/r/favorite", "/ai/content-index"]) {
      ok(`${p} is NOT touched by this pass`, !redirectsToLogin(await anon(p)))
    }
  }

  console.log("\nan UNVERIFIABLE session fails OPEN (no lockout during a Supabase incident):")
  {
    // A malformed cookie value: the gate must consult Supabase rather than redirect on
    // the cookie's mere absence/presence. Reaching this branch at all proves the
    // redirect is not driven by "cookie missing" alone.
    const req = withHost("/admin/leads")
    req.cookies.set(AUTH_COOKIE, "not-a-real-session")
    const res = await middleware(req)
    const redirected = (res.status === 307 || res.status === 302) && (res.headers.get("location") ?? "").endsWith("/login")
    // Either outcome is acceptable and BOTH are safe: Supabase answering 4xx ⇒ redirect
    // (correct: the session is genuinely invalid); unreachable ⇒ fail open (correct: no
    // lockout). What must never happen is a crash.
    ok("a bogus session cookie is handled without throwing", res.status === 200 || redirected)
  }
  {
    // THE LOCKOUT TEST. Point the gate at an unreachable Supabase and send a request
    // that DOES carry a session cookie. Correct behaviour is to fail OPEN — because
    // an unreachable auth server is not evidence that the user is signed out.
    //
    // This is also the only assertion that can tell a working cookie check from a
    // broken one: with AUTH_COOKIE_PATTERN broken, the gate never consults Supabase
    // at all and redirects immediately, which would log every real user out.
    // (Found by mutation testing — the outcome alone is identical otherwise.)
    // The host must keep the SAME project ref, or supabase-js derives a different
    // storage key, never finds the cookie, and answers AuthSessionMissingError(400)
    // without any network call — which would make this test pass for the wrong
    // reason. `.invalid` is reserved by RFC 2606 and never resolves.
    const realUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${PROJECT_REF}.supabase.invalid`
    try {
      const signedIn = withHost("/admin/leads")
      signedIn.cookies.set(AUTH_COOKIE, wellFormedSessionCookie())
      const r1 = await middleware(signedIn)
      ok("Supabase unreachable + a session cookie → NOT redirected (fails open)",
        !((r1.status === 307 || r1.status === 302) && (r1.headers.get("location") ?? "").endsWith("/login")))

      const anonymous = withHost("/admin/leads")
      const r2 = await middleware(anonymous)
      ok("Supabase unreachable + NO session cookie → still redirected (no shell leak)",
        (r2.status === 307 || r2.status === 302) && (r2.headers.get("location") ?? "").endsWith("/login"))
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = realUrl
    }
  }

  console.log("\nAUTHENTICATION ONLY — no licence condition entered the boundary:")
  {
    const src = readFileSync(path.join(process.cwd(), "middleware.ts"), "utf8")
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
    ok("middleware reads NO licence column", !/license_verified_at|license_rejected_at|license_number|license_state/.test(code))
    ok("middleware calls NO licence RPC", !/lb_verify_license|lb_reject_license|lb_list_licenses|lb_change_license_state/.test(code))
    ok("middleware does not import the Pass 4 status module", !/lib\/license\/status/.test(code))
    ok("middleware adds no launch-market condition", !/LAUNCH_|isLaunchEnabled/.test(code))

    console.log("\n  entitlement + authorization preserved exactly:")
    ok("the platform-admin bypass still uses the canonical RPC", /rpc\("is_platform_admin"\)/.test(code))
    ok("it still requires a real boolean true", /isPlatformAdmin === true/.test(code))
    ok("is_platform_admin is NOT reimplemented in TS", !/platform_admins/.test(code))
    ok("the billing decision still comes from the shared helper", /getAccessState\(\{/.test(code))
    ok("lapsed users still go to /billing", /pathname = "\/billing"/.test(code))
    ok("/admin/billing is still exempt from the ENTITLEMENT gate",
      /needsEntitlement[\s\S]{0,140}!pathname\.startsWith\(BILLING_SETTINGS_PREFIX\)/.test(code))
    // Pass 6 added /verify-license to this pattern. Asserted as "admin is in the set"
    // rather than as the literal set, so adding a further protected route does not
    // fail this for the wrong reason — the /admin/billing behaviour is what matters.
    ok("/admin/billing is NOT exempt from the AUTH gate",
      /const PROTECTED_PATH_PATTERN = \/\^\\\/\(admin\|/.test(code))
    ok("the entitlement path still fails OPEN on a DB error", /return null; \/\/ fail open/.test(src))
    // Without these, replacing `if (!needsEntitlement) return null` with a bare
    // `return null` would disable the billing gate entirely and every other
    // assertion here would still pass. (Found by mutation testing.)
    ok("the entitlement early-return is CONDITIONAL, not unconditional",
      /if \(!needsEntitlement\) return null;/.test(code))
    ok("the billing gate is still reachable after the auth gate",
      /if \(!needsEntitlement\) return null;[\s\S]{0,600}from\("profiles"\)[\s\S]{0,400}subscription_status/.test(code))
    ok("trial/subscription fields are untouched by this pass",
      /subscription_status, trial_ends_at, onboarding_completed/.test(code))
    ok("the session is resolved ONCE, not once per gate",
      (code.match(/auth\.getUser\(\)/g) ?? []).length === 1)
  }

}

main().then(() => {
  console.log(`\nServer auth boundary: ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})
