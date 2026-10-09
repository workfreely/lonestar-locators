import { useEffect, useRef, useState } from "react";

export type TourModeRequest = {
  favoriteId: string | number;
  propertyName: string | null;
  /** The exact scheduler URL the CRM opened for this tour (http(s) only), used to
   *  bind Autofill to the property tab/origin. Null when unknown (legacy CRM). */
  schedulerUrl: string | null;
  /** The originating Schedule Tour click's nonce (`${Date.now()}-${rand}`). */
  nonce: string;
};

const KEY = "lb-tour-mode";

/** The stored record, exactly as the content bridge writes it (all fields unknown
 *  until validated — it originates from a window message). */
type StoredRequest = { leadId?: unknown; favoriteId?: unknown; propertyName?: unknown; url?: unknown; nonce?: string };

/** A record usable as a Tour Mode context: it identifies a property and a request.
 *  A type guard rather than a boolean so the fields narrow for the caller. */
function isUsable(r: StoredRequest | undefined): r is StoredRequest & { favoriteId: string | number; nonce: string } {
  return !!r && (typeof r.favoriteId === "string" || typeof r.favoriteId === "number") && typeof r.nonce === "string" && r.nonce.length > 0;
}

/**
 * Drives the panel's Tour Mode from the CRM's "Schedule Tour from a Workspace
 * Favorite" signal (chrome.storage.local["lb-tour-mode"], written by the tour-mode
 * content bridge).
 *
 * ── THE INVARIANT ───────────────────────────────────────────────────────────────
 *
 *     a stored lb-tour-mode record EXISTS  ⇔  there is an UNRESOLVED Tour Mode context
 *
 * The record is the context. It is cleared in exactly three cases:
 *   1. the tour is saved/confirmed (confirmTourMode → exitTourMode → exit);
 *   2. the locator explicitly exits/cancels Tour Mode (exit);
 *   3. a new Schedule Tour click replaces it (the bridge overwrites the key).
 * Nothing else clears it, so ONE click is enough: the context survives opening the
 * property's website, several minutes spent there, the panel being closed at click
 * time, the panel being opened later, and ordinary tab navigation.
 *
 * ── WHY THERE IS NO LONGER AN AGE LIMIT ─────────────────────────────────────────
 * This used to discard any request older than 30s on a mount read. That existed
 * because dismissal was NOT durable — `exit` only set an in-memory ref, while the
 * stored record was never removed by anything, so without an age cap every old
 * request would force-enter Tour Mode on every panel open, forever.
 *
 * The two were one bug. Making dismissal durable (exit REMOVES the key) is what
 * makes the age cap unnecessary — and the age cap was itself the thing that broke
 * the real workflow, because clicking Schedule Tour opens an external scheduler and
 * the locator is legitimately away for minutes. Expiry deleted the context exactly
 * when it was most needed.
 *
 * Deliberately NO timeout of any length for now: a stale context is recoverable in
 * one click (exit, or click Schedule Tour again), whereas a context that vanishes
 * mid-workflow costs a trip back to the CRM. Revisit only if real usage shows
 * stale contexts are actually annoying.
 *
 * ── A CLIENT SWITCH HIDES, IT DOES NOT DISMISS ──────────────────────────────────
 * Switching the active client is not one of the three resolution cases, so it only
 * HIDES Tour Mode; the record stays and the context re-appears when that client is
 * active again. A request whose lead is not the loaded client (including before any
 * client has loaded) is HELD, never discarded, and re-evaluated whenever
 * activeLeadId changes — so clicking Schedule Tour with the panel cold still works.
 */
export function useTourMode(activeLeadId: string | number | null | undefined): {
  tour: TourModeRequest | null;
  exit: () => void;
} {
  const [tour, setTour] = useState<TourModeRequest | null>(null);
  const leadRef = useRef(activeLeadId);
  leadRef.current = activeLeadId;
  // In-session guard only. The durable dismissal is removing the stored record;
  // this additionally covers the gap between exit() and the async remove landing,
  // so a storage event in flight cannot re-enter what was just exited.
  const dismissedNonce = useRef<string | null>(null);
  const enteredForLead = useRef<string | number | null | undefined>(null);
  const tourRef = useRef(tour);
  tourRef.current = tour;

  // HIDE (never dismiss) when the active client moves away from the one Tour Mode
  // was entered for. The record is left intact so returning to that client restores
  // the context — switching clients is not a resolution.
  useEffect(() => {
    if (tour != null && String(enteredForLead.current) !== String(activeLeadId)) {
      setTour(null);
    }
  }, [activeLeadId, tour]);

  // Re-runs on every activeLeadId change, which is what re-evaluates a HELD request
  // once the right client finally loads.
  useEffect(() => {
    const store = chrome?.storage?.local;
    if (!store) return; // dev harness — no extension APIs

    const consider = (rec: StoredRequest | undefined) => {
      const shown = tourRef.current;
      const valid = isUsable(rec);
      // WHAT IS SHOWN MUST BE WHAT IS STORED. If the record has been replaced by a
      // different request — including one for ANOTHER client — the context on screen
      // no longer exists, so drop it. Without this, clicking Schedule Tour for a
      // different lead left the previous lead's Tour Mode visible against a stored
      // context that had already been overwritten.
      if (shown && (!valid || rec.nonce !== shown.nonce)) setTour(null);
      if (!valid) return;
      // Already showing this exact request, or the one just exited → ignore.
      if (rec.nonce === shown?.nonce) return;
      if (rec.nonce === dismissedNonce.current) return;
      // HELD, not discarded: wrong or not-yet-loaded client. The record stays, and
      // this effect re-runs when activeLeadId changes, so it activates by itself.
      if (leadRef.current == null || String(rec.leadId) !== String(leadRef.current)) return;
      enteredForLead.current = leadRef.current;
      setTour({
        favoriteId: rec.favoriteId,
        propertyName: typeof rec.propertyName === "string" ? rec.propertyName : null,
        schedulerUrl: typeof rec.url === "string" ? rec.url : null,
        nonce: rec.nonce,
      });
    };

    store.get(KEY, (res: { [k: string]: unknown }) => consider(res?.[KEY] as StoredRequest | undefined));
    function onChanged(changes: { [k: string]: chrome.storage.StorageChange }, area: string) {
      if (area !== "local" || !changes[KEY]) return;
      // newValue is undefined when the key is REMOVED (exit) — consider() ignores it,
      // leaving the already-cleared local state alone.
      consider(changes[KEY].newValue as StoredRequest | undefined);
    }
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [activeLeadId]);

  /**
   * Resolve the context: used by an explicit exit/cancel AND by saving the tour
   * (confirmTourMode calls this after queueing the complete-setup-tour verb).
   *
   * REMOVING THE KEY IS THE POINT — it is what makes dismissal durable and lets the
   * age cap go. Clearing local state without clearing storage is what made a stale
   * record outlive its dismissal across a panel close.
   */
  const exit = () => {
    if (tourRef.current) dismissedNonce.current = tourRef.current.nonce;
    setTour(null);
    chrome?.storage?.local?.remove?.(KEY);
  };
  return { tour, exit };
}
