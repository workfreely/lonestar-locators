"use client"

import { createContext, useContext, useEffect, useState } from "react"
import {
  THEME_STORAGE_KEY,
  DEFAULT_THEME,
  type CrmTheme,
  readStoredTheme,
  applyTheme,
  isCrmTheme,
} from "@/lib/theme"

// Stage T1 theme sync envelope (window.postMessage) between the CRM page and the
// Beast Companion extension's content-script bridge. "changed" = the CRM user
// picked a theme; "apply" = the bridge asks the CRM to adopt the shared theme.
const THEME_MSG_SOURCE = "lb-theme"

type ThemeContextValue = {
  preference: CrmTheme
  setPreference: (next: CrmTheme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

// Mounted once in app/admin/layout.tsx — the CRM's own client-side root —
// so it covers every authenticated page (leads board, Performance) without
// touching the public marketing site at all. The anti-flash inline script
// in app/layout.tsx already applied the right theme before this ever
// mounts; this just picks up that same state into React and keeps it in
// sync when the user changes the Appearance setting.
export function ThemeProvider({
  children,
  forcedTheme,
}: {
  children: React.ReactNode
  // When set, the provider is LOCKED to this theme and ignores (and never
  // writes) the visitor's stored preference. Used by the public homepage demo
  // so it always renders in the original demo theme regardless of whatever a
  // logged-in user picked for their own CRM workspace.
  forcedTheme?: CrmTheme
}) {
  const [preference, setPreferenceState] = useState<CrmTheme>(forcedTheme ?? DEFAULT_THEME)

  useEffect(() => {
    const initial = forcedTheme ?? readStoredTheme()
    setPreferenceState(initial)
    applyTheme(initial)
  }, [forcedTheme])

  // <body>'s own background is always the marketing site's white
  // (see globals.css) since toggling `.dark`/`data-theme` on <html> must
  // stay invisible outside the CRM. This class marks "a CRM page is
  // actually mounted" so a scoped `html.dark body.crm-admin-shell` rule
  // (also in globals.css) can swap body's background to the workspace
  // color for the sliver visible around/behind the shell (page-padding
  // gaps, overscroll bounce) — without ever touching body outside /admin.
  useEffect(() => {
    document.body.classList.add("crm-admin-shell")
    return () => document.body.classList.remove("crm-admin-shell")
  }, [])

  // Apply a theme to React state + localStorage + the DOM. `broadcast` posts the
  // change to the Companion bridge; it's FALSE when we're applying a theme that
  // came FROM the bridge, which prevents an echo loop.
  function applyPreference(next: CrmTheme, broadcast: boolean) {
    setPreferenceState(next)
    window.localStorage.setItem(THEME_STORAGE_KEY, next)
    applyTheme(next)
    if (broadcast) {
      try {
        window.postMessage(
          { source: THEME_MSG_SOURCE, type: "changed", theme: next },
          window.location.origin,
        )
      } catch {
        /* ignore — sync is best-effort */
      }
    }
  }

  function setPreference(next: CrmTheme) {
    // Locked providers (homepage demo) ignore preference changes entirely.
    if (forcedTheme) return
    applyPreference(next, true)
  }

  // Adopt theme changes pushed from Beast Companion via the content-script bridge.
  // Compare-before-apply against the live DOM attribute (the currently-applied
  // theme) so an unchanged value is a no-op and never re-broadcasts.
  useEffect(() => {
    if (forcedTheme) return
    function onMessage(e: MessageEvent) {
      if (e.source !== window) return
      const d = e.data
      if (!d || d.source !== THEME_MSG_SOURCE || d.type !== "apply" || !isCrmTheme(d.theme)) return
      if (document.documentElement.getAttribute("data-theme") === d.theme) return
      applyPreference(d.theme, false)
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcedTheme])

  return (
    <ThemeContext.Provider value={{ preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider")
  return ctx
}

// Non-throwing variant for shared components (e.g. ProfileAvatarMenu) that
// render both inside the CRM (where the provider exists) and outside it (the
// Smart Lead Form editor, which is not a CRM page and has no ThemeProvider).
// Returns null when there's no provider so the caller can hide theme controls
// rather than crash.
export function useOptionalTheme(): ThemeContextValue | null {
  return useContext(ThemeContext)
}
