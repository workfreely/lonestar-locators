import type { LayoutMode } from "@/types";

/**
 * Site-adapter registry — the seam for per-website behavior.
 *
 * The companion runs on a small, growing whitelist of sites. Each site will
 * eventually need its OWN logic: which layout mode is safe (push vs overlay),
 * and — later — how to read context from that page (e.g. extracting a property
 * from Smart Apartment Data). Rather than scatter `if (host === ...)` checks, we
 * describe each site as a `SiteAdapter` and look it up here.
 *
 * PHASE 1: the registry is intentionally empty of extraction logic. Only the
 * shape exists, plus a default. Adding Smart Apartment Data later is a matter of
 * dropping in one adapter object — no changes to the tab, panel, or page-shift.
 */

export type SiteAdapter = {
  /** Stable id, e.g. "smart-apartment-data". */
  id: string;
  /** Host-suffix this adapter applies to, e.g. "smartapartmentdata.com". */
  hostSuffix: string;
  /** Layout the page can safely accept. Defaults to "push". */
  layoutMode: LayoutMode;
  /**
   * FUTURE: read structured context from the current page. Left undefined in
   * phase 1 — no scraping, no extraction is implemented yet.
   */
  extractContext?: () => Promise<unknown>;
};

/** Registered adapters. Empty in phase 1 (see note above). */
export const SITE_ADAPTERS: readonly SiteAdapter[] = [];

/** Find the adapter for a host, or `null` if none is registered. */
export function getAdapterForHost(host: string): SiteAdapter | null {
  return SITE_ADAPTERS.find((a) => host.endsWith(a.hostSuffix)) ?? null;
}

/** The layout mode to use for a host — defaults to the preferred "push". */
export function layoutModeForHost(host: string): LayoutMode {
  return getAdapterForHost(host)?.layoutMode ?? "push";
}
