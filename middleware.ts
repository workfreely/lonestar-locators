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

// Top-level app routes (auth/onboarding/etc.) are NOT part of the marketing
// rewrite, so on the locatorbeast.com host they must stay at their real path
// rather than being rewritten under /locator-beast. This pattern is used ONLY
// to exclude them from the rewrite — never for layout selection.
const BARE_SHELL_PATH_PATTERN =
  /^\/(login|signup|forgot-password|reset-password|onboarding|billing|smart-lead-form)(\/|$)/;

export function middleware(request: NextRequest) {
  const hostname = (request.headers.get("host") || "").split(":")[0];
  const { pathname } = request.nextUrl;

  const isLocatorBeastHost = LOCATOR_BEAST_HOST_PATTERN.test(hostname);
  const isLocatorBeastPath =
    pathname === LOCATOR_BEAST_PREFIX || pathname.startsWith(`${LOCATOR_BEAST_PREFIX}/`);
  const isBareShellPath = isLocatorBeastPath || BARE_SHELL_PATH_PATTERN.test(pathname);

  if (isLocatorBeastHost && !isBareShellPath) {
    const url = request.nextUrl.clone();
    url.pathname = `${LOCATOR_BEAST_PREFIX}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
