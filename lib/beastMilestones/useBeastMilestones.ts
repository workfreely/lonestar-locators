"use client"

import { useEffect, useRef } from "react"
import { BEAST_MILESTONES } from "./registry"
import { computeMilestoneStats, findNewlyUnlocked } from "./engine"
import { fetchUnlockedMilestones, persistMilestoneUnlocked } from "./storage"
import { emitBeastMilestone } from "./events"

// Watches the live leads for newly-earned Beast Milestones and emits a
// celebration event for each. Mount once (in DashboardClient); the
// BeastMilestoneToast listens for the events it emits.
//
// Two-phase design so history never triggers a retroactive burst:
//   1. On mount, fetch the already-unlocked set, then SILENTLY mark every
//      milestone the account has ALREADY earned as unlocked (no celebration).
//   2. Only after that baseline is set do live changes celebrate — so a fresh
//      close that crosses a new threshold fires, but opening the app on an
//      account with past closes does not.
export function useBeastMilestones(leads: any[], avgCommission: number, demoMode: boolean) {
  const unlockedRef = useRef<Set<string>>(new Set())
  const readyRef = useRef(false)

  // Phase 1 — baseline. Runs once; `leads` at mount is the backfill snapshot.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const unlocked = await fetchUnlockedMilestones(demoMode)
      if (cancelled) return
      unlockedRef.current = unlocked

      const stats = computeMilestoneStats(leads, avgCommission)
      for (const m of findNewlyUnlocked(stats, BEAST_MILESTONES, unlockedRef.current)) {
        unlockedRef.current.add(m.key)
        void persistMilestoneUnlocked(m.key, demoMode) // silent: no emit
      }
      readyRef.current = true
    })()
    return () => {
      cancelled = true
    }
    // Intentionally mount-only: leads is the baseline snapshot, not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Phase 2 — celebrate crossings after the baseline is established.
  useEffect(() => {
    if (!readyRef.current) return
    const stats = computeMilestoneStats(leads, avgCommission)
    for (const m of findNewlyUnlocked(stats, BEAST_MILESTONES, unlockedRef.current)) {
      unlockedRef.current.add(m.key)
      void persistMilestoneUnlocked(m.key, demoMode)
      emitBeastMilestone(m)
    }
  }, [leads, avgCommission, demoMode])

  // ─── TEMPORARY (dev/testing) — remove after verifying the animation ─────────
  // Force a milestone celebration to display regardless of unlock state, so the
  // confetti + toast can be checked without actually closing a lead. Trigger by
  // loading the dashboard with `?celebrate` (defaults to First Lease) or
  // `?celebrate=<milestoneKey>` (e.g. `?celebrate=commission_month_25000`).
  // Emits ONLY — it never persists, so it can't consume the real once-per-
  // account unlock. Delete this whole effect (and the `demoMode` note) to remove.
  useEffect(() => {
    if (typeof window === "undefined") return
    const raw = new URLSearchParams(window.location.search).get("celebrate")
    if (raw === null) return
    const key = raw || "first_lease"
    const milestone = BEAST_MILESTONES.find((m) => m.key === key) ?? BEAST_MILESTONES[0]
    // Small delay so the BeastMilestoneToast listener is definitely mounted.
    const t = setTimeout(() => emitBeastMilestone(milestone), 300)
    return () => clearTimeout(t)
  }, [])
}
