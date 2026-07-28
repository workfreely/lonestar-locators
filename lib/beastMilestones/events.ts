// Tiny window-event bus connecting "a Beast Milestone was just unlocked"
// (the useBeastMilestones hook) to "celebrate it" (BeastMilestoneToast,
// mounted once in DashboardClient) — same decoupled pattern as workflowToast.

import type { BeastMilestone } from "./registry"

const EVENT_NAME = "beast-milestone-unlocked"

export function emitBeastMilestone(milestone: BeastMilestone) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent<BeastMilestone>(EVENT_NAME, { detail: milestone }))
}

export function onBeastMilestone(handler: (milestone: BeastMilestone) => void): () => void {
  function listener(e: Event) {
    handler((e as CustomEvent<BeastMilestone>).detail)
  }
  window.addEventListener(EVENT_NAME, listener as EventListener)
  return () => window.removeEventListener(EVENT_NAME, listener as EventListener)
}
