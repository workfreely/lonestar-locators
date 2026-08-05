/**
 * Shared internal contracts.
 *
 * Native hybrid model:
 *  - the launcher (content script) asks the BACKGROUND to open the native side
 *    panel (Chrome requires this to originate from a user gesture),
 *  - and asks the SIDE PANEL page to close itself (the panel calls window.close(),
 *    since Chrome has no programmatic close API).
 */

/** Whether the companion side panel is open or closed (tracked in storage). */
export type PanelState = "open" | "closed";

/** Content → Background: open the native side panel for the sender's tab. */
export type OpenPanelMessage = { type: "OPEN_PANEL" };

/** Content → Side-panel page: the panel should close itself. */
export type ClosePanelMessage = { type: "CLOSE_PANEL" };

export type RuntimeMessage = OpenPanelMessage | ClosePanelMessage;
