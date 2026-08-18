// MAIN-world (page) content script — SAD tabs only (registered so in manifest.json).
//
// SAD's own Previous/Next controls advance the property via an ASP.NET-AJAX async
// partial postback (RadAjaxManager): the document is reused, `location.href` does not
// change, and none of the isolated content script's navigation triggers fire — so the
// panel would keep showing the previous property. The one deterministic completion
// signal is ASP.NET AJAX's PageRequestManager `endRequest`, which fires AFTER the
// async response is applied and the property DOM is refreshed. PageRequestManager
// lives in the PAGE (MAIN) world, so this tiny shim hooks it here and forwards a
// narrowly-scoped signal to the isolated content script via window.postMessage.
//
// It carries NO scraped data — the isolated script reads the refreshed DOM itself
// (fresh property id from the NavigationPlaceHolder ClientState + name/address).
// Guarded against duplicate registration. No polling of the DOM, no MutationObserver.

(() => {
  const w = window as unknown as { __lbSadNavHooked?: boolean; Sys?: any };
  if (w.__lbSadNavHooked) return; // never hook endRequest twice

  const NAV_SOURCE = "lb-companion-sad-nav";
  const NAV_TYPE = "sad-nav-complete";

  function hook(): boolean {
    try {
      const prmType = w.Sys?.WebForms?.PageRequestManager;
      const prm = prmType?.getInstance?.();
      if (!prm) return false;
      prm.add_endRequest(() => {
        // Fire-and-forget completion ping; the isolated world does the DOM read.
        window.postMessage({ source: NAV_SOURCE, type: NAV_TYPE }, location.origin);
      });
      w.__lbSadNavHooked = true;
      return true;
    } catch {
      return false;
    }
  }

  // ASP.NET AJAX (Sys) may finish loading after this script. Try now; if not ready,
  // retry briefly, then give up (bounded — no permanent timer).
  if (hook()) return;
  let tries = 0;
  const timer = window.setInterval(() => {
    tries += 1;
    if (hook() || tries > 40) window.clearInterval(timer); // ~10s ceiling
  }, 250);
})();
