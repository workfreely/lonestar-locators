"use client"

import { useCallback, useEffect, useState } from "react"
import AppHeader from "@/components/crm/AppHeader"
import BackToDashboard from "@/components/crm/BackToDashboard"
import SocialAutopilotNav from "@/components/crm/social/SocialAutopilotNav"

// Social Beast Focus Mode — a workspace-level presentation state, modeled on the CRM Focus Mode
// (DashboardClient): a single boolean, persisted to sessionStorage so it survives a refresh and
// stays on while navigating between Social Beast tabs (this shell is rendered by the persistent
// Social Autopilot layout, so it never unmounts on a tab change). Esc leaves Focus (convenience,
// like the CRM board — unrelated to the browser's fullscreen Esc; we do NOT use the fullscreen API).
//
// Normal mode is unchanged: the global Locator Beast header (logo + Back to Lead Board + avatar)
// over the Social Beast workspace. In Focus Mode that global chrome is hidden and the workspace
// moves up into — and widens into — the reclaimed viewport, while the Social Beast title + tab bar
// (which you need to move around inside Social Beast) stay. The Focus/Exit Focus control lives in
// the Social Beast nav.
const FOCUS_KEY = "lb-social-focus"

export default function SocialAutopilotShell({ children }: { children: React.ReactNode }) {
  const [focus, setFocusState] = useState(false)

  // Restore from sessionStorage on mount so a refresh on any Social Beast tab stays in Focus.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(FOCUS_KEY) === "1") setFocusState(true)
    } catch {
      /* ignore */
    }
  }, [])

  // Single entry point: updates state AND persists. Writing only on explicit change (never via a
  // state-mirroring effect) avoids clobbering the restored value on first render — same as CRM.
  const setFocus = useCallback((on: boolean) => {
    setFocusState(on)
    try {
      sessionStorage.setItem(FOCUS_KEY, on ? "1" : "0")
    } catch {
      /* ignore */
    }
  }, [])

  // Esc leaves Focus. Convenience only, deliberately not advertised (the visible Exit Focus control
  // is the primary way out), and unrelated to any browser fullscreen behavior.
  useEffect(() => {
    if (!focus) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocus(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [focus, setFocus])

  return (
    <div className={"sa-scope relative h-full w-full flex flex-col bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-[var(--crm-workspace)] dark:to-[var(--crm-workspace)]" + (focus ? " sa-focus" : "")}>
      {/* Global Locator Beast chrome — hidden in Focus Mode so the workspace reclaims the space. */}
      {!focus && (
        <AppHeader variant="dark" fullBleed>
          <BackToDashboard />
        </AppHeader>
      )}

      {/* In Focus the workspace moves UP (smaller top padding) and WIDENS (larger max-width) to use
          the reclaimed viewport; the Ask-Beast clearance and side padding are preserved. */}
      <div className={"beast-ai-clearance flex-1 overflow-y-auto " + (focus ? "px-5 pt-3 pb-5" : "p-5")}>
        <div className={"mx-auto " + (focus ? "max-w-[1600px]" : "max-w-[1200px]")}>
          <SocialAutopilotNav focus={focus} onToggleFocus={() => setFocus(!focus)} />
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
