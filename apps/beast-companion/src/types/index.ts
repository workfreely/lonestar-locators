/**
 * Shared types for the extension's internal contracts.
 *
 * These are intentionally small for phase 1. When the CRM API and Smart
 * Apartment Data integration land, their DTOs should live in a shared
 * `packages/types` workspace (see README/ARCHITECTURE) and be imported here so
 * the CRM and the companion never diverge on shape.
 */

/** Whether the companion panel is expanded or collapsed. */
export type PanelState = "open" | "closed";

/**
 * Messages passed between the background service worker and the content script.
 * A discriminated union keeps every sender/handler type-safe and makes adding a
 * new message (e.g. an auth handshake later) a compile-time-checked change.
 */
export type RuntimeMessage = { type: "TOGGLE_PANEL" } | { type: "PING" };

/** How the host page makes room for the panel. `push` is preferred; `overlay`
 *  is the safe fallback for pages that cannot be resized cleanly. */
export type LayoutMode = "push" | "overlay";
