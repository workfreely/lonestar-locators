import { useEffect, useRef, useState } from "react";
import { formatPersonName, type ThemeId } from "@bc/companion-shared";
import { ThemeSelect } from "./ThemeSelect";
import { OutOfOfficeControl } from "./OutOfOfficeControl";
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
  onAddTask,
  canEditClient = false,
  editClientFirstName,
  onEditTemplates,
  textTop3On = false,
  aiVoiceScriptOn = false,
  onToggleTextTop3,
  onToggleAiVoiceScript,
  automatedTexting,
  onToggleAutomatedTexts,
}: {
  onClose: () => void;
  theme: ThemeId;
  onPickTheme: (id: ThemeId) => void;
  connection: CompanionConnection;
  // Edit Client — posts the "edit-client" verb so the CRM opens its Add Lead modal
  // in edit mode for the active client. Hidden entirely when no client is active.
  onEditClient?: () => void;
  /** Opens the Companion's own Add Task sheet for the active client. */
  onAddTask?: () => void;
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
  // Per-client Automated Texts (account authorization + this lead's enrollment).
  // The row renders ONLY for an authorized account (private rollout). Toggling
  // posts the "automated-texting" verb; the CRM is the authoritative writer.
  automatedTexting?: { authorized: boolean; enrolled: boolean };
  onToggleAutomatedTexts?: (enabled: boolean) => void;
}) {
  const firstItemRef = useRef<HTMLButtonElement>(null);

  // Which view the popover is showing. "menu" is the list; "ooo" replaces it with
  // the Out of Office control. Local to the popover — closing the menu discards
  // it, and the control re-reads its state from the server on every open anyway.
  const [view, setView] = useState<"menu" | "ooo">("menu");

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
        {view === "ooo" ? (
          <OutOfOfficeControl onBack={() => setView("menu")} />
        ) : (
        <>
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

        {/* ADD TASK — directly below Edit Client Profile. It lives in the menu rather than the
            panel so the everyday client view gains no new button; the sheet it opens is the one
            that already existed. Shown only with an active client, since a task needs one. */}
        {onAddTask && (
          <button
            ref={canEditClient ? undefined : firstItemRef}
            type="button"
            className="bc-pop-item"
            role="menuitem"
            onClick={() => {
              onAddTask();
              onClose();
            }}
          >
            <span className="bc-pop-label">Add Task</span>
          </button>
        )}

        <button
          ref={canEditClient || onAddTask ? undefined : firstItemRef}
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
        {/* Automated Texts — per-client On/Off, authorized accounts only. Sits
            directly above Voicemail Script. Posts the "automated-texting" verb; the
            CRM performs the authoritative enrollment flip. */}
        {automatedTexting?.authorized && (
          <div className="bc-pop-item bc-theme-row" role="menuitem">
            <span className="bc-pop-label">Automated Texts</span>
            <PrefToggle
              on={automatedTexting.enrolled}
              onToggle={() => onToggleAutomatedTexts?.(!automatedTexting.enrolled)}
              label="Automated Texts"
            />
          </div>
        )}
        <div className="bc-pop-item bc-theme-row" role="menuitem">
          <span className="bc-pop-label">Voicemail Script</span>
          <PrefToggle on={aiVoiceScriptOn} onToggle={onToggleAiVoiceScript} label="Voicemail Script" />
        </div>

        {/* OUT OF OFFICE — opens the control rather than toggling inline. It is
            workspace state with a return date and a public page behind it, not an
            agent preference, so it gets a view and an explicit status instead of a
            bare switch the locator could flip by accident. */}
        <button
          type="button"
          className="bc-pop-item"
          role="menuitem"
          onClick={(e) => {
            e.stopPropagation();
            setView("ooo");
          }}
        >
          <span className="bc-pop-label">Out of Office</span>
          <svg className="bc-pop-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
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
        </>
        )}
      </div>
    </>
  );
}
