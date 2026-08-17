// Client / Properties top-level navigation (Phase 1 — visual/navigation only).
// A lightweight two-area tab row: CLIENT and PROPERTIES each fill half the width,
// active label prominent with a thin Locator Beast accent underline, inactive
// muted. No pills, cards, rounded backgrounds, or folder shapes. It sits directly
// below the hamburger toolbar and directly above the client identity. It carries
// NO workflow or data logic — it only reports which view is selected.

export type CompanionView = "client" | "properties";

export function ClientPropertiesNav({
  active,
  onChange,
}: {
  active: CompanionView;
  onChange: (view: CompanionView) => void;
}) {
  return (
    <nav className="bc-cp-nav" role="tablist" aria-label="Client or Properties">
      <button
        type="button"
        role="tab"
        aria-selected={active === "client"}
        className={`bc-cp-tab${active === "client" ? " is-active" : ""}`}
        onClick={() => onChange("client")}
      >
        Client
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === "properties"}
        className={`bc-cp-tab${active === "properties" ? " is-active" : ""}`}
        onClick={() => onChange("properties")}
      >
        Properties
      </button>
    </nav>
  );
}
