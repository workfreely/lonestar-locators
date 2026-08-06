import { useState } from "react";
import type { LeadSummaryDTO, NextActionDTO } from "@bc/companion-shared";
import { LeadPanelView } from "./lead/LeadPanelView";
import { PanelStateView, type PanelState } from "./lead/PanelStates";
import "./lead/panel.css";

/**
 * The Companion's single interface, rendered in the native side panel.
 *
 * Control model (per product direction):
 *  - Chrome's native side-panel X is the SOLE control that closes the whole
 *    Companion. There is intentionally NO close control in our internal toolbar.
 *  - The internal toolbar's hamburger toggles the navigation/settings DRAWER.
 *  - The drawer's back arrow closes ONLY the drawer and returns to the workspace.
 *
 * State preservation: the drawer OVERLAYS the workspace, which stays mounted the
 * whole time, so the active client, section, form state, and scroll are kept.
 *
 * Phase 3: the workspace renders the lead panel from PROPS only — sanitized demo
 * data in the dev harness, or a non-loaded state in production (no live data yet).
 */
export function PanelApp({
  state = "no-client",
  lead,
  nextActions = [],
}: {
  state?: PanelState;
  lead?: LeadSummaryDTO | null;
  nextActions?: NextActionDTO[];
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="bc-panel">
      {/* Compact dark toolbar — hamburger ONLY (Chrome's native header shows the
          name; Chrome's native X closes). */}
      <header className="bc-toolbar">
        <button
          type="button"
          className="bc-icon-btn"
          onClick={() => setDrawerOpen((o) => !o)}
          aria-label="Open navigation menu"
          aria-expanded={drawerOpen}
          title="Menu"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* Persistent client workspace — always mounted. */}
      <div className="bc-workspace">
        {state === "loaded" && lead ? (
          <LeadPanelView lead={lead} nextActions={nextActions} />
        ) : (
          <PanelStateView state={state === "loaded" ? "no-client" : state} />
        )}
      </div>

      {/* Navigation / settings drawer — overlays the workspace below the toolbar. */}
      <nav className={`bc-drawer ${drawerOpen ? "is-open" : ""}`} aria-hidden={!drawerOpen}>
        <div className="bc-drawer-head">
          <button
            type="button"
            className="bc-icon-btn"
            onClick={() => setDrawerOpen(false)}
            aria-label="Back to workspace"
            title="Back"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M16 10H4M9 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="bc-drawer-title">Menu</span>
        </div>
        <div className="bc-drawer-body">
          <p className="bc-drawer-note">Navigation &amp; settings coming soon.</p>
        </div>
      </nav>
    </div>
  );
}
