"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * Focus Mode — the state half of the pattern Social Beast and the CRM board already use.
 *
 * Focus is NOT a global behaviour in this app. There are two independent implementations with
 * their own sessionStorage keys — `lb-social-focus` (SocialAutopilotShell) and `lb-crm-focus`
 * (DashboardClient) — and each surface decides for itself what Focus does to its layout. What is
 * duplicated verbatim between them is exactly this: the state, the restore-on-mount, the
 * write-only-on-explicit-change setter, and the Esc handler.
 *
 * So this hook captures that shared third and nothing else. The LAYOUT effect stays with the caller
 * because it genuinely differs per surface (Social Beast widens its max-width; the CRM board does
 * something else). Social Beast and DashboardClient are deliberately NOT migrated here — they work,
 * and rewriting them to prove a point would risk regressions for no user-visible gain. They can
 * adopt this later.
 *
 * Per-TAB persistence (sessionStorage, not localStorage) is intentional and matches both existing
 * implementations: a fresh tab starts unfocused.
 */
export function useFocusMode(storageKey: string): { focus: boolean; setFocus: (on: boolean) => void; toggle: () => void } {
  const [focus, setFocusState] = useState(false)

  // Restore on mount so a refresh stays in Focus.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(storageKey) === "1") setFocusState(true)
    } catch {
      /* storage unavailable — Focus simply won't persist */
    }
  }, [storageKey])

  // Single entry point: updates state AND persists. Writing only on explicit change (never via a
  // state-mirroring effect) avoids clobbering the restored value on first render.
  const setFocus = useCallback(
    (on: boolean) => {
      setFocusState(on)
      try {
        sessionStorage.setItem(storageKey, on ? "1" : "0")
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  )

  // Esc leaves Focus. Convenience only; the visible Exit Focus control is the primary way out.
  useEffect(() => {
    if (!focus) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocus(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [focus, setFocus])

  const toggle = useCallback(() => setFocus(!focus), [focus, setFocus])
  return { focus, setFocus, toggle }
}
