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

/** Content → Background: open the global native side panel for the sender's window. */
export type OpenPanelMessage = { type: "OPEN_PANEL" };

/** Content → Background: which side is the panel on? Response: { side: PanelSide }. */
export type GetPanelSideMessage = { type: "GET_PANEL_SIDE" };

/** Content → Background: report the current page context (URL/site/section). */
export type ReportContextMessage = { type: "REPORT_CONTEXT"; context: PageContext };

export type RuntimeMessage =
  | OpenPanelMessage
  | GetPanelSideMessage
  | ReportContextMessage;
