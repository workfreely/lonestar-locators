"use client"

import { createContext, useContext, useEffect, useState } from "react"
import {
  THEME_STORAGE_KEY,
  type ThemePreference,
  type EffectiveTheme,
  resolveEffectiveTheme,
  readStoredThemePreference,
  applyTheme,
} from "@/lib/theme"

type ThemeContextValue = {
  preference: ThemePreference
  effectiveTheme: EffectiveTheme
  setPreference: (next: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

// Mounted once in app/admin/layout.tsx — the CRM's own client-side root —
// so it covers every authenticated page (leads board, Performance) without
// touching the public marketing site at all. The anti-flash inline script
// in app/layout.tsx already applied the right class before this ever
// mounts; this just picks up that same state into React and keeps it in
// sync (including live system-theme changes while "System" is selected).
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("light")
  const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>("light")

  useEffect(() => {
    const initial = readStoredThemePreference()
    setPreferenceState(initial)
    setEffectiveTheme(resolveEffectiveTheme(initial))
    applyTheme(initial)
  }, [])

  // <body>'s own background is always the marketing site's white
  // (see globals.css) since toggling `.dark` on <html> must stay
  // invisible outside the CRM. This class marks "a CRM page is actually
  // mounted" so a scoped `html.dark body.crm-admin-shell` rule (also in
  // globals.css) can swap body's background to the dark workspace color
  // for the sliver visible around/behind the shell (page-padding gaps,
  // overscroll bounce) — without ever touching body outside /admin.
  useEffect(() => {
    document.body.classList.add("crm-admin-shell")
    return () => document.body.classList.remove("crm-admin-shell")
  }, [])

  // Only relevant while "system" is selected — live-follows an OS theme
  // change without requiring a reload.
  useEffect(() => {
    if (preference !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    function handleChange() {
      setEffectiveTheme(resolveEffectiveTheme("system"))
      applyTheme("system")
    }
    mq.addEventListener("change", handleChange)
    return () => mq.removeEventListener("change", handleChange)
  }, [preference])

  function setPreference(next: ThemePreference) {
    setPreferenceState(next)
    setEffectiveTheme(resolveEffectiveTheme(next))
    window.localStorage.setItem(THEME_STORAGE_KEY, next)
    applyTheme(next)
  }

  return (
    <ThemeContext.Provider value={{ preference, effectiveTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider")
  return ctx
}
