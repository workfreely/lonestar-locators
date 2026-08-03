import { NextRequest, NextResponse } from "next/server";

// Locator Beast (B2B SaaS marketing site) is served from its own domain but
// lives inside this repo as app/locator-beast/*. Requests to that host are
// rewritten to the /locator-beast prefix internally; the URL bar still shows
// locatorbeast.com/, /features, /pricing, etc.
//
// This middleware controls ROUTE MAPPING ONLY (which files serve a URL on the
// locatorbeast.com host). It does NOT control which visual layout renders —
// that is now purely structural (route groups + per-segment layouts). There is
// no x-site header and no layout branching anywhere.
const LOCATOR_BEAST_HOST_PATTERN = /(^|\.)locatorbeast\.(com|app)$/i;
const LOCATOR_BEAST_PREFIX = "/locator-beast";

// Top-level app / infrastructure routes live at the ROOT, not under the
// /locator-beast marketing tree — so on the locatorbeast.com host they must
// stay at their real path and NOT be rewritten under /locator-beast (otherwise
// the CRM, OAuth callback, and API routes 404 on the live domain). Everything
// else on that host is a marketing page served from app/locator-beast/*.
// Used ONLY to exclude these from the rewrite — never for layout selection.
const APP_PATH_PATTERN =
  /^\/(login|signup|forgot-password|reset-password|onboarding|billing|smart-lead-form|admin|api|auth|companion|ai)(\/|$)/;

export function middleware(request: NextRequest) {
  const hostname = (request.headers.get("host") || "").split(":")[0];
  const { pathname } = request.nextUrl;

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
    const url = request.nextUrl.clone();
    url.pathname = `${LOCATOR_BEAST_PREFIX}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
