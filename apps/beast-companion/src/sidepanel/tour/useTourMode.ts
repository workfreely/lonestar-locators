import { useEffect, useRef, useState } from "react";

export type TourModeRequest = {
  favoriteId: string | number;
  propertyName: string | null;
};

// Drives the panel's temporary Tour Mode from the CRM's "Schedule Tour from a
// Workspace Favorite" signal (written to chrome.storage.local["lb-tour-mode"] by
// the tour-mode content bridge). Enters Tour Mode ONLY on a genuinely NEW request
// (nonce) whose leadId matches the currently loaded client. The value present at
// mount is adopted WITHOUT acting, so reopening the panel while a stale request
// sits in storage never forces Tour Mode. `exit` returns to the normal panel;
// re-entry needs a fresh Schedule Tour click (new nonce).
export function useTourMode(activeLeadId: string | number | null | undefined): {
  tour: TourModeRequest | null;
  exit: () => void;
} {
  const [tour, setTour] = useState<TourModeRequest | null>(null);
  const leadRef = useRef(activeLeadId);
  leadRef.current = activeLeadId;
  // undefined = mount read not yet landed; null/string = last seen nonce.
  const lastNonce = useRef<string | null | undefined>(undefined);
  // The client Tour Mode was entered for — exit if the active client switches away.
  const enteredForLead = useRef<string | number | null | undefined>(null);

  useEffect(() => {
    if (tour != null && String(enteredForLead.current) !== String(activeLeadId)) setTour(null);
  }, [activeLeadId, tour]);

  useEffect(() => {
    const store = chrome?.storage?.local;
    if (!store) return; // dev harness — no extension APIs
    const KEY = "lb-tour-mode";
    store.get(KEY, (res: { [k: string]: unknown }) => {
      const rec = res?.[KEY] as { nonce?: string } | undefined;
      if (lastNonce.current === undefined) lastNonce.current = rec?.nonce ?? null;
    });
    function onChanged(changes: { [k: string]: chrome.storage.StorageChange }, area: string) {
      if (area !== "local" || !changes[KEY]) return;
      const rec = changes[KEY].newValue as
        | { leadId?: unknown; favoriteId?: unknown; propertyName?: unknown; nonce?: string }
        | undefined;
      const nonce = rec?.nonce;
      // Until the mount read lands, adopt rather than act.
      if (lastNonce.current === undefined) { lastNonce.current = nonce ?? null; return; }
      if (!nonce || nonce === lastNonce.current) return;
      lastNonce.current = nonce;
      if (!rec || rec.favoriteId == null) return;
      // Only enter Tour Mode for the CURRENTLY loaded client.
      if (leadRef.current == null || String(rec.leadId) !== String(leadRef.current)) return;
      enteredForLead.current = leadRef.current;
      setTour({
        favoriteId: rec.favoriteId as string | number,
        propertyName: typeof rec.propertyName === "string" ? rec.propertyName : null,
      });
    }
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  return { tour, exit: () => setTour(null) };
}
