import { NextRequest, NextResponse } from "next/server";

// Locator Beast (B2B SaaS marketing site) is served from its own domain but
// lives inside this repo as app/locator-beast/*. Requests to that host are
// rewritten to the /locator-beast prefix internally; the URL bar still shows
// locatorbeast.com/, /features, /pricing, etc. All other hosts (including
// lonestarlocators.app and /admin) fall through unchanged.
const LOCATOR_BEAST_HOST_PATTERN = /(^|\.)locatorbeast\.(com|app)$/i;
const LOCATOR_BEAST_PREFIX = "/locator-beast";

// Auth + onboarding pages reuse the Locator Beast design system (beast.css,
// Inter, no marketing nav/footer) but are top-level routes, not rewritten
// paths — so they get the same bare-shell treatment as locator-beast paths
// without being part of the marketing site rewrite.
const BARE_SHELL_PATH_PATTERN =
  /^\/(login|signup|forgot-password|reset-password|onboarding|billing|smart-lead-form)(\/|$)/;

export function middleware(request: NextRequest) {
  const hostname = (request.headers.get("host") || "").split(":")[0];
  const { pathname } = request.nextUrl;

  const isLocatorBeastHost = LOCATOR_BEAST_HOST_PATTERN.test(hostname);
  const isLocatorBeastPath =
    pathname === LOCATOR_BEAST_PREFIX || pathname.startsWith(`${LOCATOR_BEAST_PREFIX}/`);
  const isBareShellPath = isLocatorBeastPath || BARE_SHELL_PATH_PATTERN.test(pathname);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-site", isLocatorBeastHost || isBareShellPath ? "locator-beast" : "lonestar");

  if (isLocatorBeastHost && !isBareShellPath) {
    const url = request.nextUrl.clone();
    url.pathname = `${LOCATOR_BEAST_PREFIX}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
