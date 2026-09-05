import { useEffect, useState } from "react";
import { isSmartApartmentDataHost } from "@/content/sadUrl";

/**
 * True while the ACTIVE tab in the panel's window is a Smart Apartment Data page —
 * SAD Search, SAD Results, or a property-detail page (any *.smartapartmentdata.com
 * URL). Drives Search Mode: the contextual banner appears only while the agent is
 * actually looking at SAD and disappears the instant they switch away (and returns
 * when they switch back).
 *
 * Detection is tab-based, NOT workflow/stage-based: it reads chrome.tabs (the
 * manifest grants "tabs", so tab.url is always readable) and re-evaluates on tab
 * activation, the active tab's URL change, and window focus change. Read-only — it
 * never changes a tab, and carries no workflow or stage logic.
 */
function urlIsSad(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    return isSmartApartmentDataHost(new URL(url).host);
  } catch {
    return false;
  }
}

export function useActiveSadTab(): boolean {
  const [isSad, setIsSad] = useState(false);

  useEffect(() => {
    const chrome = (globalThis as unknown as { chrome?: any }).chrome;
    const tabs = chrome?.tabs;
    if (!tabs?.query) return; // dev harness (no extension APIs)
    let cancelled = false;

    const evaluate = () => {
      tabs.query({ active: true, currentWindow: true }, (result: any[]) => {
        if (cancelled) return;
        const active = result && result[0];
        setIsSad(urlIsSad(active?.url));
      });
    };

    evaluate();

    const onActivated = () => evaluate();
    // A background tab navigating never changes what the agent sees, so only the
    // active tab's URL change / load completion matters.
    const onUpdated = (_tabId: number, changeInfo: { url?: string; status?: string }, tab: { active?: boolean }) => {
      if ((changeInfo?.url || changeInfo?.status === "complete") && tab?.active) evaluate();
    };
    const onFocusChanged = () => evaluate();

    tabs.onActivated?.addListener(onActivated);
    tabs.onUpdated?.addListener(onUpdated);
    chrome?.windows?.onFocusChanged?.addListener(onFocusChanged);
    return () => {
      cancelled = true;
      tabs.onActivated?.removeListener(onActivated);
      tabs.onUpdated?.removeListener(onUpdated);
      chrome?.windows?.onFocusChanged?.removeListener(onFocusChanged);
    };
  }, []);

  return isSad;
}
