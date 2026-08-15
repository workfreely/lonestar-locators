import { useState, type CSSProperties } from "react";
import { from24Hour, to24Hour, formatTimeLabel, type Period } from "@bc/companion-shared";

/**
 * Tour Time field — a deliberate, Done/Apply time picker (mirrors the CRM Add
 * Task DateTimePicker's time-selection UX) rather than a raw <input type="time">
 * that commits on every keystroke. The 12h↔24h conversion is the SHARED helper
 * (to24Hour/from24Hour), the exact one the CRM DateTimePicker uses, so the two
 * surfaces can never drift.
 *
 * Interaction: the field shows the committed label ("9:00 AM"). Tap → an inline
 * hour/minute/AM-PM popover opens on a DRAFT copy. "Done" commits the draft;
 * "Cancel" (or reopening) discards it — a changed-but-uncommitted draft never
 * leaks into the field. The committed value is always a wall-clock "HH:mm".
 */
export function TourTimeField({
  value,
  onChange,
}: {
  value: string; // committed "HH:mm"
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Draft parts — seeded from the committed value each time the picker opens, so
  // a prior discarded edit can't linger.
  const [draft, setDraft] = useState(() => from24Hour(value));

  const openPicker = () => {
    setDraft(from24Hour(value)); // reseed from the committed value
    setOpen(true);
  };
  const commit = () => {
    onChange(to24Hour(draft.hour12, draft.minute, draft.period));
    setOpen(false);
  };
  const cancel = () => setOpen(false); // discard the draft — nothing committed

  const label = formatTimeLabel(value);

  return (
    <div>
      <button type="button" onClick={open ? cancel : openPicker} style={FIELD_BTN} aria-expanded={open}>
        <span style={{ color: label ? "var(--lb-text, #e6ebf5)" : "var(--lb-text-muted, #9aa4b2)" }}>
          {label || "Select a time"}
        </span>
        <span aria-hidden style={{ color: "var(--lb-text-muted, #9aa4b2)", fontSize: 12 }}>🕘</span>
      </button>

      {open && (
        <div style={POPOVER}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <select
              value={draft.hour12}
              onChange={(e) => setDraft((d) => ({ ...d, hour12: Number(e.target.value) }))}
              style={SELECT}
              aria-label="Hour"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            <span style={{ fontWeight: 700, color: "var(--lb-text-muted, #9aa4b2)" }}>:</span>
            <select
              value={draft.minute}
              onChange={(e) => setDraft((d) => ({ ...d, minute: Number(e.target.value) }))}
              style={SELECT}
              aria-label="Minute"
            >
              {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
              ))}
            </select>
            <select
              value={draft.period}
              onChange={(e) => setDraft((d) => ({ ...d, period: e.target.value as Period }))}
              style={SELECT}
              aria-label="AM or PM"
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
            <button type="button" onClick={cancel} style={GHOST_BTN}>Cancel</button>
            <button type="button" onClick={commit} style={DONE_BTN}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

const FIELD_BTN: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "9px 10px",
  borderRadius: 9,
  border: "1px solid var(--lb-border, rgba(255,255,255,0.14))",
  background: "var(--lb-inset, rgba(255,255,255,0.04))",
  color: "var(--lb-text, #e6ebf5)",
  fontSize: 14,
  textAlign: "left",
  cursor: "pointer",
};
const POPOVER: CSSProperties = {
  marginTop: 6,
  padding: 10,
  borderRadius: 10,
  border: "1px solid var(--lb-border, rgba(255,255,255,0.14))",
  background: "var(--lb-surface, #14171f)",
};
const SELECT: CSSProperties = {
  appearance: "none",
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid var(--lb-border, rgba(255,255,255,0.14))",
  background: "var(--lb-inset, rgba(255,255,255,0.04))",
  color: "var(--lb-text, #e6ebf5)",
  fontSize: 13,
  cursor: "pointer",
};
const DONE_BTN: CSSProperties = {
  padding: "7px 14px",
  borderRadius: 8,
  border: "1px solid var(--lb-accent, #3b82f6)",
  background: "var(--lb-accent, #3b82f6)",
  color: "#fff",
  fontWeight: 600,
  fontSize: 12.5,
  cursor: "pointer",
};
const GHOST_BTN: CSSProperties = {
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid var(--lb-border, rgba(255,255,255,0.14))",
  background: "transparent",
  color: "var(--lb-text-muted, #9aa4b2)",
  fontWeight: 600,
  fontSize: 12.5,
  cursor: "pointer",
};
