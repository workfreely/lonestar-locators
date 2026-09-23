# Companion Lead-Panel Migration Plan (Phase 1 deliverable)

Audit + written migration plan for moving the narrow CRM lead panel into Beast
Companion. **No UI has been changed.** Baseline: tag
`pre-companion-lead-panel-refactor-2026-08-06`; work branch
`feature/companion-lead-panel-refactor` (from `a6a3f8a`).

Sources: full read of `components/crm/LeadPanel.tsx` (1,433 lines) + two read-only
dependency audits (workflow/mutation layer; active-client/data-fetch layer).

---

## A. Inventory of the current narrow lead panel

### A.1 Components & files
- `components/crm/LeadPanel.tsx` — the panel (1,433 lines): header, Next Action card, Search Criteria, Credit Screening, Invoice Details, Quick Actions, and every mutation handler (inline).
- `components/crm/LeadPanelSections.tsx` — `SectionCard` (collapsible card, `storageKey` persisted) + shared note primitives.
- `components/crm/InvoiceDetailsSection.tsx` — Closed-leads-only commission/lease record.
- `components/crm/AddNextActionModal.tsx` — **UI-only** Add/Edit Task modal (title, due date/time via `DateTimePicker`, notes; priority defaults `"medium"`); calls injected `onCreate`/`onUpdate`.
- Modals used: `GuestCardModal`, `AiVoiceScriptModal`, `ConfirmDialog`.
- Parent/owner: `components/crm/DashboardClient.tsx` (selection state + optimistic list); `LeadBoard.tsx`/`LeadColumn.tsx`/`LeadCard.tsx` (Kanban → selection); `app/admin/leads/page.tsx` (server data load).

### A.2 Data queries / tables / columns
- Load is **server-side** in `app/admin/leads/page.tsx` (server component, `force-dynamic`), **RLS** client `lib/supabase/server.ts`, `leads.select("*")` limit 100, workspace-scoped by RLS `is_active_workspace_member(workspace_id)` (no explicit `.eq`). Related: `lead_next_actions`, `lead_favorites` loaded on the page. **The panel never re-fetches** — it reads the in-memory `lead` object.
- Tables the panel writes: `leads` (`follow_up_count`, `next_action_date`, `first_text_sent_at`, `crm_status`, `archive_reason`, soft-delete cols) and `lead_next_actions` (`title`, `due_at`, `priority`, `notes`, `completed`, `completed_at`, `property_id`/`property_name`).
- Key `leads` fields read: `id, first_name, last_name, phone, city, neighborhoods, move_date, desired_rent, property_type, beds, baths, credit_score, credit_history, criminal_background, broken_lease_age, eviction_age, felony_age, misdemeanor_age, lead_type, landing_page, source, crm_status, follow_up_count, next_action_date, first_text_sent_at, archive_reason, deleted_at, deleted_by, pre_delete_status`.

### A.3 Supabase & API dependencies
- **Direct browser RLS client** (`lib/supabase/client.ts`) for the bulk of mutations — 11 call sites in `LeadPanel.tsx` (lines ~270, 397, 516, 538, 578, 601, 637, 682, 736, 954, 1012).
- API routes used: `POST /api/admin/leads/update-stage` (stage advance + workflow + Google sync; **service-role**, `requireWorkspaceMember`, hand-rolled `workspace_id` scope) and `POST /api/google/followup-event` (FU calendar).
- Auth guard: `lib/auth/requireWorkspaceMember.ts` — `getUser()` → active `workspace_members` → billing RPC `lb_workspace_has_access`; `workspaceId` from session, never body.
- Clients: browser RLS (client.ts), server RLS (server.ts), service-role (admin.ts).

### A.4 Workflow-engine calls
- Real engine = **`lib/workflowEngine.ts`**: `getStageWorkflowAction` (stage→action ruleset), `getNextFollowUpAction` (FU1→FU2→FU3→Final chain), `createWorkflowActionIfNeeded` (shared, dedup-protected `lead_next_actions` insert — called from **both** server service-role and browser RLS).
- `lib/nextAction.ts` `getNextAction` (display labels) + `lib/nextActions.ts` `rankLeadActions` (auto vs manual ranking) + `lib/workflow/autoDueDate.ts` `autoDueInDays` (9 AM local).
- **Rules are pure in lib; triggering/persistence is component-inline** in `LeadPanel.tsx` and the `update-stage` route. Auto-archive rules live in cron routes.

