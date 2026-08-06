/**
 * Shared internal contracts.
 *
 * Native hybrid model: the launcher (content script) asks the BACKGROUND to
 * open/close the native side panel. Chrome requires open() (and close()) to
 * originate from a user gesture, so the launcher forwards the click synchronously.
 *
 * The SERVICE WORKER is the single source of truth for open/closed state. It
 * learns the true state from Chrome's native lifecycle events (sidePanel.onOpened
 * / onClosed) — never from pagehide or delayed storage — and toggles accordingly.
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

/** Content → Background: toggle the native side panel for the sender's tab. */
export type TogglePanelMessage = { type: "TOGGLE_PANEL" };

/** Content → Background: which side is the panel on? Response: { side: PanelSide }. */
export type GetPanelSideMessage = { type: "GET_PANEL_SIDE" };

/** Content → Background: report the current page context (URL/site/section). */
export type ReportContextMessage = { type: "REPORT_CONTEXT"; context: PageContext };

export type RuntimeMessage =
  | TogglePanelMessage
  | GetPanelSideMessage
  | ReportContextMessage;
