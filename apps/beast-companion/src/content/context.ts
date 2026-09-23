import type { PageContext, SiteId } from "@/types";

/**
 * Page-context reporting (shell phase).
 *
 * Reports only the URL/host/section and which supported site we're on. It does
 * NOT read client, lead, or property data — that's a later phase gated behind the
 * shell passing. Kept deliberately tiny so it can't drift into scraping.
 */

export function detectSite(host: string): SiteId {
  const h = host.toLowerCase();
  if (h === "locatorbeast.com" || h === "www.locatorbeast.com") return "locator-beast";
  if (h.endsWith("smartapartmentdata.com")) return "external-property-site";
  return "unknown";
}

export function readPageContext(): PageContext {
  const { host, pathname, search, hash, href } = location;
  return {
    site: detectSite(host),
    host,
    path: `${pathname}${search}${hash}`,
    url: href,
  };
}
