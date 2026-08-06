# Companion Lead-Panel Refactor — Baseline

Recoverable baseline captured **2026-08-06**, before moving the narrow lead panel
into Beast Companion. This documents the exact restore point and the agreed
refactor boundary. **No refactoring has begun.**

## 1. Version anchor

| Item | Value |
|---|---|
| Branch | `website-v1` |
| Checkpoint commit | `62953e3425191e0dff0a4c117eb3afab65823989` |
| Parent (approved shell) | `b6beb8839c110b7120a88d7a0a0d53196a03f5af` (open-only Companion) |
| Annotated tag | `pre-companion-lead-panel-refactor-2026-08-06` (tag object `00a59e48886246db864d4e41ea78af710fdeaedb`) |
| Backup branch | `backup/pre-companion-lead-panel-refactor-2026-08-06` |
| Remote | `origin` → github.com/workfreely/locatorbeast |
| Source ZIP | `/Users/jaymorris/Locator-Beast-Backups/locator-beast-pre-companion-refactor-2026-08-06.zip` (from tag) |
| Loadable ext ZIP | `/Users/jaymorris/Locator-Beast-Backups/locator-beast-companion-loadable-2026-08-06.zip` |
| Injected rollback | `/Users/jaymorris/beast-companion-injected-dist` + tag `beast-companion-injected-v1` (preserved, not overwritten) |

## 2. Current CRM routes (`app/`)

- **CRM (leads board + lead panel):** `app/admin/leads/page.tsx` → `components/crm/DashboardClient.tsx`
- Admin: `app/admin/{profile,settings,integrations,billing,import,performance}/page.tsx`
- Auth: `app/(auth)/{login,signup,forgot-password,reset-password}`
- Marketing/landing: `app/(lonestar)/*` (city pages, blog, thank-you), `app/(landing)/*`
- Public locator: `app/locator-beast/(site)/page.tsx`, `app/locator-beast/[username]/page.tsx`
- Onboarding: `app/onboarding/page.tsx`; Smart form: `app/smart-lead-form/page.tsx`
- Billing: `app/billing/page.tsx`; Companion pairing (Beast **Sync** desktop): `app/companion/pair/page.tsx`
- API: `app/api/*` incl. `app/api/companion/{pair,status,messages}` (Beast **Sync** desktop; separate product), `ai-insights`, `favorites`, `google`, `billing`, `cron`, `admin`

## 3. Current lead-panel component/file locations

- `components/crm/LeadPanel.tsx` — the narrow lead panel (subject of the refactor)
- `components/crm/LeadPanelSections.tsx` — section renderers
- Supporting: `components/crm/InvoiceDetailsSection.tsx`, `LeadInsights.tsx`,
  `AddNextActionModal.tsx`, `FollowUpRow.tsx`, `ConfirmDialog.tsx`
- Styling: `app/globals.css` (lead-panel classes)

## 4. Current Companion component/file locations (`apps/beast-companion/src/`)

- Background SW: `background/index.ts`
- Content script: `content/{index.ts,launcher.ts,launcher.css,persistence.ts,context.ts}`
- Side panel UI: `sidepanel/{main.tsx,PanelApp.tsx,sidepanel.css}` + root `sidepanel.html`
- Shared: `types/index.ts`, `integrations/{registry.ts,README.md}`, `components/Logo.tsx`,
  `utils/{log.ts,constants.ts}`
- Build: `scripts/build.mjs` (single-file IIFE for content/background + Vite HTML for panel)

## 5. Current open-only lifecycle (FROZEN shell)

- Launcher click → `chrome.runtime.sendMessage({type:"OPEN_PANEL"})` → background
  `chrome.sidePanel.open({windowId})` called **synchronously** (preserves user gesture).
- **Chrome's native X is the sole close.** No toggle, no programmatic `close()`, no
  open/closed state. Toolbar icon = fallback opener (`setPanelBehavior({openPanelOnActionClick:true})`).
- One **global** native panel per window. Launcher host is `position:fixed` 52×52,
  flush at rest; left/right mirroring via `sidePanel.getLayout()`.
- Content-script matches: `*.smartapartmentdata.com` + `locatorbeast.com/admin/*`
  (+ `www.`), never LB marketing pages. Permissions: `["sidePanel"]` only.
- Page-context reporting (`content/context.ts` → `REPORT_CONTEXT`): URL/host/section/site
  only — **no client/property data**.

