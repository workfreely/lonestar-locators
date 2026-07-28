// ─── Beast Milestones — declarative registry ────────────────────────────────
//
// Locator Beast's achievement system. Milestones are pure DATA: each entry
// describes how to recognize it (isUnlocked) and how to celebrate it (badge,
// title, message, intensity). The engine (engine.ts) evaluates these against
// live stats; nothing about closing a lease is hardcoded to the confetti.
//
// To add a new milestone in the future (10 leases, $1M lifetime, …) you add
// ONE entry here — no other file changes. Each milestone unlocks at most once
// per account (its key is persisted; see storage.ts).

export type MilestoneIntensity = "small" | "big"

// A snapshot of the numbers milestones are judged against. Widen this as new
// milestone types need new signals (e.g. tours booked, referrals) — existing
// milestones keep working.
export type MilestoneStats = {
  // All-time leases closed (leads that have ever had a closed_at set).
  totalLeasesClosed: number
  // Commission earned in the CURRENT calendar month, in dollars.
  monthlyCommission: number
  // All-time commission, in dollars (for future lifetime milestones).
  lifetimeCommission: number
}

export type BeastMilestone = {
  // Stable, unique, persisted forever — never rename an existing key.
  key: string
  // Small emoji shown on the milestone's badge chip (🎉 lease, 💰 commission).
  badgeEmoji: string
  // Short name, e.g. "First Lease" or "$25,000 Month".
  title: string
  // Celebratory sentence shown in the toast body.
  message: string
  // Drives how big the confetti burst is. Commission milestones are "big"
  // (more noticeable than the first lease) but still tasteful.
  intensity: MilestoneIntensity
  // True once the account has earned this milestone, given current stats.
  isUnlocked: (stats: MilestoneStats) => boolean
}

const usd = (n: number) => `$${n.toLocaleString("en-US")}`

// First-time monthly commission milestones. Celebrated the first time the
// account ever crosses each threshold in a month — once per account, ever.
const MONTHLY_COMMISSION_TIERS = [10_000, 25_000, 50_000, 100_000]

const commissionMilestone = (tier: number): BeastMilestone => ({
  key: `commission_month_${tier}`,
  badgeEmoji: "💰",
  title: `${usd(tier)} Month`,
  message: `You just crossed ${usd(tier)} in commissions this month!`,
  intensity: "big",
  isUnlocked: (s) => s.monthlyCommission >= tier,
})

// ─── Active milestones ──────────────────────────────────────────────────────
export const BEAST_MILESTONES: BeastMilestone[] = [
  {
    key: "first_lease",
    badgeEmoji: "🎉",
    title: "First Lease",
    message: "Congratulations on closing your first lease!",
    intensity: "small",
    isUnlocked: (s) => s.totalLeasesClosed >= 1,
  },
  ...MONTHLY_COMMISSION_TIERS.map(commissionMilestone),
]

// ─── Future milestones (ready to enable) ────────────────────────────────────
// Defined but NOT yet active — spread these into BEAST_MILESTONES above when
// you want them live. They demonstrate that growing the system is purely
// additive: no engine, toast, or storage changes required.
export const FUTURE_BEAST_MILESTONES: BeastMilestone[] = [
  {
    key: "leases_10",
    badgeEmoji: "🐆",
    title: "10 Leases Closed",
    message: "You've closed 10 leases in Locator Beast!",
    intensity: "big",
    isUnlocked: (s) => s.totalLeasesClosed >= 10,
  },
  {
    key: "leases_50",
    badgeEmoji: "🐆",
    title: "50 Leases Closed",
    message: "50 leases closed — you're on a tear!",
    intensity: "big",
    isUnlocked: (s) => s.totalLeasesClosed >= 50,
  },
  {
    key: "leases_100",
    badgeEmoji: "🐆",
    title: "100 Leases Closed",
    message: "100 leases closed in Locator Beast. Incredible.",
    intensity: "big",
    isUnlocked: (s) => s.totalLeasesClosed >= 100,
  },
  {
    key: "lifetime_commission_500000",
    badgeEmoji: "💰",
    title: `${usd(500_000)} Lifetime`,
    message: `You've earned ${usd(500_000)} in lifetime commissions!`,
    intensity: "big",
    isUnlocked: (s) => s.lifetimeCommission >= 500_000,
  },
  {
    key: "lifetime_commission_1000000",
    badgeEmoji: "💰",
    title: `${usd(1_000_000)} Lifetime`,
    message: `Seven figures — ${usd(1_000_000)} in lifetime commissions!`,
    intensity: "big",
    isUnlocked: (s) => s.lifetimeCommission >= 1_000_000,
  },
]
