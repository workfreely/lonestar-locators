/**
 * Shared internal contracts.
 *
 * Native hybrid model: the launcher (content script) asks the BACKGROUND to open
 * the native side panel (Chrome requires this to originate from a user gesture).
 * There is deliberately NO programmatic close — Chrome's native side-panel X is
 * the sole way to close the Companion.
 */

/** Whether the companion side panel is open or closed (tracked in storage). */
export type PanelState = "open" | "closed";

/** Content → Background: open the native side panel for the sender's tab. */
export type OpenPanelMessage = { type: "OPEN_PANEL" };

export type RuntimeMessage = OpenPanelMessage;
