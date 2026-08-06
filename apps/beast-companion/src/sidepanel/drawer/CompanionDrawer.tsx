import { useState } from "react";
import { THEME_IDS, type ThemeId } from "@bc/companion-shared";
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

function cap(id: string) {
  return id.charAt(0).toUpperCase() + id.slice(1);
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
            <button type="button" className="bc-menu-item" onClick={() => setView("templates")}>
              <span className="bc-menu-label">Message Templates</span>
              <Chevron />
            </button>

            {/* Inline Theme dropdown — same option names/order as the CRM. Applies
                locally (no persistence) this phase; later a single shared user
                preference syncs the theme between Locator Beast and the Companion. */}
            <div className="bc-menu-item bc-theme-row">
              <span className="bc-menu-label" id="bc-theme-label">Theme</span>
              <select
                className="bc-theme-select"
                value={theme}
                onChange={(e) => pickTheme(e.target.value as ThemeId)}
                aria-labelledby="bc-theme-label"
              >
                {THEME_IDS.map((id) => (
                  <option key={id} value={id}>
                    {cap(id)}
                  </option>
                ))}
              </select>
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
