import { useEffect, useRef } from "react";
import { formatPersonName, type ThemeId } from "@bc/companion-shared";
import { ThemeSelect } from "./ThemeSelect";
import type { CompanionConnection } from "../connection";
import "./menu.css";

/**
 * Compact anchored menu for the Companion (presentation-only). A small dropdown
 * anchored beneath the hamburger; a transparent backdrop catches outside clicks
 * to close; Escape closes (handled in PanelApp). The client panel + its scroll/
 * section state stay mounted behind it. No full-height canvas, no CRM navigation.
 *
 * "Edit Follow-up Templates" is a LAUNCHER only — it posts the edit-templates
 * verb so the CRM opens its template editor. Editing never happens in-Companion.
 */

// Compact ON/OFF preference switch — presentation only, native to the menu
// (styled in menu.css). Mirrors the Theme row's right-aligned control treatment.
function PrefToggle({ on, onToggle, label }: { on: boolean; onToggle?: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`bc-toggle${on ? " is-on" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
    >
      <span className="bc-toggle-knob" aria-hidden />
    </button>
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
  onClose,
  theme,
  onPickTheme,
  connection,
  onEditClient,
  canEditClient = false,
  editClientFirstName,
  onEditTemplates,
  textTop3On = false,
  aiVoiceScriptOn = false,
  onToggleTextTop3,
  onToggleAiVoiceScript,
}: {
  onClose: () => void;
  theme: ThemeId;
  onPickTheme: (id: ThemeId) => void;
  connection: CompanionConnection;
  // Edit Client — posts the "edit-client" verb so the CRM opens its Add Lead modal
  // in edit mode for the active client. Hidden entirely when no client is active.
  onEditClient?: () => void;
  canEditClient?: boolean;
  // Active client's first name — DISPLAY ONLY, for the dynamic label. The verb,
  // workflow, CRM modal, and client-id resolution are unchanged.
  editClientFirstName?: string | null;
  // Edit Follow-up Templates — LAUNCHER only. Posts the "edit-templates" verb so
  // the CRM opens its template editor. Always available (workspace-level).
  onEditTemplates?: () => void;
  // Agent-level preference toggles (persisted by the container in
  // chrome.storage.local). Presentation only here — no generation/workflow.
  textTop3On?: boolean;
  aiVoiceScriptOn?: boolean;
  onToggleTextTop3?: () => void;
  onToggleAiVoiceScript?: () => void;
}) {
  const firstItemRef = useRef<HTMLButtonElement>(null);

  // Dynamic Edit Client label — "Edit {First}’s Profile" using the active client's
  // first name only; falls back to "Edit Client Profile" when no name is available.
  // Display copy only — nothing here changes the edit-client verb or behavior.
  const editFirst = formatPersonName(editClientFirstName ?? "").trim();
  const editClientLabel = editFirst ? `Edit ${editFirst}’s Profile` : "Edit Client Profile";

  // Move focus into the popover on open (keyboard nav).
  useEffect(() => {
    firstItemRef.current?.focus();
  }, []);

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
            <span className="bc-pop-label">{editClientLabel}</span>
          </button>
        )}

        <button
          ref={canEditClient ? undefined : firstItemRef}
          type="button"
          className="bc-pop-item"
          role="menuitem"
          onClick={() => {
            onEditTemplates?.();
            onClose();
          }}
        >
          <span className="bc-pop-label">Edit Follow-up Templates</span>
        </button>

        {/* Agent-level preference toggles — PREFERENCE ONLY (no automatic behavior).
            Text Top 3 and Voicemail Script features/code are preserved; their eventual
            workflows are a separate decision. Compact rows, native to the menu. */}
        <div className="bc-pop-item bc-theme-row" role="menuitem">
          <span className="bc-pop-label">Text Top 3</span>
          <PrefToggle on={textTop3On} onToggle={onToggleTextTop3} label="Text Top 3" />
        </div>
        <div className="bc-pop-item bc-theme-row" role="menuitem">
          <span className="bc-pop-label">Voicemail Script</span>
          <PrefToggle on={aiVoiceScriptOn} onToggle={onToggleAiVoiceScript} label="Voicemail Script" />
        </div>

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
