import { log, warn } from "@/utils/log";

/**
 * Communication-launch bridge — the CRM-PAGE end.
 *
 * Beast Companion's Call/Text launch must NOT create a tel:/sms: browser tab
 * (that tab becomes the visible workspace and its "Open [app]?" dialog is
 * dismissed if we switch away). Instead the side panel writes the tel:/sms: URL
 * to chrome.storage.local["lb-launch-comm"]; this content script (running on the
 * CRM page) clicks a temporary <a href="tel:…"> on the CRM DOCUMENT itself.
 *
 * Because the external protocol is initiated by the CRM page — which stays
 * loaded on /admin/leads — Chrome raises the "Open [app]?" dialog OVER the still-
 * visible CRM, with no new tab and nothing to dismiss.
 *
 * USER-ACTIVATION CAVEAT: the panel→storage→content-script hop is asynchronous,
 * so the click here carries no transient user activation. tel:/sms:/mailto: are
 * external protocols that do not require it, so this should launch — but if a
 * given Chrome build blocks activation-less external-protocol launches, this will
 * silently no-op and we fall back to the panel's protocol-tab launch. Verify at
 * runtime; do not assume.
 *
 * A fresh `nonce` per request makes chrome.storage.onChanged fire even for an
 * identical repeated URL (e.g. calling the same number twice).
 */

const STORAGE_KEY = "lb-launch-comm";

function isCrmPage(): boolean {
  const h = location.hostname;
  const onAdmin = location.pathname.startsWith("/admin");
  const isLb = h === "locatorbeast.com" || h === "www.locatorbeast.com";
  // Local development only. __LB_DEV__ is inlined as `false` by production builds,
  // so this branch — and the localhost strings in it — are removed from the shipped
  // extension, while a --watch build (whose manifest DOES inject on localhost) can
  // still drive the local CRM.
  const isLocal = __LB_DEV__ && (h === "localhost" || h === "127.0.0.1");
  return onAdmin && (isLb || isLocal);
}

function launchOnPage(url: string): void {
  if (typeof url !== "string" || !(url.startsWith("tel:") || url.startsWith("sms:"))) return;
  try {
    const a = document.createElement("a");
    a.href = url; // NO target — same document; Chrome hands tel:/sms: to the OS
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    warn("comm-launch: click failed", err);
  }
}

export function startCommLaunchBridge(): void {
  if (!isCrmPage()) return;
  if (!chrome?.storage?.local) {
    warn("comm-launch bridge: chrome.storage unavailable — launch disabled");
    return;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEY]) return;
    const req = changes[STORAGE_KEY].newValue as { url?: string } | undefined;
    if (!req || typeof req.url !== "string") return;
    launchOnPage(req.url);
  });

  log("comm-launch bridge active on", location.host + location.pathname);
}
