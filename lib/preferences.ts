// CRM user preferences — the central place for remembering how the locator
// likes the UI to look and behave, so the app feels like it "remembers how
// I work" instead of resetting every session. Single-operator app with no
// per-user settings table (confirmed: no profiles/user_settings table
// exists), so every preference is a small typed read/write pair over
// localStorage with its default defined right here — call sites never touch
// storage directly. As new UI choices become persistent, add their accessors
// to this file rather than scattering localStorage keys across components.
//
// Persisted here: first-contact method, Kanban density (defaults to Compact
// for first-time users, then their last choice sticks), the Agenda panel's
// expanded/collapsed state, and each Lead Panel section's expanded/collapsed
// state. Theme is the one sibling kept in its own module (lib/theme.ts)
// because it needs an inline anti-flash script that runs before React
// hydrates — treat it as part of this same preferences family.
//
// Nothing here is imported by lib/workflowEngine.ts — the Workflow Engine
// always creates "Contact Lead" regardless of the first-contact setting;
// only the Lead Panel's button for executing that action reads it. If a real
// per-user settings table is added later, only these read*/write* helpers
// need to change — every call site already goes through them.

export type FirstContactPreference = "text" | "call" | "ask"

export const FIRST_CONTACT_STORAGE_KEY = "first-contact-preference"

export function isFirstContactPreference(value: unknown): value is FirstContactPreference {
  return value === "text" || value === "call" || value === "ask"
}

export function readFirstContactPreference(): FirstContactPreference {
  if (typeof window === "undefined") return "text"
  const stored = window.localStorage.getItem(FIRST_CONTACT_STORAGE_KEY)
  return isFirstContactPreference(stored) ? stored : "text"
}

export function writeFirstContactPreference(pref: FirstContactPreference) {
  window.localStorage.setItem(FIRST_CONTACT_STORAGE_KEY, pref)
  window.dispatchEvent(new CustomEvent<FirstContactPreference>(FIRST_CONTACT_EVENT, { detail: pref }))
}

const FIRST_CONTACT_EVENT = "first-contact-preference-changed"

// Lets an already-open Lead Panel pick up a preference change made from
// the profile menu without needing a reload — same small window-event
// pattern already used by lib/workflowToast.ts.
export function onFirstContactPreferenceChanged(handler: (pref: FirstContactPreference) => void): () => void {
  function listener(e: Event) {
    handler((e as CustomEvent<FirstContactPreference>).detail)
  }
  window.addEventListener(FIRST_CONTACT_EVENT, listener as EventListener)
  return () => window.removeEventListener(FIRST_CONTACT_EVENT, listener as EventListener)
}

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
