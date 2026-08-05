# integrations/

Per-website behavior lives here, behind the `SiteAdapter` seam in `registry.ts`.

**Phase 1:** empty. The extension only runs on `*.smartapartmentdata.com` (enforced
by `manifest.json` → `content_scripts.matches`) and does nothing site-specific yet.

**Adding a site later** (e.g. Smart Apartment Data) is a self-contained change:

1. Add the host to `manifest.json` → `content_scripts.matches`.
2. Add one `SiteAdapter` object to `SITE_ADAPTERS` in `registry.ts` — declaring
   its safe `layoutMode` and, when built, its `extractContext()` reader.

No changes to the tab, panel, page-shift, or messaging are required. Nothing in
this folder scrapes or reads any page in phase 1.
