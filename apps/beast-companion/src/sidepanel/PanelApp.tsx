import { useEffect, useRef, useState } from "react";
import type { LeadSummaryDTO, NextActionDTO, ThemeId } from "@bc/companion-shared";
import { LeadIdentityHeader, LeadPanelBody } from "./lead/LeadPanelView";
import { PanelStateView, type PanelState } from "./lead/PanelStates";
import { CompanionMenu } from "./menu/CompanionMenu";
import { applyTheme } from "./applyTheme";
import { DISCONNECTED, type CompanionConnection } from "./connection";
import "./lead/panel.css";

type MenuMode = "closed" | "popover" | "templates";

/**
 * The Companion's single interface, rendered in the native side panel.
 *
 * Layout: toolbar (hamburger) · identity header (visible when loaded) · body.
 * The hamburger toggles a COMPACT ANCHORED popover beneath it (not a full-height
 * drawer): click opens, click again / outside-click / Escape closes. The client
 * panel + its scroll/section state stay mounted behind the popover. Message
 * Templates opens a dedicated subview — the only view with a back arrow.
 *
 * Chrome's native side-panel X remains the sole close for the whole Companion.
 */
export function PanelApp({
  state = "no-client",
  lead,
  nextActions = [],
  connection = DISCONNECTED,
  onConnect,
  onDisconnect,
}: {
  state?: PanelState;
  lead?: LeadSummaryDTO | null;
  nextActions?: NextActionDTO[];
  // Connection is derived from the SW's authenticated state. Production defaults
  // to DISCONNECTED — the panel is authenticated ONLY when this is "connected".
  connection?: CompanionConnection;
  onConnect?: () => void;
  onDisconnect?: () => void;
}) {
  const [menu, setMenu] = useState<MenuMode>("closed");
  const [demoNote, setDemoNote] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeId>("midnight");
  const noteTimer = useRef<number | undefined>(undefined);

  function onDemo(label: string) {
    setDemoNote(`Demo preview — “${label}” is inactive`);
    if (noteTimer.current) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setDemoNote(null), 2200);
  }
  function pickTheme(id: ThemeId) {
    setTheme(applyTheme(id)); // local only — no persistence this phase
  }

  // Escape closes the menu (popover or subview).
  useEffect(() => {
    if (menu === "closed") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu("closed");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const connected = connection.status === "connected";
  // The lead panel is authenticated data — only shown when truly connected.
  const isLoaded = connected && state === "loaded" && !!lead;
  const handleConnect = () => onConnect?.();
  const handleDisconnect = () => onDisconnect?.();

  return (
    <div className="bc-panel">
      {/* Compact dark toolbar — hamburger is the menu toggle. */}
      <header className="bc-toolbar">
        <button
          type="button"
          className="bc-icon-btn"
          onClick={() => setMenu((m) => (m === "closed" ? "popover" : "closed"))}
          aria-haspopup="menu"
          aria-expanded={menu === "popover"}
          aria-label={menu === "closed" ? "Open menu" : "Close menu"}
          title="Menu"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {isLoaded && <LeadIdentityHeader lead={lead!} onDemo={onDemo} />}

      {/* Body — stays mounted behind the menu, so scroll + section state persist. */}
      <div className="bc-below">
        <div className="bc-below-scroll">
          {!connected ? (
            // Pre-authenticated: never show lead data. Explain the user must connect.
            <PanelStateView
              state={connection.status === "connecting" ? "connecting" : "not-connected"}
              onConnect={handleConnect}
            />
          ) : isLoaded ? (
            <LeadPanelBody lead={lead!} nextActions={nextActions} onDemo={onDemo} />
          ) : (
            <PanelStateView state={state === "loaded" ? "no-client" : state} onConnect={handleConnect} />
          )}
        </div>
      </div>

      {menu !== "closed" && (
        <CompanionMenu
          mode={menu}
          onClose={() => setMenu("closed")}
          onOpenTemplates={() => setMenu("templates")}
          onBack={() => setMenu("closed")}
          onDemo={onDemo}
          theme={theme}
          onPickTheme={pickTheme}
          connection={connection}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
        />
      )}

      {demoNote && (
        <div className="lp-demo-toast" role="status">
          {demoNote}
        </div>
      )}
    </div>
  );
}
