"use client"

import { useEffect } from "react"
import { onWorkflowActionCreated } from "@/lib/workflowToast"

// B3 Phase 1 — Follow-Up Calendar trigger (Locator Beast).
//
// When the workflow engine creates or advances a canonical follow-up action
// (FU1 on list-sent, then FU2/FU3/Final on completion), it emits the shared
// `workflow-action-created` window event. This mounts one listener that, for
// follow-up actions only, fires a best-effort per-agent Google Calendar sync.
//
// Fire-and-forget: it NEVER blocks the CRM/workflow. The server route
// (/api/admin/leads/followup-calendar/sync) is session-authed + workspace-
// scoped, resolves the owning agent's own calendar, and skips gracefully when
// Google isn't connected or errors. Non-follow-up actions are ignored here (and
// re-checked server-side), so this makes no wasted requests.
const FOLLOW_UP_TITLES = new Set(["FU1", "FU2", "FU3", "Final"])

export default function FollowUpCalendarSync() {
  useEffect(() => {
    return onWorkflowActionCreated((action) => {
      if (!action?.id || !FOLLOW_UP_TITLES.has((action.title ?? "").trim())) return
      void fetch("/api/admin/leads/followup-calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: action.id }),
        keepalive: true,
      }).catch(() => {
        /* best-effort — a sync failure must never surface in the CRM */
      })
    })
  }, [])

  return null
}
