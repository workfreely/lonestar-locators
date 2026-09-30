import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getAccessState, type OrganizationStatus } from "@/lib/billing/access";
import { looksLikeShareToken } from "@/lib/clientShare/tokenShape";

// Locator Beast (B2B SaaS marketing site) is served from its own domain but
// lives inside this repo as app/locator-beast/*. Requests to that host are
// rewritten to the /locator-beast prefix internally; the URL bar still shows
// locatorbeast.com/, /features, /pricing, etc.
//
// This middleware does three things:
//   1) AUTHENTICATION — server-side session gate for the protected route groups.
//   2) PREMIUM-ROUTE PROTECTION — server-side billing gate for the CRM (/admin).
//   3) ROUTE MAPPING — host-based rewrite for the marketing tree (unchanged).
// It does NOT control which visual layout renders — that is purely structural
// (route groups + per-segment layouts).
const LOCATOR_BEAST_HOST_PATTERN = /(^|\.)locatorbeast\.(com|app)$/i;
const LOCATOR_BEAST_PREFIX = "/locator-beast";

// Top-level app / infrastructure routes live at the ROOT, not under the
// /locator-beast marketing tree — so on the locatorbeast.com host they must
// stay at their real path and NOT be rewritten under /locator-beast (otherwise
// the CRM, OAuth callback, and API routes 404 on the live domain). Everything
// else on that host is a marketing page served from app/locator-beast/*.
const APP_PATH_PATTERN =
  /^\/(login|signup|forgot-password|reset-password|onboarding|billing|verify-license|smart-lead-form|admin|api|auth|companion|ai|help|thank-you|authorize)(\/|$)/;

// The CRM is premium. Everything under /admin requires an active trial or a
// live subscription — EXCEPT /admin/billing, which must always be reachable so
// a lapsed user can still subscribe/manage billing. This gate is the SERVER-
// SIDE source of truth for access; the client shell never decides it.
const ADMIN_PREFIX = "/admin";
const BILLING_SETTINGS_PREFIX = "/admin/billing";

// AUTHENTICATION ONLY — the routes that require a signed-in Locator Beast user.
//
// This is deliberately a separate concept from the two gates that follow it:
//   1. authentication  — is there a signed-in user at all?      (this pattern)
//   2. entitlement     — may that user use the premium CRM?     (appGate step 2)
//   3. authorization   — is that user the platform owner?       (is_platform_admin)
// Each page keeps its own authorization; this only establishes (1) server-side so a
// logged-out request never receives the protected shell and then redirects itself.
//
// /admin/billing IS included even though the entitlement step skips it: a lapsed user must be
// able to reach billing, but an anonymous one must not.
//
// EXCLUDED ON PURPOSE (these must stay reachable signed-out): every marketing route,
// /login, /signup, /forgot-password, /reset-password, /auth/* (the OAuth callback that
// ESTABLISHES the session), /authorize/* (Instagram OAuth landing), /smart-lead-form
// (public renter intake), /r/<token> (public client recommendations), and the whole
// Lone Star tree. /api/* and /ai/* are deliberately untouched — those belong to the
// later API security pass, and gating them here would change API contracts.
// /verify-license is AUTHENTICATION-gated like the rest, and deliberately sits
// OUTSIDE the entitlement gate — exactly like /billing. A user who has to resolve a
// requirement must be able to reach the page that resolves it, whatever their
// entitlement says. This adds no licence CONDITION anywhere: nothing in this file
// reads a licence column or routes anyone based on one. Pass 7 owns that.
const PROTECTED_PATH_PATTERN = /^\/(admin|onboarding|billing|verify-license|help)(\/|$)/;

// Supabase sets the session as `sb-<ref>-auth-token`, chunked as `.0`, `.1`, … when
// it is large. Their presence is what separates "definitely signed out" from "we
// could not verify right now", which is the difference between a correct redirect
// and locking every user out during a Supabase incident.
const AUTH_COOKIE_PATTERN = /^sb-.+-auth-token(\.\d+)?$/;

