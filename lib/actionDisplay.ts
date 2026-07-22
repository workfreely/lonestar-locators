// Shared display helpers for Workflow Engine actions — used by the
// Actions Due sidebar cards, the "✓ Next Action Created" toast, and
// anywhere else an action needs a Who/What/When-friendly rendering.

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

function timeOf(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
}

/**
 * "Today • 9:30 AM" / "Tomorrow • 9:30 AM" / "Fri, Jul 24 • 9:30 AM"
 * (or, verbose, "Friday, July 24 • 9:30 AM" for the toast).
 */
export function formatDueDateTime(dueAt: string, options: { verbose?: boolean } = {}): string {
  const d = new Date(dueAt)
  const now = new Date()

  const dayStart = new Date(d)
  dayStart.setHours(0, 0, 0, 0)
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)

  const time = timeOf(d)

  if (dayStart.getTime() === todayStart.getTime()) return `Today • ${time}`
  if (dayStart.getTime() === tomorrowStart.getTime()) return `Tomorrow • ${time}`

  const datePart = d.toLocaleDateString("en-US", options.verbose
    ? { weekday: "long", month: "long", day: "numeric" }
    : { weekday: "short", month: "short", day: "numeric" }
  )
  return `${datePart} • ${time}`
}
