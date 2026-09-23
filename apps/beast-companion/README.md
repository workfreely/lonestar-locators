# Beast Companion

A **Manifest V3 Chrome extension** that brings Locator Beast into supported
websites through a contextual companion sidebar — a docked tab that expands into
a full-height panel and gently pushes the host page aside (inspired by Apollo.io).

> Beast Companion (this Chrome extension) is a **separate product** from **Beast
> Sync** (the native macOS/Windows desktop app under `/companion`). They share
> nothing but a future connection to Locator Beast.

## Status

**Phase 1 — foundation only.** No AI, no CRM auth, no the external property site, no
scraping, no backend calls. Just the extension shell: docked tab, expand/collapse,
page-shift, Shadow-DOM-isolated UI, and a placeholder panel.

## Tech

React · TypeScript · Vite · `@crxjs/vite-plugin` · Manifest V3.

## Develop

```bash
cd apps/beast-companion
npm install
npm run dev        # Vite + HMR; load dist/ as an unpacked extension
npm run build      # typecheck + production bundle → dist/
```

Then in Chrome: `chrome://extensions` → enable Developer mode → **Load unpacked**
→ select `apps/beast-companion/dist`. Open any `https://*.smartapartmentdata.com`
page; the Beast tab appears on the right edge. On every other site, nothing loads.

## Where things live

| Folder | Responsibility |
| --- | --- |
| `src/background` | Service worker. Relays the toolbar-icon click; future home of CRM auth/session and proxied API calls. |
| `src/content` | Content script. `index.tsx` (entry + teardown), `mount.tsx` (Shadow DOM host + React root), `pageShift.ts` (host-page push/restore — the only code that touches host layout). |
| `src/sidebar` | The UI: `App`, `CollapsedTab`, `Panel`, and `sidebar.css` (injected into the Shadow DOM only). |
| `src/components` | Reusable presentational pieces (`Logo`). |
| `src/hooks` | `usePanelState` — open/closed state + persistence + toolbar sync. |
| `src/services` | `storage`, `messaging` — typed wrappers isolating `chrome.*`. |
| `src/integrations` | `SiteAdapter` registry — the seam for per-site behavior (empty in phase 1). |
| `src/types` | Shared internal contracts (messages, state). |
| `src/utils` | `constants` — brand palette + layout dimensions. |
| `public/icons` | Extension icons (generated from `icon.svg`). |

## Security

The extension **only** runs on the whitelist declared in
`manifest.json → content_scripts.matches` (`https://*.smartapartmentdata.com/*`).
Chrome never injects it anywhere else — there is no runtime domain check to get
wrong. The only permission requested is `storage`.