// Server-side billing enforcement for the CRM. Returns a redirect response when
// the signed-in user has no active trial/subscription, otherwise null (allow).
// Deliberately FAIL-OPEN on any auth/DB hiccup so a transient error can never
// lock a paying customer out — only a definitive "access denied" state blocks.
// Runs on every /admin navigation (page load / RSC fetch), so an expiry mid-
// session doesn't yank the user — they're redirected on their next navigation.
async function appGate(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;
  const needsAuth = PROTECTED_PATH_PATTERN.test(pathname);
  // The premium gate's original scope, unchanged: /admin except /admin/billing.
  const needsEntitlement =
    pathname.startsWith(ADMIN_PREFIX) && !pathname.startsWith(BILLING_SETTINGS_PREFIX);
  if (!needsAuth && !needsEntitlement) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null; // not configured — never block

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      // Read-only in the gate; the browser client owns session refresh.
      setAll() {},
    },
  });

  // ── 1. AUTHENTICATION ─────────────────────────────────────────────────────
  // Resolved ONCE here and reused by the entitlement check below, so adding this
  // gate costs no extra round trip on an /admin navigation.
  //
  // Two different failures must not be treated alike:
  //   • no session cookie at all      → definitively signed out → redirect
  //   • a cookie we could not verify  → could be an outage      → fail OPEN
  // Redirecting on the second would log every real user out whenever Supabase auth
  // is unreachable. Failing open there is safe because it only renders a shell: RLS
  // still denies the data, and the client-side check still redirects.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => AUTH_COOKIE_PATTERN.test(c.name));

  let userId: string | null = null;
  let signedOut = !hasAuthCookie;

  if (hasAuthCookie) {
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
      // A 4xx is Supabase authoritatively rejecting the session (expired, revoked,
      // malformed). A 5xx or a transport failure is not an answer about the user.
      const status = (error as { status?: number } | null)?.status;
      if (!userId && typeof status === "number" && status >= 400 && status < 500) {
        signedOut = true;
      }
    } catch {
      return null; // auth infra error → fail open
    }
  }

  if (!userId) {
    // THE PASS 5 FIX. This previously returned null unconditionally — "let the
    // client shell handle the /login redirect" — which is exactly why /admin/*
    // answered 200 with the authenticated shell for anonymous requests.
    if (needsAuth && signedOut) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "";
      return NextResponse.redirect(loginUrl);
    }
    return null;
  }

  // ── 2. ENTITLEMENT ────────────────────────────────────────────────────────
  // Everything below is the original billing gate, unchanged. A signed-in user who
  // is not entitled still goes to /billing; authentication never implies access,
  // and this pass adds NO licence condition of any kind.
  if (!needsEntitlement) return null;

  let profile: {
    subscription_status: string | null;
    trial_ends_at: string | null;
    onboarding_completed: boolean | null;
  } | null = null;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("subscription_status, trial_ends_at, onboarding_completed")
      .eq("id", userId)
      .single();
    if (error) return null; // fail open
    profile = data;
  } catch {
    return null; // fail open
  }

  if (!profile) return null;

  // NO onboarding bypass. There used to be an `if (!profile.onboarding_completed)
  // return null` here, because the trial was granted at the END of onboarding —
  // without it every brand-new user would have been bounced to /billing during
  // setup. Since trg_grant_trial_on_signup grants the trial at profile creation,
  // an eligible user is entitled from their first authenticated request and no
  // longer needs the exemption.
  //
  // Removing it also closes the hole it opened: an account with NO entitlement
  // (a repeat email, or a trial revoked for a duplicate phone) could previously
  // reach the entire CRM indefinitely just by never finishing onboarding.
  //
  // /onboarding itself is unaffected — this gate only runs for /admin routes.

  // Platform admin — an EXPLICIT bypass, checked BEFORE every billing-derived
  // source. Until now the platform owner reached /admin only incidentally,
  // because their Beast Network membership happened to be 'active'; revoking
  // that membership, or letting the trial lapse with no subscription, would
  // have locked the owner out of their own product.
  //
  // Reuses the canonical is_platform_admin() SECURITY DEFINER function over
  // platform_admins rather than introducing a second admin flag. That table has
  // RLS enabled with a SELECT-only policy and NO write policy, so a row is
  // grantable only via the service role or a migration — a user cannot
  // self-elevate (which is exactly why it is a separate table and not a boolean
  // on profiles, whose UPDATE policy is an unrestricted `auth.uid() = id`).
  //
  // Fails in the SAFE direction, opposite to the fail-open guards above: any
  // error leaves this false and the normal entitlement check still runs, so a
  // failed lookup can never grant access. The `=== true` is deliberate — only a
  // real boolean true bypasses, never a merely truthy value.
  try {
    const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");
    if (isPlatformAdmin === true) return null;
  } catch {
    // Not an admin as far as this gate is concerned — fall through.
  }

  // Organization-Included (Beast Network): the third access source. Fail-safe —
  // resolves to null (not a member) on any error, so a network lookup can never
  // lock out a paying/trialing user. CRITICAL: without this, an active
  // complimentary member with no Stripe subscription would be redirected to
  // /billing on every /admin navigation.
  let organizationStatus: OrganizationStatus | null = null;
  try {
    const { data: member } = await supabase
      .from("network_members")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();
    organizationStatus = (member?.status as OrganizationStatus | undefined) ?? null;
  } catch {
    organizationStatus = null; // fail open
  }

  const access = getAccessState({
    subscription_status: profile.subscription_status ?? null,
    trial_ends_at: profile.trial_ends_at ?? null,
    organization_status: organizationStatus,
  });

  if (!access.allowed) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/billing";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return null;
}

