import { useState } from "react";
import { LogoLockup, LogoMark } from "@/components/Logo";
import { VERSION } from "@/utils/constants";

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
 * whole time. Opening/closing the drawer never unmounts the workspace, so the
 * active client, selected section, form state, and scroll position are all
 * preserved automatically.
 */
export function PanelApp() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="bc-panel">
      {/* Compact dark toolbar — hamburger only; no whole-panel close here. */}
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
        <LogoLockup />
      </header>

      {/* Persistent client workspace (placeholder for now — always mounted). */}
      <div className="bc-workspace">
        <div className="bc-hero">
          <LogoMark size={56} radius={14} />
          <h1 className="bc-title">Beast Companion</h1>
          <p className="bc-subtitle">Chrome Extension</p>
          <span className="bc-version">Version {VERSION}</span>
          <span className="bc-badge">Coming Soon</span>
        </div>
      </div>

      {/* Navigation / settings drawer — overlays the workspace below the toolbar.
          The back arrow closes ONLY the drawer. */}
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
