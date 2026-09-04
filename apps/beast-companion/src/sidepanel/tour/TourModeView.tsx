import { useState } from "react";
import { PropertyThumb } from "../properties/PropertyThumb";
import { TourTimeField } from "../lead/TourTimeField";
import { displayAddress, formatRating, DEFAULT_TIME_VALUE, type FavoriteDTO, type AutofillLocator } from "@bc/companion-shared";
import type { AutofillOutcome } from "../autofill/runAutofill";

// The data Beast will use for autofill (compact preview). Client → prospect fields;
// locator → message/comments only (never client fields).
export type TourModeClient = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  moveDate?: string | null;
  bedrooms?: string | null;
};

const CTA: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "center",
  marginTop: 12,
  padding: "11px",
  borderRadius: 10,
  background: "var(--lb-accent, #5b8dff)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  border: "none",
  cursor: "pointer",
};

function kv(k: string, v: string | null | undefined) {
  if (!v) return null;
  return (
    <div style={{ display: "flex", fontSize: 11.5, padding: "2px 0", color: "var(--lb-text-secondary, #c2c7d0)" }}>
      <span style={{ color: "var(--lb-text-muted, #8b93a3)", width: 98, flex: "none" }}>{k}</span>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{v}</span>
    </div>
  );
}

/**
 * Tour Mode — a focused, temporary view for scheduling the ONE selected favorite.
 * Card + full-width Autofill + collapsed data preview + manual date/time → Confirm
 * (which the parent routes to the existing `complete-setup-tour` / lead_tours flow).
 * No Recommendations/Favorites, no Recommend action, never auto-submits. "Back to
 * Client" lives in the parent's Tour Mode nav.
 */