export async function middleware(request: NextRequest) {
  const hostname = (request.headers.get("host") || "").split(":")[0];
  const { pathname } = request.nextUrl;

  // 0) PUBLIC CLIENT-RECOMMENDATION SHORT LINK — host-independent.
  //
  // `/r/<token>` is a platform primitive that must resolve to the LB recommendation
  // page (app/locator-beast/r/[token]) on EVERY host. The marketing rewrite below
  // only fires on the locatorbeast.com host, so off that host (localhost, and the
  // Lone Star domain) `/r/<token>` otherwise falls through to Lone Star routing
  // (the (lonestar)/(site)/[city]/[category] segment) and renders the wrong site.
  //
  // Guarded by the SAME cheap share-token shape check the API and page use, so an
  // ordinary two-segment route can never be captured — `r` is not a Lone Star city
  // and no real path begins with the "lbr_" token prefix. Terminal rewrite: it does
  // not re-enter middleware, and it changes neither the canonical URL the API
  // returns nor any snapshot/token/data.
  const shareMatch = pathname.match(/^\/r\/([^/]+)\/?$/);
  if (shareMatch && looksLikeShareToken(shareMatch[1])) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `${LOCATOR_BEAST_PREFIX}/r/${shareMatch[1]}`;
    return NextResponse.rewrite(rewriteUrl);
  }

  // 1) Authentication, then premium-route protection — both decided server-side.
  //    appGate itself decides which of the two apply to this path (and returns
  //    immediately for the public majority), so the check lives in ONE place
  //    instead of being duplicated per route group.
  {
    const gate = await appGate(request);
    if (gate) return gate;
  }

  // 2) Marketing host-rewrite (route mapping only — unchanged).
  const isLocatorBeastHost = LOCATOR_BEAST_HOST_PATTERN.test(hostname);

  // 2a) LEGAL-URL CANONICALISATION.
  //
  // /privacy and /terms are the canonical public legal URLs (they match the
  // metadata canonical, the sitemap, and the Beast Companion consent screen).
  // The /locator-beast/* forms render identical pages, so search engines and
  // shared links saw the same document at two addresses. Redirect the long form
  // to the short one, permanently.
  //
  // HOST-SCOPED ON PURPOSE. Only locatorbeast.com maps /privacy to the Locator
  // Beast policy; on the Lone Star host and in local development /privacy is
  // Lone Star's own separate policy. Redirecting there would serve the WRONG
  // company's legal text, so off that host the long path is left alone and the
  // Lone Star pages are untouched.
  //
  // NO LOOP: this fires only on an INCOMING request whose path already starts
  // with /locator-beast. The rewrite below sends /privacy to that path
  // internally, and an internal rewrite is terminal — it does not re-enter
  // middleware — so the redirect cannot see it.
  if (isLocatorBeastHost) {
    const legal = pathname.match(/^\/locator-beast\/(privacy|terms)\/?$/);
    if (legal) {
      const canonical = request.nextUrl.clone();
      canonical.pathname = `/${legal[1]}`;
      return NextResponse.redirect(canonical, 308);
    }
  }
  const isLocatorBeastPath =
    pathname === LOCATOR_BEAST_PREFIX || pathname.startsWith(`${LOCATOR_BEAST_PREFIX}/`);
  const isAppPath = isLocatorBeastPath || APP_PATH_PATTERN.test(pathname);
  // Static files in /public (e.g. /demo/sarah-mitchell.png, og images, robots.txt)
  // live at the root, not under /locator-beast. Rewriting them 404s on the
  // custom domain, so leave any path with a file extension untouched. The
  // matcher already excludes _next/static, _next/image, and favicon.ico.
  const isStaticAsset = /\.[^/]+$/.test(pathname);

  if (isLocatorBeastHost && !isAppPath && !isStaticAsset) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `${LOCATOR_BEAST_PREFIX}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(rewriteUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
