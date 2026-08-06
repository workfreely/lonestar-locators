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

const ACTION_ICONS: Record<string, string> = {
  "Contact Lead": "📞",
  "Follow Up": "💬",
  "Send List": "🏠",
  "FU1": "💬",
  "FU2": "💬",
  "FU3": "💬",
  "Final": "💬",
  "Reconnect Client": "🔄",
  "Setup Tour": "📅",
  "Tour Follow-Up": "🚶",
  "Check App": "📄",
  "Get Invoice Details": "🧾",
}

const DEFAULT_ICON = "📌"

export function getActionIcon(title: string): string {
  return ACTION_ICONS[title] ?? DEFAULT_ICON
}

