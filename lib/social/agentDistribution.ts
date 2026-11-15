// AGENT DISTRIBUTION — fill an agent's own slots from content the operator has already approved.
//
// This is the whole of Phase D. It exists because nothing else creates a post for an agent: the
// autopilot planner only CLAIMS existing unassigned posts, and the operator's posts are his —
// each agent needs their own row to carry their own schedule, destination and lead routing.
//
// ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────────────────────
// It does not touch the operator's workflow. It never edits one of his posts, never renders,
// never re-captions, never approves anything of his, and never calls the planner. It only
// INSERTS rows whose connection_id is an external agent's.
//
// ── READINESS IS HIS EXISTING APPROVAL ──────────────────────────────────────────────────────
// A property reaches an agent only when the operator has approved a post of his own for it.
// approved_at is already the one column a human sets deliberately, it is already in his
// workflow, and it already means "I am satisfied with this video". Nothing new was invented to
// express it, and an unfinished draft is therefore never offered — including one that merely has
// a finished render, because a render means a machine succeeded, not that he was satisfied.
import { effectiveDailyTimes } from "@/lib/social/autopilotDestination"
import { parseMarketRestriction, isMarketAllowed } from "@/lib/social/marketRestriction"
import { renderRefusalFor, type RenderRefusal } from "@/lib/social/renderAuthorization"
import { isExternalAgentConnection } from "@/lib/social/agentIdentity"

/** How far ahead to fill. A rolling window, not a one-off backfill. */
export const AGENT_QUEUE_DAYS = 7
/** The operator's existing property cooldown, unchanged and applied per connection. */
export const AGENT_COOLDOWN_DAYS = 21

export type AgentConnection = {
  id: string
  provider: string | null
  status: string | null
  posting_paused: boolean | null
  posts_per_day: number | null
  stagger_offset_minutes: number | null
  market_restriction: unknown
  agent_user_id: string | null
  owner_user_id: string | null
  token_expires_at: string | null
}

/** One of the operator's APPROVED posts, offered as distributable content. */
export type ApprovedSource = {
  postId: string
  sourceContentId: string
  /** The property's identity for cooldown purposes — place_id when known, else the content row. */
  propertyKey: string
  market: string | null
  destination: string | null
  platform: string | null
  caption: string | null
  hashtags: string[] | null
  overlayTemplate: string | null
  renderId: string | null
  renderedStoragePath: string | null
  renderVersion: number | null
  identityState: string | null
  identityOwnerUserId: string | null
  availableToAgents: boolean | null
}

export type PlannedAgentPost = {
  connectionId: string
  agentUserId: string
  ownerUserId: string
  scheduledAtUtc: string
  sourcePostId: string
  sourceContentId: string
  propertyKey: string
  /** The artifact is REUSED, never re-rendered — the agent publishes the operator's exact file. */
  renderId: string
  renderedStoragePath: string
  renderVersion: number | null
  caption: string | null
  hashtags: string[] | null
  destination: string
  platform: string
}

export type AgentSkip = { connectionId: string; slotUtc: string | null; reason: string; detail?: string }

export type AgentDistributionPlan = {
  planned: PlannedAgentPost[]
  skipped: AgentSkip[]
  /** Connections whose queue could not be filled — surfaced rather than quietly repeating. */
  unfilled: { connectionId: string; slots: number; reason: string }[]
}

/** Minutes-from-midnight slot -> an absolute UTC instant, supplied by the caller so this file
 *  needs no timezone machinery of its own (the planner's wallClockToUtcISO is passed in). */
export type SlotResolver = (dateKey: string, minute: number, timezone: string) => string

export type PlanInput = {
  connections: readonly AgentConnection[]
  /** The operator's approved, rendered posts. */
  approved: readonly ApprovedSource[]
  /** scheduled_at values already taken, per connection — the idempotency key for this job. */
  takenByConnection: ReadonlyMap<string, ReadonlySet<string>>
  /** When each connection last posted each property, for the cooldown. */
  historyByConnection: ReadonlyMap<string, ReadonlyMap<string, string>>
  now: Date
  timezone: string
  dateKeys: readonly string[]
  resolveSlot: SlotResolver
  queueDays?: number
}

/**
 * Compute what SHOULD exist. Pure: no database, no clock of its own, no writes. The caller
 * decides whether to apply it, exactly as runAutopilotPlan separates planning from persistence.
 */
