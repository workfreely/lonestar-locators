import { HOST_ID } from "./mount";
import { log, warn } from "@/utils/log";

/**
 * Keeps our single host node attached to the page.
 *
 * Some host pages (Smart Apartment Data is an ASP.NET app that rewrites DOM
 * subtrees on postbacks) may detach or replace the element we injected. If that
 * happens we re-attach the SAME host node — React stays mounted inside its
 * Shadow DOM the whole time, so the tab reappears instantly with NO re-render
 * and NO duplicate panel.
 *
 * Two triggers, for resilience:
 *  - a MutationObserver reacts immediately to DOM structure changes,
 *  - a 1s interval is a safety net in case the observer itself is torn down
 *    (e.g. the page replaces <html>).
 */
export function startPersistenceGuard(host: HTMLElement): () => void {
  let reattachCount = 0;

  const dedupe = () => {
    // Never allow two hosts. Keep ours; remove any strays sharing the id.
    document.querySelectorAll<HTMLElement>(`#${CSS.escape(HOST_ID)}`).forEach((el) => {
      if (el !== host) {
        el.remove();
        warn("removed a stray duplicate host");
      }
    });
  };

  const ensureAttached = () => {
    dedupe();
    if (host.isConnected) return;
    const parent = document.body ?? document.documentElement;
    if (!parent) return;
    parent.appendChild(host);
    reattachCount += 1;
    warn(`host was detached by the page — reattached (#${reattachCount}) under <${parent.tagName.toLowerCase()}>`);
  };

  const observer = new MutationObserver(ensureAttached);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const interval = window.setInterval(ensureAttached, 1000);

  log("persistence guard active");

  return () => {
    observer.disconnect();
    window.clearInterval(interval);
  };
}
