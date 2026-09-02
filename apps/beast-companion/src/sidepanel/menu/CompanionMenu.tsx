import { useEffect, useRef } from "react";
import type { ThemeId } from "@bc/companion-shared";
import { ThemeSelect } from "./ThemeSelect";
import type { CompanionConnection } from "../connection";
import "./menu.css";

/**
 * Compact anchored menu for the Companion (presentation-only).
 *
 * - mode "popover": a small dropdown anchored beneath the hamburger. A transparent
 *   backdrop catches outside clicks to close; Escape closes (handled in PanelApp).
 *   The client panel + its scroll/section state stay mounted behind it.
 * - mode "templates": the dedicated Message Templates subview (the ONLY view with
 *   a back arrow). The top-level popover has no header/back row.
 *
 * No full-height canvas, no large footer, no CRM navigation.
 */

const TEMPLATE_NAMES = ["Text Top 3", "1st Follow-Up", "2nd Follow-Up", "3rd Follow-Up", "Final Follow-Up"];

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

// Initials fallback for the connection-block avatar (first letter of the first
// one or two name words, uppercased). Empty name → "LB".
function initials(name?: string | null): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "LB";
  const first = parts[0]![0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1]![0] ?? "" : "";
  return (first + second).toUpperCase() || "LB";
}

export function CompanionMenu({
  mode,
  onClose,
  onOpenTemplates,
  onBack,
  theme,
  onPickTheme,
  connection,
  onEditClient,
  canEditClient = false,
}: {
  mode: "popover" | "templates";
  onClose: () => void;
  onOpenTemplates: () => void;
  onBack: () => void;
  theme: ThemeId;
  onPickTheme: (id: ThemeId) => void;
  connection: CompanionConnection;
  // Edit Client — posts the "edit-client" verb so the CRM opens its Add Lead modal
  // in edit mode for the active client. Hidden entirely when no client is active.
  onEditClient?: () => void;
  canEditClient?: boolean;
}) {
  const firstItemRef = useRef<HTMLButtonElement>(null);

  // Move focus into the popover on open (keyboard nav).
  useEffect(() => {
    if (mode === "popover") firstItemRef.current?.focus();
  }, [mode]);

  if (mode === "templates") {
    return (
      <div className="bc-subview" role="dialog" aria-label="Message Templates">
        <div className="bc-subview-head">
          <button type="button" className="bc-icon-btn" onClick={onBack} aria-label="Back" title="Back">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M16 10H4M9 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="bc-subview-title">Message Templates</span>
        </div>
        <div className="bc-subview-body">
          <p className="bc-note">Preview — editable templates arrive in Settings later.</p>
          <ul className="bc-tpl-list">
            {TEMPLATE_NAMES.map((t) => (
              <li key={t} className="bc-tpl-row">
                <span>{t}</span>
                <span className="bc-soon">Coming soon</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // popover
  return (
    <>
      <div className="bc-pop-backdrop" onClick={onClose} aria-hidden />
      <div className="bc-popover" role="menu" aria-label="Companion menu">
        {/* Top actions — the everyday things a locator reaches the menu for. */}
        {canEditClient && (
          <button
            ref={firstItemRef}
            type="button"
            className="bc-pop-item"
            role="menuitem"
            onClick={() => {
              onEditClient?.();
              onClose();
            }}
          >
            <span className="bc-pop-label">Edit Client</span>
          </button>
        )}

        <button
          ref={canEditClient ? undefined : firstItemRef}
          type="button"
          className="bc-pop-item"
          role="menuitem"
          onClick={onOpenTemplates}
        >
          <span className="bc-pop-label">Edit Message Templates</span>
          <Chevron />
        </button>

        <div className="bc-pop-item bc-theme-row">
          <span className="bc-pop-label">Theme</span>
          <ThemeSelect value={theme} onChange={onPickTheme} />
        </div>

        {/* Connection info — who you're signed in as. Read-only; no account actions
            (connection is derived from the authenticated CRM bridge). */}
        <div className="bc-pop-conn">
          {connection.status === "connected" ? (
            <div className="bc-pop-identity">
              {connection.avatarUrl ? (
                <img className="bc-pop-avatar" src={connection.avatarUrl} alt="" />
              ) : (
                <span className="bc-pop-avatar bc-pop-avatar-fallback" aria-hidden>
                  {initials(connection.name)}
                </span>
              )}
              <div className="bc-pop-identity-text">
                <div className="bc-pop-status">Connected as {connection.name || "your account"}</div>
                {connection.workspace && <div className="bc-pop-workspace">{connection.workspace}</div>}
              </div>
            </div>
          ) : connection.status === "connecting" ? (
            <div className="bc-pop-status is-off">
              <span className="bc-dot is-off" aria-hidden /> Connecting…
            </div>
          ) : (
            <div className="bc-pop-status is-off">
              <span className="bc-dot is-off" aria-hidden /> Not connected
            </div>
          )}
        </div>
      </div>
    </>
  );
}
