// CRM user preferences — currently just "how does the locator prefer to
// make first contact." Single-operator app with no per-user settings
// table (confirmed: no profiles/user_settings table exists), so this is
// deliberately a clean localStorage-backed implementation, matching the
// same convention already used for theme preference and every
// collapsible section's expanded/collapsed state. Nothing here is
// imported by lib/workflowEngine.ts — the Workflow Engine always creates
// "Contact Lead" regardless of this setting; only the Lead Panel's button
// for executing that action reads it. If a real per-user settings table
// is added later, only readFirstContactPreference/writeFirstContactPreference
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
