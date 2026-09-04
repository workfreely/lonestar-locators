import { useState } from "react";
import type { AutofillOutcome } from "./runAutofill";

// The Schedule Tour autofill control. Shown by PanelApp ONLY when the active tab is
// an external tour/scheduler page (see useActiveTourTab), so it appears exactly
// when the locator is on the page they want filled — in BOTH the Client and
// Properties views. Best-effort: requests a per-site permission on click, never
// submits, and every non-fill outcome degrades to a clear manual-fallback hint.
export function AutofillAction({
  onAutofillTour,
  host,
}: {
  onAutofillTour: () => Promise<AutofillOutcome>;
  /** The active external tab's host, shown so the locator knows what will be filled. */
  host: string;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function go() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const out = await onAutofillTour();
      switch (out.status) {
        case "filled":
          setMsg(`Filled ${out.result.filled} field${out.result.filled === 1 ? "" : "s"} — review and submit on the page.`);
          break;
        case "no-fields": {
          const triggers = out.result.tourTriggers ?? [];
          const hint = triggers.length
            ? `Open the scheduler (${triggers.slice(0, 2).join(" / ")}) or pick a tour time to reveal the form, then Autofill again.`
            : "No fillable fields visible yet — for a calendar/multi-step or pop-up scheduler, open it / pick a tour time, then Autofill again. Otherwise fill it manually.";
          setMsg(hint);
          break;
        }
        case "denied":
          setMsg("Permission not granted — the tour page stays open to fill manually.");
          break;
        case "on-crm":
          setMsg("Switch to the property's tour/scheduler tab, then click Autofill.");
          break;
        case "no-tab":
          setMsg("Open the tour page (Schedule Tour), switch to it, then click Autofill.");
          break;
        case "unsupported":
          setMsg("This page can't be autofilled — fill it manually.");
          break;
        default:
          setMsg("Couldn't autofill this form — fill it manually.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        margin: "0 0 10px",
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        border: "1px solid var(--lb-border, #2b3140)",
        borderRadius: 10,
        background: "var(--lb-inset, rgba(255,255,255,0.03))",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={go}
          disabled={busy}
          style={{
            font: "inherit",
            fontSize: 12,
            fontWeight: 600,
            color: "#fff",
            background: "var(--lb-accent, #5b8dff)",
            border: "none",
            borderRadius: 8,
            padding: "6px 12px",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Autofilling…" : "Autofill tour form"}
        </button>
        <span style={{ fontSize: 11, color: "var(--lb-text-muted, #8b93a3)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {host}
        </span>
      </div>
      {msg && <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.35, color: "var(--lb-text-muted, #8b93a3)" }}>{msg}</p>}
    </div>
  );
}
