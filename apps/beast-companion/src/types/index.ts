/**
 * Shared internal contracts.
 *
 * Native hybrid model, OPEN-ONLY: the launcher (content script) asks the
 * BACKGROUND to OPEN the global native side panel for its window. Chrome requires
 * open() to originate from a user gesture, so the launcher forwards the click
 * synchronously. There is no programmatic close and no open/closed state — the
 * native X is the sole close control (matches Apollo's native-panel usage).
 */

/** Which browser edge the native side panel is docked to (Chrome 140+ getLayout). */
export type PanelSide = "left" | "right";

/** Which supported site a page belongs to. */
export type SiteId = "smart-apartment-data" | "locator-beast" | "unknown";

/** Lightweight page context reported by the content script (no client data). */
export type PageContext = {
  site: SiteId;
  host: string;
  /** pathname + search + hash — enough to identify the section, no PII scraped. */
  path: string;
  url: string;
};

/**
 * The property page the locator is CURRENTLY viewing (Smart Apartment Data
 * detail page). This is page context, NOT a saved Favorite/Recommendation and NOT
 * tied to the active client — it follows the webpage, not the CRM selection. Never
 * persisted to Supabase. `propertyId` is SAD's stable `propertyID` (primary
 * identity); `name`/`address` are read-only from the detail page.
 */
export type CurrentProperty = {
  /** Smart Apartment Data's stable propertyID (external property identity). */
  propertyId: string;
  /** Field names deliberately mirror FavoriteDTO/RecommendationDTO so a detected
   *  Current Property is directly compatible when it later becomes a saved
   *  Recommendation/Favorite (no remapping). Name/id/url are the primary identity;
   *  address/image are supplemental and may be null without failing detection. */
  propertyName: string;
  propertyAddress?: string | null;
  /** SAD submarket (neighborhood/area label) from the property header — the most
   *  reliable structured location signal on the detail page. Supplemental; null
   *  when absent. Used by Location Fit alongside the address. */
  propertySubmarket?: string | null;
  /** Management company from the SAD detail page — read-only evidence for Approval
   *  intelligence. Supplemental; null when absent. Never a guarantee of approval. */
  propertyManagement?: string | null;
  /** Verified property EMAILS from the SAD detail page — OPERATIONAL data (not
   *  intelligence): retained at capture so later workflows can prefill the Guest
   *  Card and Invoice recipients without the agent returning to SAD to copy them.
   *  SAD may supply MULTIPLE addresses and we retain ALL of them (never rank, select
   *  a primary, or discard) — one may be stale and we can't know which is current.
   *  `[]` when none/unavailable; never guessed/fabricated. Supplemental (never blocks
   *  detection). No invoice/guest-card automation is built on it yet. */
  propertyEmails?: string[];
  /** The actual SAD ViewProperty.aspx?propertyID=... URL. */
  propertyUrl: string;
  propertyImageUrl?: string | null;
};

/** Content → Background: open the global native side panel for the sender's window. */
export type OpenPanelMessage = { type: "OPEN_PANEL" };

/** Content → Background: which side is the panel on? Response: { side: PanelSide }. */
export type GetPanelSideMessage = { type: "GET_PANEL_SIDE" };

/** Content → Background: report the current page context (URL/site/section). */
export type ReportContextMessage = { type: "REPORT_CONTEXT"; context: PageContext };

/**
 * Content → Background: the sender IS the CRM tab that just supplied the Companion
 * active client. The background stamps sender.tab.id/windowId into storage so
 * "← Back to CRM" can return to the EXACT originating tab (not a URL-pattern guess).
 */
export type ReportCrmTabMessage = { type: "REPORT_CRM_TAB" };

export type RuntimeMessage =
  | OpenPanelMessage
  | GetPanelSideMessage
  | ReportContextMessage
  | ReportCrmTabMessage;