export function TourModeView({
  favorite,
  propertyNameFallback,
  client,
  locator,
  onAutofillTour,
  onConfirmTour,
}: {
  favorite: FavoriteDTO | null;
  propertyNameFallback: string | null;
  client: TourModeClient;
  locator: AutofillLocator | null;
  onAutofillTour: () => Promise<AutofillOutcome>;
  onConfirmTour: (args: { tourDate: string; tourTime: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tourDate, setTourDate] = useState("");
  const [tourTime, setTourTime] = useState(DEFAULT_TIME_VALUE);

  const name = favorite?.propertyName ?? propertyNameFallback ?? "This property";
  const address = favorite?.propertyAddress ?? null;
  const rating = typeof favorite?.googleRating === "number" ? favorite.googleRating : null;

  async function autofill() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const out = await onAutofillTour();
      switch (out.status) {
        case "filled":
          setMsg(`Filled ${out.result.filled} field${out.result.filled === 1 ? "" : "s"} — review and submit on the scheduler.`);
          break;
        case "no-fields": {
          const t = out.result.tourTriggers ?? [];
          setMsg(
            t.length
              ? `No fillable fields yet — open the scheduler (${t.slice(0, 2).join(" / ")}) or select a tour time, then Autofill again.`
              : "No fillable fields visible yet — select a tour time / open the scheduler, then click Autofill Tour Form again.",
          );
          break;
        }
        case "denied":
          setMsg("Permission not granted — the scheduler stays open to fill manually.");
          break;
        case "on-crm":
          setMsg("Switch to the property's scheduler tab, then click Autofill Tour Form.");
          break;
        case "no-tab":
          setMsg("Open the scheduler tab, then click Autofill Tour Form.");
          break;
        case "unsupported":
          setMsg("This page can't be autofilled — fill it manually.");
          break;
        default:
          setMsg("Couldn't autofill — fill it manually.");
      }
    } finally {
      setBusy(false);
    }
  }

  const openNativePicker = (e: { currentTarget: HTMLInputElement }) => {
    try {
      (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      /* no gesture / unsupported — still a normal input */
    }
  };

  const canSave = !!tourDate && !!tourTime;

  return (
    <div style={{ padding: 12 }}>
      <p style={{ margin: "0 0 8px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--lb-text-muted, #8b93a3)", fontWeight: 700 }}>
        Scheduling Tour For
      </p>

      {/* Property card */}
      <div style={{ display: "flex", gap: 11, alignItems: "center", background: "var(--lb-inset, #12151c)", border: "1px solid var(--lb-border-soft, #242a37)", borderRadius: 11, padding: 10 }}>
        <PropertyThumb src={favorite?.propertyImageUrl ?? null} alt={name} size={56} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--lb-text-primary, #e9ebef)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
          {address && <div style={{ fontSize: 11.5, color: "var(--lb-text-muted, #8b93a3)", marginTop: 1 }}>{displayAddress(address)}</div>}
          {rating != null && (
            <div style={{ marginTop: 3, fontSize: 11, color: "#f5b301" }}>
              {formatRating(rating)} <span aria-hidden="true">★★★★★</span>
            </div>
          )}
        </div>
      </div>

      {/* Primary action */}
      <button type="button" onClick={autofill} disabled={busy} style={{ ...CTA, opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}>
        {busy ? "Autofilling…" : "Autofill Tour Form"}
      </button>
      <p style={{ margin: "8px 2px 0", fontSize: 11.5, lineHeight: 1.4, color: "var(--lb-text-muted, #8b93a3)" }}>
        {msg ?? "Fills the scheduler open in your active tab. Never submits; won't overwrite anything you've changed."}
      </p>

      {/* Data preview — collapsed by default */}
      <details style={{ marginTop: 12, border: "1px solid var(--lb-border-soft, #242a37)", borderRadius: 10, overflow: "hidden" }}>
        <summary style={{ listStyle: "none", cursor: "pointer", padding: "8px 11px", fontSize: 11.5, fontWeight: 600, color: "var(--lb-text-secondary, #c2c7d0)", background: "var(--lb-inset, #12151c)" }}>
          Data Beast will use
        </summary>
        <div style={{ padding: "8px 11px" }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--lb-text-muted, #8b93a3)", margin: "2px 0 5px", fontWeight: 700 }}>Client → prospect fields</div>
          {kv("Name", [client.firstName, client.lastName].filter(Boolean).join(" ") || null)}
          {kv("Email", client.email)}
          {kv("Phone", client.phone)}
          {kv("Move date", client.moveDate)}
          {kv("Bedrooms", client.bedrooms)}
        </div>
        <div style={{ padding: "8px 11px", borderTop: "1px solid var(--lb-border-soft, #242a37)" }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--lb-text-muted, #8b93a3)", margin: "2px 0 5px", fontWeight: 700 }}>Locator → message/comments only</div>
          {kv("Name", [locator?.firstName, locator?.lastName].filter(Boolean).join(" ") || null)}
          {kv("Phone", locator?.phone)}
          {kv("Email", locator?.email)}
          {kv("Title / Broker", [locator?.title, locator?.brokerage].filter(Boolean).join(" · ") || null)}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--lb-text-muted, #8b93a3)", padding: "6px 11px 9px", borderTop: "1px solid var(--lb-border-soft, #242a37)", fontStyle: "italic" }}>
          Locator info never goes into prospect/client fields.
        </div>
      </details>

      {/* Manual date/time → Confirm (v1). Runtime capture is the follow-up. */}
      <div style={{ marginTop: 12, background: "var(--lb-inset, #12151c)", border: "1px solid var(--lb-border, #2b3140)", borderRadius: 11, padding: 11 }}>
        <div style={{ fontSize: 13, color: "var(--lb-text-primary, #e9ebef)", fontWeight: 600, marginBottom: 8 }}>When is the tour?</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="date"
            value={tourDate}
            onChange={(e) => setTourDate(e.target.value)}
            onClick={openNativePicker}
            style={{ font: "inherit", fontSize: 12, color: "var(--lb-text-secondary, #c2c7d0)", background: "var(--lb-card, #1e222c)", border: "1px solid var(--lb-border, #2b3140)", borderRadius: 8, padding: "8px 10px", colorScheme: "dark" }}
          />
          <TourTimeField value={tourTime} onChange={setTourTime} />
        </div>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => canSave && onConfirmTour({ tourDate, tourTime })}
          style={{ ...CTA, marginTop: 10, background: canSave ? "var(--lb-good, #10b981)" : "var(--lb-card, #1e222c)", color: canSave ? "#fff" : "var(--lb-text-muted, #8b93a3)", cursor: canSave ? "pointer" : "not-allowed" }}
        >
          Save tour
        </button>
        <p style={{ margin: "8px 2px 0", fontSize: 10.5, lineHeight: 1.4, color: "var(--lb-text-muted, #8b93a3)" }}>
          After you book on the scheduler, set the date/time here. Save runs the existing tour workflow, then returns to Client.
        </p>
      </div>
    </div>
  );
}
