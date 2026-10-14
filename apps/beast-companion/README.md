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

## Building and installing

Beast Companion is an **unpacked Chrome extension**. Chrome loads it from a folder on disk, and
that folder's path *is* the extension's identity: the manifest carries no `key`, so Chrome derives
the extension ID from the path. Load the same build from a different folder and you get a
different extension with an empty `chrome.storage` — and the Beast Sync pairing lives there.

That is why there are two directories, and why they are not interchangeable.

| | path |
|---|---|
| Source | `apps/beast-companion/src` |
| Build output | `apps/beast-companion/dist` (git-ignored) |
| **Installed extension** | **`~/beast-companion-dist`** — the folder Chrome loads |

### Updating the extension

```bash
cd apps/beast-companion && npm run build
```

`build` compiles into `dist/` and then syncs into the installed folder. Then reload it:
**chrome://extensions → Developer mode → ↻ on Beast Companion.** The ID, pairing, settings and
permissions all survive, because the folder never moves.

### Why the sync exists

Builds used to write only to `dist/`, while Chrome loaded `~/beast-companion-dist`. Both folders
held a valid "Beast Companion" manifest and nothing connected them, so a build could succeed, the
code could be correct, the deploy could be green — and the panel on screen could still be weeks
old. The failure was silent by construction.

### Safeguards

`scripts/sync-to-chrome.mjs` refuses rather than guesses. It will not run unless the source is a
complete build whose manifest says "Beast Companion", and the destination already exists, already
contains a "Beast Companion" manifest, sits outside the repository, and is deeper than a home or
volume root. A missing destination is skipped, never created — creating one would mint a new
extension ID and lose the pairing. It replaces only the files a build owns (`manifest.json`,
`sidepanel.html`, `content.js`, `background.js`, `assets/`, `icons/`) and leaves everything else in
the folder alone.

Settings and pairing are never at risk from this script: they live in Chrome's own profile
storage, not in the extension folder.

### A different install path

```bash
BEAST_COMPANION_INSTALL_DIR=/path/to/install npm run build
# or: npm run sync -- --dest=/path/to/install
```

Use `npm run build:no-sync` to compile without touching any install.
