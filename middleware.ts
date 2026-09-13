import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getAccessState, type OrganizationStatus } from "@/lib/billing/access";

// Locator Beast (B2B SaaS marketing site) is served from its own domain but
// lives inside this repo as app/locator-beast/*. Requests to that host are
// rewritten to the /locator-beast prefix internally; the URL bar still shows
// locatorbeast.com/, /features, /pricing, etc.
//
// This middleware does two things:
//   1) PREMIUM-ROUTE PROTECTION — server-side billing gate for the CRM (/admin).
//   2) ROUTE MAPPING — host-based rewrite for the marketing tree (unchanged).
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
  /^\/(login|signup|forgot-password|reset-password|onboarding|billing|smart-lead-form|admin|api|auth|companion|ai|help|thank-you|authorize)(\/|$)/;

// The CRM is premium. Everything under /admin requires an active trial or a
// live subscription — EXCEPT /admin/billing, which must always be reachable so
// a lapsed user can still subscribe/manage billing. This gate is the SERVER-
// SIDE source of truth for access; the client shell never decides it.
const ADMIN_PREFIX = "/admin";
const BILLING_SETTINGS_PREFIX = "/admin/billing";

// Server-side billing enforcement for the CRM. Returns a redirect response when
// the signed-in user has no active trial/subscription, otherwise null (allow).
// Deliberately FAIL-OPEN on any auth/DB hiccup so a transient error can never
// lock a paying customer out — only a definitive "access denied" state blocks.
// Runs on every /admin navigation (page load / RSC fetch), so an expiry mid-
// session doesn't yank the user — they're redirected on their next navigation.
async function billingGate(request: NextRequest): Promise<NextResponse | null> {
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

  let userId: string | null = null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    return null; // auth infra error → fail open
  }

  // Not signed in → let the client shell handle the /login redirect.
  if (!userId) return null;

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

  // 1) Premium-route protection — gate the CRM server-side. Skips /admin/billing
  //    so a lapsed user can always reach billing to subscribe.
  if (pathname.startsWith(ADMIN_PREFIX) && !pathname.startsWith(BILLING_SETTINGS_PREFIX)) {
    const gate = await billingGate(request);
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