export function planAgentDistribution(input: PlanInput): AgentDistributionPlan {
  const planned: PlannedAgentPost[] = []
  const skipped: AgentSkip[] = []
  const unfilled: AgentDistributionPlan["unfilled"] = []
  const days = Math.max(1, input.queueDays ?? AGENT_QUEUE_DAYS)
  const cooldownMs = AGENT_COOLDOWN_DAYS * 86_400_000

  for (const conn of input.connections) {
    // ── ONLY EXTERNAL AGENTS. The operator's own destinations are served by his own workflow and
    // this job must never place a post on one. A connection whose agent IS its owner — the live
    // Instagram row's shape — is his, not an agent's.
    if (!isExternalAgentConnection(conn)) {
      skipped.push({ connectionId: conn.id, slotUtc: null, reason: "not_an_agent_connection" })
      continue
    }
    if (conn.posting_paused === true) {
      skipped.push({ connectionId: conn.id, slotUtc: null, reason: "destination_paused" })
      continue
    }
    if (conn.status && conn.status !== "connected") {
      skipped.push({ connectionId: conn.id, slotUtc: null, reason: `destination_${conn.status}` })
      continue
    }
    const agentUserId = conn.agent_user_id as string
    const ownerUserId = conn.owner_user_id as string
    const provider = conn.provider ?? "instagram"

    const allowedMarkets = parseMarketRestriction(conn.market_restriction)
    const taken = input.takenByConnection.get(conn.id) ?? new Set<string>()
    const history = input.historyByConnection.get(conn.id) ?? new Map<string, string>()
    // Properties this run has already used for THIS connection, so one pass cannot schedule the
    // same property twice inside the window.
    const usedThisRun = new Map<string, number>()

    const times = effectiveDailyTimes(conn.id, conn.stagger_offset_minutes, undefined)
    let unfilledSlots = 0
    let lastReason = "no_eligible_content"

    for (const dateKey of input.dateKeys.slice(0, days)) {
      for (const minute of times) {
        const slotUtc = input.resolveSlot(dateKey, minute, input.timezone)
        // ── SAFEGUARD: the slot is already spoken for. Running this job twice is a no-op; the
        // unique index on (connection_id, scheduled_at) is the backstop beneath it.
        if (taken.has(slotUtc)) continue
        // A slot in the past is not fillable — publishing it would fire immediately.
        if (Date.parse(slotUtc) <= input.now.getTime()) continue

        const pick = input.approved.find((a) => {
          if (!a.renderId || !a.renderedStoragePath) return false
          if ((a.platform ?? "instagram") !== provider) return false
          if (allowedMarkets && !isMarketAllowed(allowedMarkets, a.market)) return false
          // ── THE IDENTITY RULE, asked here so a refused pairing never occupies a slot.
          const refusal = renderRefusalFor({
            render: { identityState: a.identityState as never, identityOwnerUserId: a.identityOwnerUserId },
            source: { availableToAgents: a.availableToAgents },
            destination: { connectionId: conn.id, agent_user_id: conn.agent_user_id, owner_user_id: conn.owner_user_id },
          })
          if (refusal) return false
          // ── COOLDOWN, unchanged at 21 days and per connection. Content is NEVER repeated to
          // fill a queue: an exhausted pool leaves the slot empty and is reported.
          const lastUsed = usedThisRun.get(a.propertyKey) ?? (history.get(a.propertyKey) ? Date.parse(history.get(a.propertyKey) as string) : null)
          if (lastUsed !== null && Date.parse(slotUtc) - lastUsed < cooldownMs) return false
          return true
        })

        if (!pick) {
          unfilledSlots++
          skipped.push({ connectionId: conn.id, slotUtc, reason: lastReason })
          continue
        }

        usedThisRun.set(pick.propertyKey, Date.parse(slotUtc))
        planned.push({
          connectionId: conn.id,
          agentUserId,
          ownerUserId,
          scheduledAtUtc: slotUtc,
          sourcePostId: pick.postId,
          sourceContentId: pick.sourceContentId,
          propertyKey: pick.propertyKey,
          renderId: pick.renderId as string,
          renderedStoragePath: pick.renderedStoragePath as string,
          renderVersion: pick.renderVersion,
          caption: pick.caption,
          hashtags: pick.hashtags,
          destination: pick.destination ?? (provider === "tiktok" ? "tiktok_video" : "instagram_reel"),
          platform: provider,
        })
      }
    }

    if (unfilledSlots > 0) {
      unfilled.push({ connectionId: conn.id, slots: unfilledSlots, reason: lastReason })
    }
  }

  return { planned, skipped, unfilled }
}

/** Why a given approved post cannot go to a given connection — for reporting, not for control
 *  flow. The plan above asks renderRefusalFor directly. */
export function explainRefusal(a: ApprovedSource, conn: AgentConnection): RenderRefusal | null {
  return renderRefusalFor({
    render: { identityState: a.identityState as never, identityOwnerUserId: a.identityOwnerUserId },
    source: { availableToAgents: a.availableToAgents },
    destination: { connectionId: conn.id, agent_user_id: conn.agent_user_id, owner_user_id: conn.owner_user_id },
  })
}

/**
 * The row an agent's post is created as.
 *
 * approved_at IS SET HERE, and that is the point of the whole phase: the operator approved this
 * content and neither he nor the agent approves it again. It is safe because the two approval
 * triggers are BEFORE UPDATE — a row created approved fires neither — while any later EDIT of
 * this post still drops the approval exactly as they were built to.
 *
 * The artifact is REUSED: render_id and rendered_storage_path are the operator's own, so the
 * agent publishes his exact file, with his music, captions, overlays, positioning and timing.
 * Nothing is re-rendered and nothing of his is modified.
 */
export function rowFor(p: PlannedAgentPost): Record<string, unknown> {
  const nowIso = new Date().toISOString()
  return {
    owner_user_id: p.ownerUserId,
    connection_id: p.connectionId,
    source_content_id: p.sourceContentId,
    platform: p.platform,
    destination: p.destination,
    post_type: p.destination === "instagram_story" ? "story" : "reel",
    caption: p.caption,
    hashtags: p.hashtags,
    render_id: p.renderId,
    rendered_storage_path: p.renderedStoragePath,
    render_version: p.renderVersion,
    render_status: "ready",
    status: "scheduled",
    scheduled_at: p.scheduledAtUtc,
    approved_at: nowIso,
    created_via: "agent_distribution",
    updated_at: nowIso,
  }
}
