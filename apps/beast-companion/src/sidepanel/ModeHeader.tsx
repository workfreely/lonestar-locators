// Shared contextual MODE HEADER — one bar, one styling, used by every mode:
//   • Tour Mode   → REPLACES the Client/Properties nav ("TOUR MODE · ← Back to Client")
//   • Search Mode → sits ABOVE the nav, which stays usable ("SEARCH MODE · ← Back to CRM")
//
// The mode label is the prominent element (same 13px/700 as before, with an accent
// dot); the back link is a lightweight text link, sized ~12.5px — roughly the
// CLIENT/PROPERTIES tab-label size, secondary color for legibility, subordinate to
// the label. Centralized here so the sizing rule stays identical across all modes.
// Presentation only: it renders the label and calls onBack; no workflow/stage logic.

export function ModeHeader({
  label,
  backLabel,
  onBack,
  ariaLabel,
}: {
  label: string;
  backLabel: string;
  onBack?: () => void;
  ariaLabel: string;
}) {
  return (
    <nav className="bc-cp-nav" aria-label={ariaLabel} style={{ display: "flex", alignItems: "center" }}>
      <span
        style={{
          padding: "9px 12px",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.04em",
          color: "var(--lb-text-primary, #e9ebef)",
          display: "flex",
          alignItems: "center",
          gap: 7,
        }}
      >
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--lb-accent, #5b8dff)" }} />
        {label}
      </span>
      <button
        type="button"
        onClick={onBack}
        style={{
          marginLeft: "auto",
          padding: "9px 12px",
          fontSize: 12.5,
          fontWeight: 600,
          color: "var(--lb-text-secondary, #c2c7d0)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
      >
        {backLabel}
      </button>
    </nav>
  );
}
