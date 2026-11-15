// Read live state, compute the agent distribution plan, and — only when asked — apply it.
//
// The split mirrors autopilotPlanRun: planning is pure and lives in agentDistribution.ts, this
// file does the I/O, and the caller chooses "preview" or "persist". Preview reads the same rows
// and runs the same predicate, so a dry run is the real decision stopped one step short of the
// INSERT rather than a simulation of it.
import { supabaseAdmin } from "@/lib/supabase/admin"
import { wallClockToUtcISO, DEFAULT_TIMEZONE } from "@/lib/social/recurrence"
import {
  planAgentDistribution, rowFor, AGENT_QUEUE_DAYS,
  type AgentConnection, type ApprovedSource, type AgentDistributionPlan,
} from "@/lib/social/agentDistribution"

export type RunMode = "preview" | "persist"

export type AgentDistributionResult = {
  mode: RunMode
  plan: AgentDistributionPlan
  inserted: string[]
  rejected: { slotUtc: string; connectionId: string; reason: string }[]
  eligibleSources: number
  agentConnections: number
}

/** Date keys (YYYY-MM-DD in the posting timezone) for the queue window. */
function dateKeysFrom(now: Date, days: number, timezone: string): string[] {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" })
  const out: string[] = []
  for (let i = 0; i < days; i++) out.push(fmt.format(new Date(now.getTime() + i * 86_400_000)))
  return out
}

export async function runAgentDistribution(args: { mode?: RunMode; now?: Date; queueDays?: number } = {}): Promise<AgentDistributionResult> {
  const mode: RunMode = args.mode ?? "preview"
  const now = args.now ?? new Date()
  const queueDays = args.queueDays ?? AGENT_QUEUE_DAYS

  const { data: conns } = await supabaseAdmin
    .from("social_connections")
    .select("id, provider, status, posting_paused, posts_per_day, stagger_offset_minutes, market_restriction, agent_user_id, owner_user_id, token_expires_at")
  const connections = (conns ?? []) as AgentConnection[]

  // ── THE POOL: the operator's APPROVED posts with a finished render. His existing approval is
  // the readiness gate; nothing unapproved is offered, whatever state its render is in.
  const { data: approvedRows } = await supabaseAdmin
    .from("social_posts")
    .select("id, platform, destination, caption, hashtags, overlay_template, render_id, rendered_storage_path, render_version, source_content_id, approved_at, source:source_content_id(place_id, market, available_to_agents), render:render_id(identity_state, identity_owner_user_id)")
    .not("approved_at", "is", null)
    .not("render_id", "is", null)
    .not("rendered_storage_path", "is", null)
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as Record<string, unknown> | null

  const approved: ApprovedSource[] = (approvedRows ?? []).map((r) => {
    const row = r as Record<string, unknown>
    const src = one(row.source)
    const ren = one(row.render)
    return {
      postId: String(row.id),
      sourceContentId: String(row.source_content_id ?? ""),
      // Same property identity the planner uses: place_id when the building is matched, else the
      // content row. Two uploads of one building must share a cooldown.
      propertyKey: String((src?.place_id as string | null) ?? row.source_content_id ?? ""),
      market: (src?.market as string | null) ?? null,
      destination: (row.destination as string | null) ?? null,
      platform: (row.platform as string | null) ?? null,
      caption: (row.caption as string | null) ?? null,
      hashtags: (row.hashtags as string[] | null) ?? null,
      overlayTemplate: (row.overlay_template as string | null) ?? null,
      renderId: (row.render_id as string | null) ?? null,
      renderedStoragePath: (row.rendered_storage_path as string | null) ?? null,
      renderVersion: typeof row.render_version === "number" ? row.render_version : null,
      identityState: (ren?.identity_state as string | null) ?? null,
      identityOwnerUserId: (ren?.identity_owner_user_id as string | null) ?? null,
      availableToAgents: (src?.available_to_agents as boolean | null) ?? null,
    }
  })

  // ── WHAT IS ALREADY ON EACH AGENT'S CALENDAR. This is what makes a second run a no-op.
  const { data: taken } = await supabaseAdmin
    .from("social_posts")
    .select("connection_id, scheduled_at")
    .not("connection_id", "is", null)
    .not("scheduled_at", "is", null)
  const takenByConnection = new Map<string, Set<string>>()
  for (const t of (taken ?? []) as { connection_id: string; scheduled_at: string }[]) {
    const key = new Date(t.scheduled_at).toISOString()
    const set = takenByConnection.get(t.connection_id) ?? new Set<string>()
    set.add(key)
    takenByConnection.set(t.connection_id, set)
  }

  // ── COOLDOWN HISTORY: when each connection last used each property.
  const { data: hist } = await supabaseAdmin
    .from("social_posts")
    .select("connection_id, scheduled_at, published_at, source_content_id, source:source_content_id(place_id)")
    .not("connection_id", "is", null)
  const historyByConnection = new Map<string, Map<string, string>>()
  for (const h of (hist ?? []) as Record<string, unknown>[]) {
    const cid = String(h.connection_id)
    const src = one(h.source)
    const key = String((src?.place_id as string | null) ?? h.source_content_id ?? "")
    const when = (h.published_at as string | null) ?? (h.scheduled_at as string | null)
    if (!key || !when) continue
    const m = historyByConnection.get(cid) ?? new Map<string, string>()
    const prev = m.get(key)
    if (!prev || Date.parse(when) > Date.parse(prev)) m.set(key, when)
    historyByConnection.set(cid, m)
  }

  const plan = planAgentDistribution({
    connections, approved, takenByConnection, historyByConnection,
    now, timezone: DEFAULT_TIMEZONE,
    dateKeys: dateKeysFrom(now, queueDays, DEFAULT_TIMEZONE),
    resolveSlot: wallClockToUtcISO,
    queueDays,
  })

  const inserted: string[] = []
  const rejected: AgentDistributionResult["rejected"] = []
  if (mode === "persist") {
    for (const p of plan.planned) {
      const { data, error } = await supabaseAdmin.from("social_posts").insert(rowFor(p)).select("id").maybeSingle()
      if (error || !data) {
        // 23505 is the (connection_id, scheduled_at) unique index doing its job — another run, or
        // another worker, already filled this slot. Reported, never retried into a duplicate.
        rejected.push({ slotUtc: p.scheduledAtUtc, connectionId: p.connectionId, reason: error?.code === "23505" ? "slot_taken" : (error?.message ?? "insert_failed").slice(0, 160) })
        continue
      }
      inserted.push(String((data as { id: string }).id))
    }
  }

  return { mode, plan, inserted, rejected, eligibleSources: approved.length, agentConnections: connections.filter((c) => c.agent_user_id && c.agent_user_id !== c.owner_user_id).length }
}
