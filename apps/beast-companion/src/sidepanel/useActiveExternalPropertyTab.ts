import { useEffect, useState } from "react";
import { isSupportedPropertyHost } from "@/content/externalPropertyUrl";

/**
 * True while the ACTIVE tab in the panel's window is a supported external
 * property-site page — its Search, Results, or a property-detail page (any URL on
 * the supported external property host). Drives Search Mode: the contextual banner
 * appears only while the agent is actually looking at that site and disappears the
 * instant they switch away (and returns when they switch back).
 *
 * Detection is tab-based, NOT workflow/stage-based: it reads chrome.tabs (the
 * manifest grants "tabs", so tab.url is always readable) and re-evaluates on tab
 * activation, the active tab's URL change, and window focus change. Read-only — it
 * never changes a tab, and carries no workflow or stage logic.
 */
function urlIsSupportedPropertySite(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    return isSupportedPropertyHost(new URL(url).host);
  } catch {
    return false;
  }
}

export function useActiveExternalPropertyTab(): boolean {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const chrome = (globalThis as unknown as { chrome?: any }).chrome;
    const tabs = chrome?.tabs;
    if (!tabs?.query) return; // dev harness (no extension APIs)
    let cancelled = false;

    const evaluate = () => {
      tabs.query({ active: true, currentWindow: true }, (result: any[]) => {
        if (cancelled) return;
        const active = result && result[0];
        setIsActive(urlIsSupportedPropertySite(active?.url));
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

  return isActive;
}
