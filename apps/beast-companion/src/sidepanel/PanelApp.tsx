import { useRef, useState } from "react";
import type { LeadSummaryDTO, NextActionDTO } from "@bc/companion-shared";
import { LeadIdentityHeader, LeadPanelBody } from "./lead/LeadPanelView";
import { PanelStateView, type PanelState } from "./lead/PanelStates";
import { CompanionDrawer } from "./drawer/CompanionDrawer";
import "./lead/panel.css";

/**
 * The Companion's single interface, rendered in the native side panel.
 *
 * Layout: toolbar (hamburger) · the active-client identity header (stays visible
 * when a client is loaded) · the body region. The hamburger drawer overlays ONLY
 * the body region — so the identity + Call/Text stay visible, and the body's
 * section/scroll state is preserved underneath and restored on close.
 *
 * Control model: Chrome's native side-panel X is the sole close for the whole
 * Companion. The hamburger toggles the drawer; the drawer's back arrow returns to
 * the panel (or up one level from a drawer sub-view).
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
  const [demoNote, setDemoNote] = useState<string | null>(null);
  const noteTimer = useRef<number | undefined>(undefined);

  function onDemo(label: string) {
    setDemoNote(`Demo preview — “${label}” is inactive`);
    if (noteTimer.current) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setDemoNote(null), 2200);
  }

  const isLoaded = state === "loaded" && !!lead;

  return (
    <div className="bc-panel">
      {/* Compact dark toolbar — hamburger ONLY. */}
      <header className="bc-toolbar">
        <button
          type="button"
          className="bc-icon-btn"
          onClick={() => setDrawerOpen((o) => !o)}
          aria-label={drawerOpen ? "Close menu" : "Open menu"}
          aria-expanded={drawerOpen}
          title="Menu"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* Identity header — stays visible above the drawer when a client is loaded. */}
      {isLoaded && <LeadIdentityHeader lead={lead!} onDemo={onDemo} />}

      {/* Body region — the drawer overlays ONLY this. The scroll container stays
          mounted underneath the drawer, preserving section + scroll state. */}
      <div className="bc-below">
        <div className="bc-below-scroll">
          {isLoaded ? (
            <LeadPanelBody lead={lead!} nextActions={nextActions} onDemo={onDemo} />
          ) : (
            <PanelStateView state={state === "loaded" ? "no-client" : state} />
          )}
        </div>
        <CompanionDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onDemo={onDemo} />
      </div>

      {demoNote && (
        <div className="lp-demo-toast" role="status">
          {demoNote}
        </div>
      )}
    </div>
  );
}
