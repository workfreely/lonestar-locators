/**
 * Site-adapter registry — the seam for per-website behavior.
 *
 * Each supported site will get its own lightweight logic: recognizing the
 * current page/property and reading authorized visible information to send to
 * the native side panel. Rather than scatter `if (host === ...)` checks, we
 * describe each site as a `SiteAdapter` and look it up here.
 *
 * PHASE 1: empty of extraction logic — only the shape exists. Adding Smart
 * Apartment Data later is one adapter object + a manifest match; the launcher,
 * panel, and background stay untouched.
 */

export type SiteAdapter = {
  /** Stable id, e.g. "external-property-site". */
  id: string;
  /** Host suffix this adapter applies to, e.g. "smartapartmentdata.com". */
  hostSuffix: string;
  /**
   * FUTURE: read structured context (page kind, current property) from the DOM
   * and hand it to the panel. Undefined in phase 1 — no scraping yet.
   */
  extractContext?: () => Promise<unknown>;
};

/** Registered adapters. Empty in phase 1. */
export const SITE_ADAPTERS: readonly SiteAdapter[] = [];

/** Find the adapter for a host, or `null` if none is registered. */
export function getAdapterForHost(host: string): SiteAdapter | null {
  return SITE_ADAPTERS.find((a) => host.endsWith(a.hostSuffix)) ?? null;
}