### A.5 Call & text behavior
- Plain `tel:`/`sms:` via `window.open(..., "_self")`. Header `Call Client`/`Text Client` (`handleHeaderCall`/`handleHeaderText`), `openSMS`, `handleCallClient`, `handleFirstText`.
- On a **`new`** lead, a call/text = first contact → `recordFirstContact(method)`: optimistic New→Contacted, POST `update-stage` (applies returned `workflowAction`), and the **only** writer of `leads.first_text_sent_at` (powers 7-day auto-archive). On later stages they are pure comms and mark nothing.
- **No call/SMS logging table** (the separate `companion_messages` iMessage ingest is Beast **Sync**, unrelated).

### A.6 Next Action completion behavior
- FU counter: `setFollowUpCount` → direct `leads` write (`follow_up_count`,`next_action_date`) + FU calendar event.
- Action rows: `handleCompleteAction` → `lead_next_actions.completed=true` + `createWorkflowActionIfNeeded` chains the next FU. `handleGuestCardSent` completes a guest card then creates `Setup Tour` when all done. Return-to-focus auto-complete (`armedActionRef` + `visibilitychange`/`focus`) stamps opened templates complete.
- **No outcome/disposition collection** — completion is a boolean flip. `lead_timeline`/`recordTimelineEvent` is **compiled-off** (`LEAD_TIMELINE_ENABLED=false`); call sites are no-ops.

### A.7 Task creation
- `AddNextActionModal` (UI) → `handleCreateAction` inserts `lead_next_actions`; `handleUpdateAction` edits. Demo leads get local-only rows.

### A.8 Realtime subscriptions
- **None exist anywhere** (no `.channel`/`postgres_changes`/`.subscribe`). Live UI = optimistic React state in `DashboardClient` (`localLeads`, `localNextActions`, `localFavorites`) + prop-drilled `onUpdateLead`/`setNextActions`; server re-fetch only via `router.refresh()` (demo exit).

### A.9 Search Criteria fields
- City/Interest (inferred market for short leads), Budget (`formatRent(desired_rent)`), Property Type, Beds/Baths, Move Date, Desired Areas (`formatDesiredAreas(neighborhoods, city)`), Source (`LeadSourceBadge`).

### A.10 Credit Screening fields
- Credit Score, Credit History, Broken Lease (only if history contains "broken"), Eviction (only if history === "Eviction"), Criminal Background (with felony/misdemeanor age).

### A.11 Remaining sections (below Credit Screening)
- **Invoice Details** — Closed-only (`InvoiceDetailsSection`).
- **Quick Actions** — collapsed: Contact Lead, Text Top 3, List Sent, AI Voice Script, FU1/FU2/FU3, Final FU.
- Header extras: Archive (soft-delete) + Restore, Archive Reason select (archived only), phone copy affordance.

### A.12 Loading / empty / error states
- Loading: **none** — data arrives via server props; the panel is synchronous. Empty: `if (!lead) return null`. Error: inline `console.error` on failed writes; optimistic UI already applied (no rollback). Success cues: `doneMsg` toast, `copiedPhone`. → **The Companion, which fetches async, must add explicit loading/empty/error/retry states (new work).**

---

## B. Classification

