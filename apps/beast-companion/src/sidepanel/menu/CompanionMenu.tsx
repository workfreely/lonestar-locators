import { useEffect, useRef } from "react";
import { THEME_IDS, type ThemeId } from "@bc/companion-shared";
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

const TEMPLATE_NAMES = ["Text Top 3", "Follow-Up 1", "Follow-Up 2", "Follow-Up 3", "Final Follow-Up"];
const cap = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function CompanionMenu({
  mode,
  onClose,
  onOpenTemplates,
  onBack,
  onDemo,
  theme,
  onPickTheme,
}: {
  mode: "popover" | "templates";
  onClose: () => void;
  onOpenTemplates: () => void;
  onBack: () => void;
  onDemo: (label: string) => void;
  theme: ThemeId;
  onPickTheme: (id: ThemeId) => void;
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
        <button ref={firstItemRef} type="button" className="bc-pop-item" role="menuitem" onClick={onOpenTemplates}>
          <span className="bc-pop-label">Message Templates</span>
          <Chevron />
        </button>

        <div className="bc-pop-item bc-theme-row">
          <span className="bc-pop-label" id="bc-theme-label">Theme</span>
          <select
            className="bc-theme-select"
            value={theme}
            onChange={(e) => onPickTheme(e.target.value as ThemeId)}
            aria-labelledby="bc-theme-label"
          >
            {THEME_IDS.map((id) => (
              <option key={id} value={id}>
                {cap(id)}
              </option>
            ))}
          </select>
        </div>

        <div className="bc-pop-divider" />

        <button type="button" className="bc-pop-item is-quiet" role="menuitem" onClick={() => onDemo("Help & Feedback")}>
          <span className="bc-pop-label">Help &amp; Feedback</span>
        </button>

        <div className="bc-pop-status">
          <span className="bc-dot" aria-hidden /> Connected
        </div>
      </div>
    </>
  );
}
