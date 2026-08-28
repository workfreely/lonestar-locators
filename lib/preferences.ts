// CRM user preferences — the central place for remembering how the locator
// likes the UI to look and behave, so the app feels like it "remembers how
// I work" instead of resetting every session. Single-operator app with no
// per-user settings table (confirmed: no profiles/user_settings table
// exists), so every preference is a small typed read/write pair over
// localStorage with its default defined right here — call sites never touch
// storage directly. As new UI choices become persistent, add their accessors
// to this file rather than scattering localStorage keys across components.
//
// Persisted here: Kanban density (defaults to Compact for first-time users,
// then their last choice sticks), the Agenda panel's expanded/collapsed
// state, and each Lead Panel section's expanded/collapsed state. Theme is the
// one sibling kept in its own module (lib/theme.ts) because it needs an inline
// anti-flash script that runs before React hydrates — treat it as part of this
// same preferences family.

// ─── Generic localStorage core (SSR-safe) ──────────────────────────────
// Every preference below reads/writes through these so window guards and
// private-mode/quota failures are handled in exactly one place.

function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeRaw(key: string, value: string) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Losing a UI preference (private mode, quota) is non-fatal — ignore.
  }
}

function readBool(key: string, fallback: boolean): boolean {
  const raw = readRaw(key)
  if (raw === "true") return true
  if (raw === "false") return false
  return fallback
}

// ─── Kanban density ────────────────────────────────────────────────────
// First-time users start in Compact; after that their last choice is
// restored. Existing key kept so anyone who already picked a density keeps
// it. NOTE: keep the union in sync with LeadBoard's KanbanView type.

export type KanbanDensity = "detailed" | "compact" | "overview"
export const KANBAN_DENSITY_KEY = "kanban-view-mode"
export const DEFAULT_KANBAN_DENSITY: KanbanDensity = "compact"

export function isKanbanDensity(value: unknown): value is KanbanDensity {
  return value === "detailed" || value === "compact" || value === "overview"
}

export function readKanbanDensity(): KanbanDensity {
  const stored = readRaw(KANBAN_DENSITY_KEY)
  return isKanbanDensity(stored) ? stored : DEFAULT_KANBAN_DENSITY
}

export function writeKanbanDensity(density: KanbanDensity) {
  writeRaw(KANBAN_DENSITY_KEY, density)
}

// ─── Primary CRM workspace (Board | Map) ──────────────────────────────
// Which primary view the CRM opens in. Without this the view lived only in
// DashboardClient's useState, hard-defaulted to "board", so a refresh on Map
// always dropped the locator back on the Kanban.
//
// ONLY the view name is stored. Nothing transient — no zoom, bounds, selected
// property or client, search text, open cards, hover or modal state — so a
// restored view starts as clean as a fresh one.
//
// NOTE: keep the union in sync with DashboardClient's workspace state.

export type CrmWorkspace = "board" | "map"
export const CRM_WORKSPACE_KEY = "crm-workspace"
export const DEFAULT_CRM_WORKSPACE: CrmWorkspace = "board"

export function isCrmWorkspace(value: unknown): value is CrmWorkspace {
  return value === "board" || value === "map"
}

export function readCrmWorkspace(): CrmWorkspace {
  const stored = readRaw(CRM_WORKSPACE_KEY)
  // The guard matters: a stale or hand-edited value falls back to Board rather
  // than rendering an unknown view.
  return isCrmWorkspace(stored) ? stored : DEFAULT_CRM_WORKSPACE
}

export function writeCrmWorkspace(workspace: CrmWorkspace) {
  writeRaw(CRM_WORKSPACE_KEY, workspace)
}

// ─── Agenda (Follow-Ups) panel expanded/collapsed ─────────────────────

export const AGENDA_EXPANDED_KEY = "follow-ups-expanded"
export const DEFAULT_AGENDA_EXPANDED = true

export function readAgendaExpanded(): boolean {
  return readBool(AGENDA_EXPANDED_KEY, DEFAULT_AGENDA_EXPANDED)
}

export function writeAgendaExpanded(expanded: boolean) {
  writeRaw(AGENDA_EXPANDED_KEY, String(expanded))
}

// ─── Lead Panel collapsible sections ──────────────────────────────────
// Each section persists its own expanded/collapsed state under a stable
// key so the panel reopens exactly how the locator left it. The section's
// own default (e.g. Search Criteria open, Favorites collapsed) is used
// until the user changes it — pass that default as `fallback`.

export function leadPanelSectionKey(section: string): string {
  return `lead-panel:${section}:expanded`
}

export function readSectionExpanded(section: string, fallback: boolean): boolean {
  return readBool(leadPanelSectionKey(section), fallback)
}

export function writeSectionExpanded(section: string, expanded: boolean) {
  writeRaw(leadPanelSectionKey(section), String(expanded))
}

// ─── Demo workspace welcome banner ────────────────────────────────────
// One-time "sample workspace" banner shown on first entry into the demo CRM.
// Dismissed once the user clicks Explore or Start Fresh.
//
// SCOPED PER USER. localStorage is per BROWSER, so a single global key meant one
// account's dismissal silenced the banner for every other account signing in on
// the same machine — a brand-new agent could reach the dashboard and never be
// told the leads are samples, purely because someone else had dismissed it there
// earlier. Every read and write is now namespaced by the signed-in user id.
export const DEMO_BANNER_DISMISSED_KEY = "demo-welcome-banner-dismissed"

/** Per-user key. Falls back to the legacy global key when no user is known. */
function demoBannerKey(userId?: string | null): string {
  return userId ? `${DEMO_BANNER_DISMISSED_KEY}:${userId}` : DEMO_BANNER_DISMISSED_KEY
}

export function readDemoBannerDismissed(userId?: string | null): boolean {
  return readBool(demoBannerKey(userId), false)
}

export function writeDemoBannerDismissed(dismissed: boolean, userId?: string | null) {
  writeRaw(demoBannerKey(userId), String(dismissed))
}

// ─── Interactive first-run checklist ──────────────────────────────────
// Progress (which items are checked off) and permanent dismissal for the
// guided first-run checklist shown in the demo workspace.
export const FIRST_RUN_CHECKLIST_DISMISSED_KEY = "first-run-checklist-dismissed"
export const FIRST_RUN_CHECKLIST_DONE_KEY = "first-run-checklist-done"

// Same per-user scoping as the banner above, for the same reason.
function checklistKey(base: string, userId?: string | null): string {
  return userId ? `${base}:${userId}` : base
}

export function readChecklistDismissed(userId?: string | null): boolean {
  return readBool(checklistKey(FIRST_RUN_CHECKLIST_DISMISSED_KEY, userId), false)
}

export function writeChecklistDismissed(dismissed: boolean, userId?: string | null) {
  writeRaw(checklistKey(FIRST_RUN_CHECKLIST_DISMISSED_KEY, userId), String(dismissed))
}

export function readChecklistDone(userId?: string | null): string[] {
  const raw = readRaw(checklistKey(FIRST_RUN_CHECKLIST_DONE_KEY, userId))
  return raw ? raw.split(",").filter(Boolean) : []
}

export function writeChecklistDone(ids: string[], userId?: string | null) {
  writeRaw(checklistKey(FIRST_RUN_CHECKLIST_DONE_KEY, userId), ids.join(","))
}