## 6. Current Kanban / Agenda behavior

- Kanban: `components/crm/LeadBoard.tsx` + `LeadColumn.tsx`. `.kb-board{overflow-x:auto}`,
  `.kb-column{flex:1 0 274px}` (fixed column width, horizontal scroll — cards do not shrink).
- Agenda: independently collapsible, preference persisted via
  `readAgendaExpanded`/`writeAgendaExpanded` in `lib/preferences.ts`. No width-based auto-collapse.
- Density defaults to Compact (`lib/preferences.ts`).

## 7. Current active-client behavior

- **Locator Beast is the sole authority for the active client.** Selection lives in the
  CRM board state (`components/crm/DashboardClient.tsx` / `LeadBoard.tsx` / `LeadColumn.tsx`);
  the selected lead drives the lead panel.
- Beast Companion does **not** yet sync the active client. The architectural pipe exists
  (`REPORT_CONTEXT`), and a future `locatorbeast.com/admin` Kanban-card click → set active
  client + open panel is documented but **not built**.

## 8. Current Supabase / API dependencies

- Clients: `lib/supabase/{client.ts,server.ts,admin.ts,projects.ts,serviceAreasDiagnostics.ts}`,
  legacy `app/lib/supabaseClient.ts`.
- **Locator Beast Supabase project:** `onwrrajmklxtnabekzcy` (own Vercel `locatorbeast`).
  The Lone Star Supabase is **FROZEN — never push to it**.
- Local `.env.local` targets the **frozen Lone Star** DB, so LB-schema features
  (service_areas RPCs, companion pairing) can only be tested on production, not local dev.
- Notifications via Resend (`lib/notifications`); auth emails Supabase-native.

## 9. Build commands

**CRM (Next.js, repo root):**
```bash
npm install
npm run dev      # local dev
npm run build    # production build
```
**Beast Companion (extension):**
```bash
cd apps/beast-companion
npm install
npm run build    # tsc --noEmit + scripts/build.mjs → dist/
```
Load unpacked: `chrome://extensions` → Load unpacked → `apps/beast-companion/dist`
(or the loadable copy `/Users/jaymorris/beast-companion-dist`).

**Production deploy (manual):** `vercel --prod` from the local checkout — pushes to
`website-v1` do **not** auto-deploy.

## 10. Restore the tagged version

```bash
# Inspect / restore into a fresh worktree (non-destructive):
git fetch origin --tags
git worktree add /tmp/lb-restore pre-companion-lead-panel-refactor-2026-08-06

# OR check out the tag directly:
git checkout pre-companion-lead-panel-refactor-2026-08-06

# OR from the ZIP (from the tagged commit):
unzip /Users/jaymorris/Locator-Beast-Backups/locator-beast-pre-companion-refactor-2026-08-06.zip -d /tmp/lb-restore

# Restore the extension:
unzip /Users/jaymorris/Locator-Beast-Backups/locator-beast-companion-loadable-2026-08-06.zip -d /tmp/companion-restore
# then Load unpacked → /tmp/companion-restore
```

## 11. Known limitations

- Local dev can't exercise LB-only schema (env points at frozen Lone Star); test those
  on production `locatorbeast` only.
- Production deploy is manual (`vercel --prod`); `main` is far behind `website-v1`.
- Companion has no client/property/active-client features yet — approved shell only.
- Companion's native launcher can show a brief cross-layer seam only *during* the native
  panel open/close animation (accepted; not chased). At rest it is flush.

## 12. Refactor boundary (exact — agreed 2026-08-06)

**Move INTO Locator Beast Companion (native side panel):**
- Client name
- Stage / status
- Phone
- Call Client
- Text Client
- Next Action
- Workflow status
- Due time
- Add Task
- Search Criteria
- Credit Screening
- Remaining sections belonging to the existing narrow lead panel

**Remain in the Locator Beast workspace:**
- Agenda
- Kanban
- AI Assistant
- Last Conversation
- Favorite Properties
- Client Notes
- Locator Notes
- AI Insights
- Larger client workspace

**Rules:**
- The former lead-panel area is **reassigned to the existing workspace** — this is a
  space reassignment, **not a removal** of the workspace.
- **Do not remove the existing lead panel** until Companion reaches feature parity **and**
  a no-extension fallback is defined.