| Part | Class | Notes |
|---|---|---|
| `lib/workflowEngine.ts`, `lib/nextAction(s).ts`, `lib/workflow/autoDueDate.ts` | **Reusable shared logic** | Must run **server-side** in the new API; never duplicated in the extension. |
| `lib/leads/*` (archiveReasons, sourceStyles data, guestCardWorkflow, inferMarketFromLandingPage, propertyTypeDisplay, commissionEstimate), `lib/actionDisplay`, `lib/utils/formatPhone` | **Reusable shared logic** | Pure; move to a shared package importable by app + extension. |
| Inline formatters in `LeadPanel` (`normalizeName`, `formatRent`, `formatDesiredAreas`, `getFollowUpStatus`, `formatStatus`, `STATUS_STYLES`) | **Reusable shared logic** | Extract from the component into the shared module. |
| `SectionCard`, `Field`, status/stage badges, `.crm-cta`/`.crm-cta-soft`, `--crm-*`/`--kb-*` tokens | **Reusable presentation** | Share **tokens + markup patterns**; re-implement primitives in the extension build (can't share React 1:1 across Next/Tailwind ↔ Vite). |
| Agenda (`FollowUpRow`), Kanban (`LeadBoard/Column/Card`), AI Assistant, Last Conversation, Favorite Properties (`LeadFavorites`), Client/Locator Notes (`LeadNotes`), AI Insights (`LeadInsights`), `DashboardStats`, selection state (`DashboardClient`) | **CRM-only** | Stay in the LB workspace. `DashboardClient` gains the bridge emitter + a Companion-mutation listener. |
| Side-panel lead UI (header, Next Action, Search Criteria, Credit Screening, Invoice Details, Quick Actions), active-client bridge, client switcher, loading/empty/error, no-extension fallback | **Companion-specific** | New, built in `apps/beast-companion`. |
| Call/Text (`tel:`/`sms:`) | **Companion-specific (reused pattern)** | Works from the side panel; first-contact side effects go through the API, not a direct write. |
| Get active lead (+next_actions,+favorites); advance stage; set follow-up; done-for-now; archive/restore; create/update/complete action; client search; session-token mint; (later) property actions | **Requires a new secure API** | Wrap the workflow engine server-side; validate workspace + ownership per request. |

---

## C. Companion scope vs Locator Beast workspace

**Move into Companion:** Client name, Stage, Phone, Call Client, Text Client, Next Action, Workflow status, Due time, Complete/update action, Add Task, Search Criteria, Credit Screening, and the remaining narrow-panel sections (Invoice Details for Closed, Quick Actions, Archive/Restore).

**Keep in Locator Beast:** Agenda, Kanban, AI Assistant, Last Conversation, Favorite Properties, Client Notes, Locator Notes, AI Insights, expanded client workspace. The freed narrow-panel column is **reassigned** to the existing workspace (not removed).

---

## D. Target architecture

### D.1 Secure API layer (the backbone)
Introduce a workspace-scoped **Companion API** (e.g. `app/api/companion/leads/*`) that both the CRM and the extension call, so the **workflow engine executes server-side once**:
- `GET  /api/companion/leads/:id` → lead + open `lead_next_actions` + `lead_favorites` (authz + ownership checked).
- `POST /api/companion/leads/:id/stage` → advance stage (runs `getStageWorkflowAction` + `createWorkflowActionIfNeeded` + existing side effects).
- `POST /api/companion/leads/:id/follow-up` → set follow-up count + due date + FU calendar.
- `POST /api/companion/leads/:id/done-for-now`, `/archive`, `/restore`.
- `POST /api/companion/next-actions` (create), `PATCH /:actionId` (update), `POST /:actionId/complete` (complete + chain next FU).
- `GET  /api/companion/leads?query=` → client switcher/search.
- Every route guarded by `requireWorkspaceMember` **or** a scoped Companion token (D.3); all reads/writes scoped to the session/token workspace; ownership verified. **The CRM lead panel is refactored to call these same routes** (staged), replacing its 11 direct browser-Supabase writes.

### D.2 Realtime sync (net-new — required by "updates in realtime")
No realtime exists today. Add two layers, Supabase remaining source of truth:
- **(a) Same-window fast path (Phase 9 first):** after a Companion mutation, the LB-admin content script dispatches a `CustomEvent` into the LB page; `DashboardClient` listens and applies it to `localLeads`/`localNextActions` exactly like `onUpdateLead` — instant in-tab Agenda/Kanban/stage refresh, no new infra.
- **(b) Durable/cross-tab:** add Supabase Realtime (`postgres_changes` on `leads` + `lead_next_actions`, filtered by `workspace_id`) to `DashboardClient`, so changes from Companion, other devices, or cron all reflect. Recommend (a) now, (b) for durability.

### D.3 Extension auth model (decision to confirm)
The side panel is `chrome-extension://` origin — it can't use the app's cookie session, and it must work while the active tab is the external site/Google/property sites. **Recommended: short-lived scoped session token.**
- LB-admin content script (has cookies) calls `POST /api/companion/session` (guarded by `requireWorkspaceMember`) → returns a short-lived token scoped to `{workspace_id, user_id}`.
- Content script → background → side panel holds the token in memory (or `chrome.storage.session` at most). Side panel calls Companion APIs with `Authorization: Bearer <token>`; each request re-validates membership + entitlement server-side and scopes to that workspace. Token refreshes whenever an LB tab is present; expires quickly.
- **Requires:** a CORS/host allowance for the LB API origin from the extension, and the new `/session` endpoint. Keeps the extension credential-light: no cookies, no long-lived token, **no client PII persisted**.
- Alternative (heavier): a `device_tokens`-style long-lived extension token like Beast Sync — rejected for now (more PII-at-rest, more surface).

Architecture requirements satisfied: Supabase stays source of truth (D.1); no workflow rules in the extension (D.1 server-side); Companion mutates via secure APIs (D.1/D.3); Companion mutation → CRM realtime (D.2); Call/Text never auto-complete (A.5 preserved — completion stays explicit); outcome collection preserved where it exists (none today; hooks kept); no permanent client records in extension storage (D.3); account/authorization/ownership validated server-side (D.1/D.3).

---

## E. Active-client bridge (design before implementation)
1. **Selection source:** Kanban card click already sets `selectedLeadId` + `?id=` URL in `DashboardClient` (`LeadCard onClick → onSelect(lead.id)`). Add an emitter: on selection, the LB-admin content script forwards **only the authorized lead id** (+ a minimal display hint: name/stage) to the window-global Companion via background messaging. The `?id=` round-trip is the existing hook.
2. **Profile load:** Companion loads the **full authorized profile from LB** via `GET /api/companion/leads/:id` — it does **not** trust client fields from the page/transport beyond the id.
3. **Persistence across tabs:** the active-client **id** is cached in side-panel memory (+ `chrome.storage.session` for the id only) so switching to the external site/Google/property tabs preserves it. **Never** persist the full client record.
4. **Visibility:** Companion header always shows the active client (name + stage badge).
5. **Switcher:** an in-Companion client search/switcher (`GET /api/companion/leads?query=`, workspace-scoped).
6. **Guardrail:** property actions (the external site capture → Best Match/Favorite/Tour/Not a Fit) are **disabled when no active client is selected** (ties to the the external site spec's manual-confirmation rules).

---

## F. Shared visual system (tokens, not a copied stylesheet)
- Extract the `--crm-*`/`--kb-*` token `:root` blocks + status/stage badge colors + `.crm-cta`/`.crm-cta-soft` into a **shared token module** that generates CSS variables for both the app (`globals.css`) and the extension (`sidepanel.css`). Dark background, cards/accordions (`SectionCard`), blue actions, stage/status/approval/overdue badges, typography, spacing, radii, shadows all come from tokens.
- **Prevent white flash:** the Companion currently defaults `html,body` to **white**. Set the dark `--crm-background` inline on `sidepanel.html` `<body>` (and a `<style>` in `<head>`) so the panel paints dark before React mounts.
- Re-implement `SectionCard`/`Field`/badges as small extension primitives consuming the shared tokens — do **not** import Tailwind/`globals.css`.

---

## G. Additive implementation order (each = one commit / rollback point)
1. **Audit + this written plan** ← *current; awaiting approval.*
2. Shared domain types (`Lead`/`NextAction`/stage enums) + design tokens module.
3. Companion lead-panel UI with **sanitized demo data** (no live data).
4. Secure auth/read path (`/api/companion/session` + `GET /leads/:id`).
5. Active-client sync from LB (bridge: content script → background → panel).
6. Live **read-only** client data in the panel.
7. Call/Text behavior (first-contact via API, no auto-complete).
8. Next Action + task mutations (create/update/complete + FU chain, server-side).
9. Realtime CRM sync (D.2a then D.2b).
10. P0 the external site property preview (from the the external site spec).
11. Property actions with active-client context (the four buckets).
12. Feature-parity testing.
13. Expand the central workspace into the freed area.
14. **Remove the old narrow lead panel only after approval** (parity + fallback met).

**No-extension fallback (gate for step 14):** the LB-admin content script marks the page (e.g. a DOM/`window` flag) when Companion is present; `DashboardClient` renders the **existing in-app `LeadPanel`** whenever that flag is absent. The current panel stays fully functional until parity + this fallback are verified.

---

## H. Open decisions to confirm before Phase 2
1. **Extension auth model** (D.3): short-lived scoped token (recommended) vs long-lived device token — this affects the extension's permission/CORS footprint you've kept minimal.
2. **Realtime approach** (D.2): same-window bridge first, add Supabase Realtime for durability — confirm both are in scope.
3. **CRM cutover:** refactor the existing CRM panel to call the new APIs too (one implementation), or leave the CRM on direct writes until step 13? Recommend migrating the CRM to the APIs so the workflow engine has a single execution path.
4. **Outcome collection:** none exists today — do you want to *add* disposition capture as part of this move, or preserve parity (none) for now?
