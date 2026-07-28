// ─── Beast Milestones — evaluation engine ───────────────────────────────────
// Pure functions: turn the live leads array into a MilestoneStats snapshot,
// and decide which milestones are newly earned. No UI, no side-effects.

import type { BeastMilestone, MilestoneStats } from "./registry"

function isThisMonth(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return false
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

// Commission mirrors the dashboard's model exactly: a close is worth the
// account's avg_commission_per_lease, and a lease counts as closed once it has
// a closed_at (durable — survives the monthly Closed→Archived cleanup).
export function computeMilestoneStats(leads: any[], avgCommission: number): MilestoneStats {
  const closed = leads.filter((l) => !!l?.closed_at)
  const closedThisMonth = closed.filter((l) => isThisMonth(l.closed_at))
  return {
    totalLeasesClosed: closed.length,
    monthlyCommission: closedThisMonth.length * avgCommission,
    lifetimeCommission: closed.length * avgCommission,
  }
}

// The milestones satisfied by `stats` that the account hasn't unlocked yet.
export function findNewlyUnlocked(
  stats: MilestoneStats,
  definitions: BeastMilestone[],
  alreadyUnlocked: Set<string>,
): BeastMilestone[] {
  return definitions.filter((m) => !alreadyUnlocked.has(m.key) && m.isUnlocked(stats))
}
