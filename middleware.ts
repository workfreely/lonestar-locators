import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getAccessState } from "@/lib/billing/access";

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
  /^\/(login|signup|forgot-password|reset-password|onboarding|billing|smart-lead-form|admin|api|auth|companion|ai|thank-you)(\/|$)/;

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
  // Onboarding not finished → the client shell handles the /onboarding redirect
  // (and the trial only starts once onboarding completes).
  if (!profile.onboarding_completed) return null;

  const access = getAccessState({
    subscription_status: profile.subscription_status ?? null,
    trial_ends_at: profile.trial_ends_at ?? null,
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
