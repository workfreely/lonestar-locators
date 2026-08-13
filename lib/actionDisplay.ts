// Shared display helpers for Workflow Engine actions — used by the
// Actions Due sidebar cards, the "✓ Next Action Created" toast, and
// anywhere else an action needs a Who/What/When-friendly rendering.

// The DUE date/time formatter now lives in @bc/companion-shared so the CRM and
// the Beast Companion render it identically and can never drift. Re-exported
// here so existing CRM callers keep importing it from "@/lib/actionDisplay".
// Called without a timeZone, it preserves the CRM's historical local-zone
// Today/Tomorrow behavior (and now also appends the year for dates in another
// calendar year — previously omitted).
export { formatDueDateTime } from "@bc/format/dueDate"
export type { DueDateFormatOptions } from "@bc/format/dueDate"

import { formatWorkflowActionLabel } from "@/lib/leads/workflowActionLabels"

// Icon map keyed by the CANONICAL display label (formatWorkflowActionLabel's
// output). Every emoji value is UNCHANGED from before — the map was only re-keyed
// from legacy titles to canonical labels so each action keeps the exact same emoji
// under its new wording (FU1/FU2/FU3/Final → the four follow-ups all keep 💬;
// Setup Tour → Schedule Tour keeps 📅; Check App → Check Application keeps 📄).
// No new emojis are introduced. getActionIcon canonicalizes its input first, so a
// renamed label never falls back to the default pin.
const ACTION_ICONS: Record<string, string> = {
  "Contact Lead": "📞",
  "Follow Up": "💬",
  "Send List": "🏠",
  "1st Follow-Up": "💬",
  "2nd Follow-Up": "💬",
  "3rd Follow-Up": "💬",
  "Final Follow-Up": "💬",
  "Reconnect Client": "🔄",
  "Schedule Tour": "📅",
  "Tour Follow-Up": "🚶",
  "Check Application": "📄",
  "Get Invoice Details": "🧾",
}

const DEFAULT_ICON = "📌"

export function getActionIcon(titleOrKey: string): string {
  return ACTION_ICONS[formatWorkflowActionLabel(titleOrKey)] ?? DEFAULT_ICON
}

