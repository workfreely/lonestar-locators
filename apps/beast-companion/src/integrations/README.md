# integrations/

Per-website behavior lives here, behind the `SiteAdapter` seam in `registry.ts`.

**Current shell:** the extension runs on `*.smartapartmentdata.com` (everywhere)
and on `locatorbeast.com` **only under `/admin/*`** — never the public marketing
pages — enforced by `manifest.json` → `content_scripts.matches`. It does nothing
site-specific yet beyond lightweight page-context reporting (`content/context.ts`:
URL / host / section / which site — no client, lead, or property data).

**Adding a site later** is a self-contained change:

1. Add the host/path to `manifest.json` → `content_scripts.matches`.
2. Add one `SiteAdapter` object to `SITE_ADAPTERS` in `registry.ts` — declaring
   its safe behavior and, when built, its `extractContext()` reader.

No changes to the tab, panel, side-mirroring, or messaging are required.

## Architectural requirement (not yet built)

**Locator Beast Kanban → active client.** A later phase will let a click on a
Locator Beast lead/Kanban card (under `locatorbeast.com/admin/*`) set the active
client in the Companion and open the panel. The shell already lays the pipe for
this — `REPORT_CONTEXT` flows page context to the service worker — but the
active-client sync and any lead/property features are **deliberately out of scope**
until the native shell behavior passes its acceptance test. Do not implement it
before then.
