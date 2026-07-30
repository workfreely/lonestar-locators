// Lead Responsiveness — a computed engagement metric shown to the user as a
// simple Low / Moderate / High. The user NEVER sees the underlying math.
//
// Designed as a FRAMEWORK: it scores a set of weighted SIGNALS, so new inputs
// (especially Beast Companion communication analytics) can be added over time
// without changing call sites or the UI. Just add a signal to the type and a
// contribution below.
//
//   Primary driver (Beast Companion, added over time): avg response time, reply
//     consistency, engagement trend, follow-up response rate, conversation
//     activity over time.
//   Contextual (CRM, available today): time since last contact, pipeline stage.
//
// Companion signals carry more weight than CRM context, so as they come online
// responsiveness becomes primarily communication-driven — no UI change needed.

export type ResponsivenessLevel = "Low" | "Moderate" | "High"

export type ResponsivenessSignals = {
  // ── Beast Companion communication analytics (primary) ──
  avgResponseTimeMinutes?: number | null // lower = more responsive
  replyConsistency?: number | null // 0..1
  engagementTrend?: number | null // -1 (declining) .. 1 (improving)
  followUpResponseRate?: number | null // 0..1
  conversationActivity?: number | null // 0..1 recent activity level
  // ── CRM contextual signals (secondary; available now) ──
  daysSinceLastContact?: number | null
  pipelineStage?: string | null
}

type Contribution = { score: number; weight: number }

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

// Beast Companion analytics — weighted higher (this is the primary driver as it
// comes online). Each present signal contributes a 0..1 sub-score.
function companionContributions(s: ResponsivenessSignals): Contribution[] {
  const out: Contribution[] = []
  if (s.avgResponseTimeMinutes != null) {
    out.push({ score: clamp01(1 - s.avgResponseTimeMinutes / (24 * 60)), weight: 3 })
  }
  if (s.replyConsistency != null) out.push({ score: clamp01(s.replyConsistency), weight: 2 })
  if (s.engagementTrend != null) out.push({ score: clamp01((s.engagementTrend + 1) / 2), weight: 2 })
  if (s.followUpResponseRate != null) out.push({ score: clamp01(s.followUpResponseRate), weight: 3 })
  if (s.conversationActivity != null) out.push({ score: clamp01(s.conversationActivity), weight: 2 })
  return out
}

const STAGE_ENGAGEMENT: Record<string, number> = {
  new: 0.15,
  contacted: 0.35,
  searching: 0.5,
  list_sent: 0.6,
  ready_to_tour: 0.8,
  done_touring: 0.85,
  applied: 0.95,
  closed: 1,
}

// CRM contextual signals — weighted lower.
function crmContributions(s: ResponsivenessSignals): Contribution[] {
  const out: Contribution[] = []
  if (s.daysSinceLastContact != null) {
    const d = s.daysSinceLastContact
    out.push({ score: d <= 2 ? 1 : d <= 7 ? 0.7 : d <= 14 ? 0.4 : 0.15, weight: 1 })
  }
  if (s.pipelineStage) {
    out.push({ score: STAGE_ENGAGEMENT[s.pipelineStage] ?? 0.3, weight: 1 })
  }
  return out
}

// Weighted average of every present signal → Low / Moderate / High. With no
// signals at all, defaults to Moderate (neutral) rather than penalizing a lead.
export function scoreResponsiveness(s: ResponsivenessSignals): {
  level: ResponsivenessLevel
  score: number
} {
  const contribs = [...companionContributions(s), ...crmContributions(s)]
  if (contribs.length === 0) return { level: "Moderate", score: 0.5 }
  const totalWeight = contribs.reduce((a, c) => a + c.weight, 0)
  const score = contribs.reduce((a, c) => a + c.score * c.weight, 0) / totalWeight
  const level: ResponsivenessLevel = score >= 0.66 ? "High" : score >= 0.4 ? "Moderate" : "Low"
  return { level, score }
}

// Derive the signals available today from a CRM lead. Beast Companion analytics
// are absent until the ingest pipeline computes them — when present, attach them
// here (or pass a richer signals object) and the score updates automatically.
export function responsivenessSignalsFromLead(lead: {
  crm_status?: string | null
  last_contacted_at?: string | null
  updated_at?: string | null
}): ResponsivenessSignals {
  const lastContact = lead?.last_contacted_at || lead?.updated_at || null
  let daysSinceLastContact: number | null = null
  if (lastContact) {
    const t = new Date(lastContact).getTime()
    if (!isNaN(t)) daysSinceLastContact = Math.max(0, (Date.now() - t) / 86_400_000)
  }
  return { daysSinceLastContact, pipelineStage: lead?.crm_status ?? null }
}

export function getLeadResponsiveness(lead: {
  crm_status?: string | null
  last_contacted_at?: string | null
  updated_at?: string | null
}): ResponsivenessLevel {
  return scoreResponsiveness(responsivenessSignalsFromLead(lead)).level
}

// Close Ratio — overall likelihood they'll successfully lease. A BALANCED
// WEIGHTED COMPOSITE of three normalized factors, NOT a multiplication (so no
// single factor can dominate):
//   Approval Probability (can they qualify?)
//   Lead Responsiveness  (how engaged?)
//   Pipeline Progress    (how far along?)
//
// Consequences of the balance: strong engagement lifts an early-pipeline lead,
// and being far along does NOT by itself yield a high ratio when approval or
// responsiveness is poor. Each factor is 0..1; weights are near-equal and each
// capped well below 0.5 so none overwhelms the others. The UI is unchanged (one
// percentage). Tune weights or factor values here as the model matures.
const PIPELINE_PROGRESS: Record<string, number> = {
  new: 0.1,
  contacted: 0.2,
  searching: 0.35,
  list_sent: 0.5,
  ready_to_tour: 0.65,
  done_touring: 0.8,
  applied: 0.95,
  closed: 1,
}

const APPROVAL_FACTOR: Record<string, number> = { High: 1, Moderate: 0.65, Low: 0.35 }
const RESPONSIVENESS_FACTOR: Record<string, number> = { High: 1, Moderate: 0.65, Low: 0.35 }

// Near-equal weights (sum = 1) — deliberately balanced so no factor dominates.
const CLOSE_WEIGHTS = { approval: 0.34, responsiveness: 0.33, pipeline: 0.33 }

export function computeCloseRatioPercent(
  stage: string | null | undefined,
  approvalLabel: string,
  responsiveness: ResponsivenessLevel
): number {
  // Closed is a terminal SUCCESS outcome (they leased), not a prediction → 100%.
  if (stage === "closed") return 100

  const approval = APPROVAL_FACTOR[approvalLabel] ?? 0.65
  const engagement = RESPONSIVENESS_FACTOR[responsiveness] ?? 0.65
  const progress = PIPELINE_PROGRESS[stage ?? ""] ?? PIPELINE_PROGRESS.new

  const composite =
    CLOSE_WEIGHTS.approval * approval +
    CLOSE_WEIGHTS.responsiveness * engagement +
    CLOSE_WEIGHTS.pipeline * progress

  return Math.max(0, Math.min(100, Math.round(composite * 100)))
}
