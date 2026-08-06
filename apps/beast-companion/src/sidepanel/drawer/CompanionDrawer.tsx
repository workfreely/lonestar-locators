import { useState } from "react";
import { THEME_IDS, THEME_REGISTRY, type ThemeId } from "@bc/companion-shared";
import { applyTheme } from "../applyTheme";
import { VERSION } from "@/utils/constants";
import "./drawer.css";

/**
 * Minimal Companion control menu (presentation-only). NOT a mini-CRM and NOT a
 * settings area. Overlays only the body beneath the identity header. Contents:
 * Open Locator Beast · Message Templates · Appearance (theme) · Help & Feedback,
 * with a restrained account/status footer. Everything is inert except Appearance,
 * which applies a shared theme locally (no persistence, no network).
 *
 * Deliberately excluded: Add Lead, Agenda, Tasks, Best Matches, Favorites, AI
 * Insights, Notes, property tools, debug, advanced settings, Switch Client.
 */

const TEMPLATE_NAMES = [
  "Text Top 3",
  "Follow-Up 1",
  "Follow-Up 2",
  "Follow-Up 3",
  "Final Follow-Up",
];

// Sanitized preview account/status — no real user data (Phase 4 auth wires this).
const DEMO_ACCOUNT = { name: "Jamie R.", workspace: "Demo Workspace", initial: "J" };

function ExternalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 4h6v6M20 4l-9 9M18 13v6a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h6" />
    </svg>
  );
}
function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function CompanionDrawer({
  open,
  onClose,
  onDemo,
}: {
  open: boolean;
  onClose: () => void;
  onDemo: (label: string) => void;
}) {
  const [view, setView] = useState<"menu" | "templates">("menu");
  const [theme, setTheme] = useState<ThemeId>("midnight");

  function pickTheme(id: ThemeId) {
    setTheme(applyTheme(id)); // local only — no persistence
  }
  function back() {
    if (view === "templates") setView("menu");
    else onClose();
  }

  return (
    <nav className={`bc-drawer ${open ? "is-open" : ""}`} aria-hidden={!open} aria-label="Companion menu">
      <div className="bc-drawer-head">
        <button type="button" className="bc-icon-btn" onClick={back} aria-label={view === "templates" ? "Back to menu" : "Close menu"} title="Back">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M16 10H4M9 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="bc-drawer-title">{view === "templates" ? "Message Templates" : "Menu"}</span>
      </div>

      {view === "templates" ? (
        <div className="bc-drawer-body">
          <p className="bc-drawer-note">Preview — editable templates arrive in Settings later.</p>
          <ul className="bc-tpl-list">
            {TEMPLATE_NAMES.map((t) => (
              <li key={t} className="bc-tpl-row">
                <span>{t}</span>
                <span className="bc-soon">Coming soon</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="bc-drawer-body">
          <div className="bc-menu-top">
            <button type="button" className="bc-menu-item is-primary" onClick={() => onDemo("Open Locator Beast")}>
              <ExternalIcon />
              <span className="bc-menu-label">Open Locator Beast</span>
            </button>

            <button type="button" className="bc-menu-item" onClick={() => setView("templates")}>
              <span className="bc-menu-label">Message Templates</span>
              <Chevron />
            </button>

            <div className="bc-appearance">
              <span className="bc-appearance-label">Appearance</span>
              <div className="bc-swatches" role="group" aria-label="Theme">
                {THEME_IDS.map((id) => {
                  const p = THEME_REGISTRY[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`bc-swatch ${theme === id ? "is-active" : ""}`}
                      onClick={() => pickTheme(id)}
                      title={id[0].toUpperCase() + id.slice(1)}
                      aria-label={id}
                      aria-pressed={theme === id}
                      style={{ background: p.surface, borderColor: p.border }}
                    >
                      <span className="bc-swatch-dot" style={{ background: p.accent }} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bc-menu-spacer" />

          <button type="button" className="bc-menu-item is-quiet" onClick={() => onDemo("Help & Feedback")}>
            <span className="bc-menu-label">Help &amp; Feedback</span>
          </button>
        </div>
      )}

      <footer className="bc-drawer-foot">
        <div className="bc-acct">
          <span className="bc-avatar" aria-hidden>{DEMO_ACCOUNT.initial}</span>
          <div className="bc-acct-text">
            <span className="bc-acct-name">{DEMO_ACCOUNT.name}</span>
            <span className="bc-acct-ws">{DEMO_ACCOUNT.workspace}</span>
          </div>
        </div>
        <div className="bc-status-row">
          <span className="bc-status"><span className="bc-dot" aria-hidden /> Connected to Locator Beast</span>
          <span className="bc-ver">v{VERSION}</span>
        </div>
      </footer>
    </nav>
  );
}
