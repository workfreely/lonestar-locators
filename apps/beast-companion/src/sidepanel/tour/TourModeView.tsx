import { useEffect, useState } from "react";
import { SectionCard, Field } from "../lead/primitives";
import { PropertyThumb } from "../properties/PropertyThumb";
import { TourTimeField } from "../lead/TourTimeField";
import { displayAddress, formatRating, formatPhone, DEFAULT_TIME_VALUE, type FavoriteDTO, type AutofillLocator } from "@bc/companion-shared";

// Display-only move-date formatter for the preview → "Sep 15, 2026". Parses the
// YYYY-MM-DD parts manually (no Date() → no timezone off-by-one) and falls back to
// the raw value if it isn't ISO. NEVER used for autofill — the payload keeps the
// underlying value so native date inputs still receive the machine-readable date.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function displayMoveDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(value).trim());
  if (!m) return value;
  const [, y, mo, d] = m;
  const mi = parseInt(mo, 10) - 1;
  if (mi < 0 || mi > 11) return value;
  return `${MONTHS[mi]} ${parseInt(d, 10)}, ${y}`;
}
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
  detectedTour = null,
  onAutofillTour,
  onConfirmTour,
}: {
  favorite: FavoriteDTO | null;
  propertyNameFallback: string | null;
  client: TourModeClient;
  locator: AutofillLocator | null;
  /** Read-only detected date ("YYYY-MM-DD") / time ("HH:mm") from the scheduler. */
  detectedTour?: { date: string | null; time: string | null } | null;
  onAutofillTour: () => Promise<AutofillOutcome>;
  onConfirmTour: (args: { tourDate: string; tourTime: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [tourDate, setTourDate] = useState("");
  const [tourTime, setTourTime] = useState(DEFAULT_TIME_VALUE);
  // Once the locator manually edits a field it becomes authoritative and detection
  // never overwrites it. Detection populates only the un-edited field(s).
  const [userEditedDate, setUserEditedDate] = useState(false);
  const [userEditedTime, setUserEditedTime] = useState(false);
  useEffect(() => {
    if (!detectedTour) return;
    if (detectedTour.date && !userEditedDate) setTourDate((cur) => (cur === detectedTour.date ? cur : detectedTour.date!));
    if (detectedTour.time && !userEditedTime) setTourTime((cur) => (cur === detectedTour.time ? cur : detectedTour.time!));
    // Re-runs when the scheduler selection changes, so an updated pick propagates
    // until the locator edits the field.
  }, [detectedTour, userEditedDate, userEditedTime]);

  const name = favorite?.propertyName ?? propertyNameFallback ?? "This property";
  const address = favorite?.propertyAddress ?? null;
  const rating = typeof favorite?.googleRating === "number" ? favorite.googleRating : null;
  // Active client's full name for the Tour Mode header (display/context only —
  // never autofill). Same first+last source the Data preview uses; empty when the
  // client has no name so the line is omitted rather than rendering blank.
  const clientFullName = [client.firstName, client.lastName].filter(Boolean).join(" ").trim();

  async function autofill() {
    if (busy) return;
    setBusy(true);
    try {
      // Execution + arming are unchanged (handled by onAutofillTour); no status text
      // is shown beneath the button (removed per UX request).
      await onAutofillTour();
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
    // Column with a consistent gap between major sections — the same vertical
    // rhythm the Companion's card screens use (property → autofill → info card →
    // tour card), so Tour Mode no longer reads as compressed.
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Label + active client's name on ONE line — the muted uppercase label with
          the client's name in white/semibold so their identity reads immediately.
          flex-wrap lets an unusually long name drop to the next line; no card, no
          phone/email (those stay in the data section below). */}
      <p style={{ margin: "0 0 2px", display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 6, fontSize: 11, letterSpacing: "0.08em", lineHeight: 1.35 }}>
        <span style={{ textTransform: "uppercase", color: "var(--lb-text-muted, #8b93a3)", fontWeight: 700 }}>Scheduling Tour For</span>
        {clientFullName && (
          <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "normal", color: "var(--lb-text-primary, #e9ebef)" }}>{clientFullName}</span>
        )}
      </p>

      {/* Property card */}
      <div style={{ display: "flex", gap: 11, alignItems: "center", background: "var(--lb-inset, #12151c)", border: "1px solid var(--lb-border-soft, #242a37)", borderRadius: 11, padding: 10 }}>
        <PropertyThumb src={favorite?.propertyImageUrl ?? null} alt={name} size={56} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--lb-text-primary, #e9ebef)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
          {address && <div style={{ fontSize: 11.5, color: "var(--lb-text-muted, #8b93a3)", marginTop: 1 }}>{displayAddress(address)}</div>}
          {rating != null && (
            <div style={{ marginTop: 3, fontSize: 11 }}>
              {/* Source label so it reads as the Google rating, not an internal score. */}
              <span style={{ color: "var(--lb-text-muted, #8b93a3)" }}>Google Rating: </span>
              <span style={{ color: "#f5b301" }}>
                {formatRating(rating)} <span aria-hidden="true">★★★★★</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Primary action — clicking runs the per-site permission request, then the
          autofill. Never submits; never overwrites a field the agent already changed. */}
      <button type="button" onClick={autofill} disabled={busy} style={{ ...CTA, marginTop: 0, opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}>
        {busy ? "Autofilling…" : "Autofill Tour Form"}
      </button>
      {/* ONE card holding BOTH client + locator info — the canonical Companion
          SectionCard (same border/radius/surface/heading treatment as Search
          Criteria, Current Property, etc.). Client rows, a divider, then the
          Locator Information sub-group. */}
      {/* Reuses the Companion Field row (same 12.5px label/value typography as Search
          Criteria) with the section's 9px row rhythm. Empty rows are omitted. Display-
          only formatting — the autofill payload keeps the raw values. */}
      <SectionCard title="Information to Autofill">
        {(() => {
          const clientName = [client.firstName, client.lastName].filter(Boolean).join(" ");
          const clientPhone = formatPhone(client.phone);
          const clientMove = displayMoveDate(client.moveDate);
          const locatorName = [locator?.firstName, locator?.lastName].filter(Boolean).join(" ");
          return (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {clientName && <Field label="Name" value={clientName} />}
                {client.email && <Field label="Email" value={client.email} />}
                {clientPhone && <Field label="Phone" value={clientPhone} />}
                {clientMove && <Field label="Move date" value={clientMove} />}
                {client.bedrooms && <Field label="Bedrooms" value={client.bedrooms} />}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, borderTop: "1px solid var(--lb-border-soft, #242a37)", paddingTop: 13 }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--lb-text-muted, #8b93a3)", fontWeight: 700 }}>Locator Information</div>
                {locatorName && <Field label="Name" value={locatorName} />}
                {locator?.email && <Field label="Email" value={locator.email} />}
                {locator?.phone && <Field label="Phone" value={locator.phone} />}
                <div style={{ fontSize: 10.5, color: "var(--lb-text-muted, #8b93a3)", marginTop: 2 }}>
                  Locator information is only added to the message.
                </div>
              </div>
            </>
          );
        })()}
      </SectionCard>

      {/* Manual date/time → Confirm. Aligned to the same card treatment (surface /
          border / 14px radius) as the info card; the parent gap gives the breathing
          room before it. */}
      <div style={{ background: "var(--lb-surface, #12151c)", border: "1px solid var(--lb-border, #2b3140)", borderRadius: 14, padding: "11px 13px 13px" }}>
        <div style={{ fontSize: 13, color: "var(--lb-text-primary, #e9ebef)", fontWeight: 600, marginBottom: 8 }}>When is the tour?</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="date"
            value={tourDate}
            onChange={(e) => { setTourDate(e.target.value); setUserEditedDate(true); }}
            onClick={openNativePicker}
            // Match the Time field (TourTimeField): the same theme-adaptive inset
            // surface + border, so both inputs read correctly on every Companion theme
            // (no hard-coded purplish --lb-card).
            style={{ font: "inherit", fontSize: 14, color: "var(--lb-text, #e6ebf5)", background: "var(--lb-inset, rgba(255,255,255,0.04))", border: "1px solid var(--lb-border, rgba(255,255,255,0.14))", borderRadius: 9, padding: "9px 10px", colorScheme: "dark" }}
          />
          <TourTimeField value={tourTime} onChange={(v) => { setTourTime(v); setUserEditedTime(true); }} />
        </div>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => canSave && onConfirmTour({ tourDate, tourTime })}
          // Enabled → the established theme-aware primary action (CTA's --lb-accent).
          // Disabled → a theme-aware muted surface (never hard-coded green/purple).
          style={{ ...CTA, marginTop: 10, ...(canSave ? { cursor: "pointer" } : { background: "var(--lb-surface-elevated, #1b2030)", color: "var(--lb-text-muted, #8b93a3)", cursor: "not-allowed" }) }}
        >
          Save tour
        </button>
      </div>
    </div>
  );
}
