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

// Leading timestamp of a `${Date.now()}-${random}` nonce (CRM + panel share the
// machine clock), used to tell a genuinely fresh Schedule Tour click from a stale
// request left in storage.
function nonceTimestamp(nonce?: string): number | null {
  if (!nonce) return null;
  const n = parseInt(nonce.split("-")[0], 10);
  return Number.isFinite(n) ? n : null;
}

// Only a click within this window (of when the panel reads it) can enter Tour Mode
// from a MOUNT read — long enough that a fresh click racing a panel re-init still
// counts, short enough that an old request never force-enters on reopen.
const FRESH_MS = 30_000;

/**
 * Drives the panel's temporary Tour Mode from the CRM's "Schedule Tour from a
 * Workspace Favorite" signal (chrome.storage.local["lb-tour-mode"], written by the
 * tour-mode content bridge). Every Schedule Tour click is a fresh event (new
 * nonce) and MUST re-enter / switch Tour Mode:
 *   • not in Tour Mode → enter for that favorite;
 *   • previously exited → a new click re-enters (its nonce ≠ the dismissed one);
 *   • showing property A, click B → switch to B;
 *   • re-click the SAME property → still enters (new nonce), and because PanelApp
 *     keys the view by favoriteId an in-progress confirmation for that property is
 *     preserved, not reset.
 * `exit` dismisses ONLY the current request's nonce, so exiting never blocks the
 * next click. A live storage change always acts; a mount read acts only on a
 * genuinely fresh, non-dismissed request (so reopening the panel never force-enters
 * an old one).
 */
export function useTourMode(activeLeadId: string | number | null | undefined): {
  tour: TourModeRequest | null;
  exit: () => void;
} {
  const [tour, setTour] = useState<TourModeRequest | null>(null);
  const leadRef = useRef(activeLeadId);
  leadRef.current = activeLeadId;
  const dismissedNonce = useRef<string | null>(null);
  const enteredForLead = useRef<string | number | null | undefined>(null);
  const tourRef = useRef(tour);
  tourRef.current = tour;

  // Exit if the active client switches away from the one Tour Mode was entered for.
  useEffect(() => {
    if (tour != null && String(enteredForLead.current) !== String(activeLeadId)) {
      dismissedNonce.current = tour.nonce;
      setTour(null);
    }
  }, [activeLeadId, tour]);

  useEffect(() => {
    const store = chrome?.storage?.local;
    if (!store) return; // dev harness — no extension APIs
    const KEY = "lb-tour-mode";

    const consider = (
      rec: { leadId?: unknown; favoriteId?: unknown; propertyName?: unknown; url?: unknown; nonce?: string } | undefined,
      fromMount: boolean,
    ) => {
      if (!rec || rec.favoriteId == null || !rec.nonce) return;
      // Already showing this exact request, or the one we just exited → ignore.
      if (rec.nonce === tourRef.current?.nonce) return;
      if (rec.nonce === dismissedNonce.current) return;
      // A mount read must be a genuinely fresh click, not a leftover request.
      if (fromMount) {
        const ts = nonceTimestamp(rec.nonce);
        if (ts == null || Date.now() - ts > FRESH_MS) return;
      }
      // Only enter Tour Mode for the CURRENTLY loaded client.
      if (leadRef.current == null || String(rec.leadId) !== String(leadRef.current)) return;
      enteredForLead.current = leadRef.current;
      setTour({
        favoriteId: rec.favoriteId as string | number,
        propertyName: typeof rec.propertyName === "string" ? rec.propertyName : null,
        schedulerUrl: typeof rec.url === "string" ? rec.url : null,
        nonce: rec.nonce,
      });
    };

    store.get(KEY, (res: { [k: string]: unknown }) => consider(res?.[KEY] as never, true));
    function onChanged(changes: { [k: string]: chrome.storage.StorageChange }, area: string) {
      if (area !== "local" || !changes[KEY]) return;
      consider(changes[KEY].newValue as never, false);
    }
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const exit = () => {
    if (tourRef.current) dismissedNonce.current = tourRef.current.nonce;
    setTour(null);
  };
  return { tour, exit };
}
