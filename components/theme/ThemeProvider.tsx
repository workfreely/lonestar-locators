"use client"

import { createContext, useContext, useEffect, useState } from "react"
import {
  THEME_STORAGE_KEY,
  DEFAULT_THEME,
  type CrmTheme,
  readStoredTheme,
  applyTheme,
} from "@/lib/theme"

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
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<CrmTheme>(DEFAULT_THEME)

  useEffect(() => {
    const initial = readStoredTheme()
    setPreferenceState(initial)
    applyTheme(initial)
  }, [])

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

  function setPreference(next: CrmTheme) {
    setPreferenceState(next)
    window.localStorage.setItem(THEME_STORAGE_KEY, next)
    applyTheme(next)
  }

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
