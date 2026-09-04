import { useEffect, useState } from "react";
import { getActiveTourTab } from "./runAutofill";

// Tracks whether the active browser tab is an external tour/scheduler page, so the
// panel can surface the Autofill action exactly when the locator is on the page
// they want filled (never on the CRM/SAD). Re-checks on tab switch, tab URL change,
// window focus change, and when the side panel regains visibility — so opening the
// tour page in a new tab and switching to it makes the action appear on its own.
//
// Reading the active tab's URL relies on the "tabs" permission (metadata only — no
// host script access). Without it the query returns no URL and the action stays
// hidden, degrading safely to manual scheduling.
export function useActiveTourTab(): { host: string } | null {
  const [tab, setTab] = useState<{ host: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const check = () => {
      getActiveTourTab().then((t) => {
        if (alive) setTab(t ? { host: t.host } : null);
      });
    };
    check();

    const onAny = () => check();
    try {
      chrome?.tabs?.onActivated?.addListener(onAny);
      chrome?.tabs?.onUpdated?.addListener(onAny);
      chrome?.windows?.onFocusChanged?.addListener(onAny);
    } catch {
      /* dev harness — no extension APIs */
    }
    const onVis = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", check);

    return () => {
      alive = false;
      try {
        chrome?.tabs?.onActivated?.removeListener(onAny);
        chrome?.tabs?.onUpdated?.removeListener(onAny);
        chrome?.windows?.onFocusChanged?.removeListener(onAny);
      } catch {
        /* noop */
      }
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", check);
    };
  }, []);

  return tab;
}
