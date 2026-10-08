// AUTOPILOT WRITE PATH — turn a plan into claimed rows, or describe what it would claim.
//
// DRY RUN IS THE DEFAULT, and not by convention: `persist` must be passed explicitly, and the
// executor that can actually write is a separate argument. Calling this with no executor cannot
// write, whatever the mode says.
//
// DRY RUN AND PERSIST SHARE ONE CODE PATH. buildClaims() produces the claim list; persist only adds
// an execution step. The dry run is therefore not a simulation of the write — it is the write,
// stopped one step short. A dry run that disagrees with the persisted result would mean the shared
// function returned different claims for identical input, which the parity tests assert it cannot.
//
// CONCURRENCY IS THE DATABASE'S JOB, NOT THIS MODULE'S. Two protections, both server-side, because
// this process may not be the only writer:
//
//   1. THE POST — a conditional UPDATE. Every eligibility column is in the WHERE clause, so the
//      claim only lands if the row is STILL eligible at write time. Two racing claims both issue
//      it; the first flips the row, the second matches zero rows and is reported as lost. There is
//      no read-then-write window to lose.
//   2. THE SLOT — the partial unique index on (connection_id, scheduled_at) from migration
//      20261007000004. If two connections-worth of work somehow target one destination minute, the
//      loser gets 23505 and is reported, not silently dropped.
//
// Re-checking eligibility in SQL rather than trusting the plan matters because a plan is a snapshot.
// Between planning and writing, a post can be rendered over, published manually, or claimed by
// another operator. The WHERE clause is the same predicate as ineligibleReason, which is applied
// again in memory first — belt and braces, since a column the filter forgets is invisible.
import { ineligibleReason, type EligibilityInput, type Ineligible } from "@/lib/social/autopilotEligibility"
import type { AutopilotPlan, PlannedPost } from "@/lib/social/autopilotPlanner"

/** Explicit, and the default everywhere it is optional. */
export type WriteMode = "dry_run" | "persist"
export const DEFAULT_WRITE_MODE: WriteMode = "dry_run"

/**
 * One claim, fully resolved. This is the ONLY description of a write in this module: the dry run
 * returns these and stops; persist hands these to the executor. Nothing is recomputed in between.
 */
export type Claim = {
  postId: string
  /** Always set. A claim without a destination is not representable. */
  connectionId: string
  scheduledAtUtc: string
  /** Carried for reporting only — never written. */
  dateKey: string
  minute: number
  market: string | null
  propertyName: string | null
  sourceContentId: string
}

export type ClaimRejection =
  /** The row no longer matched the eligibility predicate at write time (another writer won it). */
  | { kind: "post_lost"; claim: Claim }
  /** The destination slot was already taken — the unique index rejected it. */
  | { kind: "slot_taken"; claim: Claim }
  /** Rejected before any write was attempted, by the in-memory predicate. */
  | { kind: "ineligible"; claim: Claim; reason: Ineligible }
  /** Anything else the database said. Never swallowed. */
  | { kind: "error"; claim: Claim; message: string }

export type WritePlan = {
  mode: WriteMode
  /** What this call would claim, in deterministic order. */
  claims: Claim[]
  /** Rejected by the in-memory predicate before any write. */
  preRejected: ClaimRejection[]
  /** Inventory shortfalls carried through from the planner, so a caller sees them in one place. */
  inventory: {
    sufficient: boolean
    poolSize: number
    requiredPoolSize: number
    unfilledSlots: number
    /** Human-readable, deliberately explicit rather than a bare boolean. */
    summary: string
  }
}

export type WriteResult = WritePlan & {
  /** Empty for a dry run, always. */
  claimed: Claim[]
  rejected: ClaimRejection[]
  /** True only when persist ran AND every attempted claim landed. */
  complete: boolean
}

/** What the executor is asked to do. Deliberately narrow: it cannot express anything but a claim. */
export type ClaimRequest = {
  postId: string
  connectionId: string
  scheduledAtUtc: string
  /** The eligibility columns the UPDATE must re-assert. Passed explicitly so the executor cannot
   *  quietly relax them — a test double and the real client are held to the same contract. */
  requireStatus: "ready"
  requireNullColumns: readonly ("scheduled_at" | "connection_id" | "published_at" | "external_post_id")[]
  requireRenderStatus: "ready"
  requireRenderedArtifact: true
}

export type ClaimExecResult =
  | { ok: true }
  | { ok: false; reason: "no_match" }      // conditional UPDATE matched 0 rows
  | { ok: false; reason: "slot_taken" }    // 23505 on the unique index
  | { ok: false; reason: "error"; message: string }

export type ClaimExecutor = (req: ClaimRequest) => Promise<ClaimExecResult>

/** The eligibility columns every claim re-asserts. One list, used by the request and the real SQL. */
export const CLAIM_REQUIRED_NULLS = ["scheduled_at", "connection_id", "published_at", "external_post_id"] as const

const requestFor = (c: Claim): ClaimRequest => ({
  postId: c.postId,
  connectionId: c.connectionId,
  scheduledAtUtc: c.scheduledAtUtc,
  requireStatus: "ready",
  requireNullColumns: CLAIM_REQUIRED_NULLS,
  requireRenderStatus: "ready",
  requireRenderedArtifact: true,
})

/**
 * Turn a plan into claims. PURE — no I/O, no clock, no randomness.
 *
 * `current` is the post's state as last read, re-checked here so an obviously-stale plan is rejected
 * before it reaches the database. The SQL re-check still runs; this one produces a better reason.
 */
export function buildClaims(
  plan: Pick<AutopilotPlan, "planned" | "sufficient" | "poolSize" | "requiredPoolSize" | "unfilledSlots">,
  current: ReadonlyMap<string, EligibilityInput>,
  platform = "instagram",
): { claims: Claim[]; preRejected: ClaimRejection[] } {
  const claims: Claim[] = []
  const preRejected: ClaimRejection[] = []

  // Deterministic order: by time, then connection, then post. Two runs over one plan issue their
  // writes in the same sequence, which makes a concurrency failure reproducible instead of flaky.
  const ordered = [...plan.planned].sort((a, b) =>
    a.scheduledAtUtc < b.scheduledAtUtc ? -1 : a.scheduledAtUtc > b.scheduledAtUtc ? 1
    : a.connectionId < b.connectionId ? -1 : a.connectionId > b.connectionId ? 1
    : a.postId < b.postId ? -1 : a.postId > b.postId ? 1 : 0)

  // A plan should never contain two posts for one destination minute, nor one post twice. If it
  // does, that is a planner bug and the database would catch it — but catching it here names the
  // duplicate instead of surfacing an opaque 23505.
  const seenSlot = new Set<string>()
  const seenPost = new Set<string>()

  for (const p of ordered) {
    const claim = toClaim(p)
    const state = current.get(p.postId)

    if (!state) {
      preRejected.push({ kind: "error", claim, message: "post state not loaded — refusing to claim unverified row" })
      continue
    }
    const why = ineligibleReason(state, platform)
    if (why) { preRejected.push({ kind: "ineligible", claim, reason: why }); continue }

    const slotKey = `${p.connectionId}@${p.scheduledAtUtc}`
    if (seenSlot.has(slotKey)) { preRejected.push({ kind: "slot_taken", claim }); continue }
    if (seenPost.has(p.postId)) { preRejected.push({ kind: "post_lost", claim }); continue }

    seenSlot.add(slotKey); seenPost.add(p.postId)
    claims.push(claim)
  }
  return { claims, preRejected }
}

function toClaim(p: PlannedPost): Claim {
  return {
    postId: p.postId, connectionId: p.connectionId, scheduledAtUtc: p.scheduledAtUtc,
    dateKey: p.dateKey, minute: p.minute, market: p.market,
    propertyName: p.propertyName, sourceContentId: p.sourceContentId,
  }
}

function inventoryOf(plan: Pick<AutopilotPlan, "sufficient" | "poolSize" | "requiredPoolSize" | "unfilledSlots">) {
  // Spelled out rather than left as a boolean: "insufficient inventory" is the single most likely
  // reason a run does less than expected, and it must be impossible to mistake for success.
  const summary = plan.sufficient
    ? `inventory sufficient — ${plan.poolSize} eligible post(s) for ${plan.requiredPoolSize} slot(s)`
    : `INSUFFICIENT INVENTORY — ${plan.poolSize} eligible post(s) for ${plan.requiredPoolSize} slot(s); `
      + `${plan.unfilledSlots} slot(s) cannot be filled. Render more inventory before scheduling.`
  return {
    sufficient: plan.sufficient, poolSize: plan.poolSize,
    requiredPoolSize: plan.requiredPoolSize, unfilledSlots: plan.unfilledSlots, summary,
  }
}

/**
 * The entry point.
 *
 * Mode defaults to dry_run. Persist additionally requires an executor: asking to persist without
 * one THROWS rather than silently degrading to a dry run, because a caller that believes it wrote
 * and did not is worse than a crash.
 */
export async function applyAutopilotPlan(input: {
  plan: Pick<AutopilotPlan, "planned" | "sufficient" | "poolSize" | "requiredPoolSize" | "unfilledSlots">
  current: ReadonlyMap<string, EligibilityInput>
  mode?: WriteMode
  executor?: ClaimExecutor
  platform?: string
}): Promise<WriteResult> {
  const mode = input.mode ?? DEFAULT_WRITE_MODE
  const { claims, preRejected } = buildClaims(input.plan, input.current, input.platform ?? "instagram")
  const base: WritePlan = { mode, claims, preRejected, inventory: inventoryOf(input.plan) }

  if (mode !== "persist") {
    return { ...base, claimed: [], rejected: [], complete: false }
  }
  if (!input.executor) {
    throw new Error("applyAutopilotPlan: mode 'persist' requires an executor — refusing to report a write that did not happen")
  }

  const claimed: Claim[] = []
  const rejected: ClaimRejection[] = [...preRejected]
  // SEQUENTIAL, deliberately. Parallel claims would race each other for the same slots and turn a
  // deterministic plan into an order-dependent one. The database would still be correct; the REPORT
  // would not be reproducible, and this runs rarely enough that the wall-clock cost is irrelevant.
  for (const claim of claims) {
    let res: ClaimExecResult
    try {
      res = await input.executor(requestFor(claim))
    } catch (e) {
      rejected.push({ kind: "error", claim, message: (e as Error).message }); continue
    }
    if (res.ok) { claimed.push(claim); continue }
    if (res.reason === "no_match") rejected.push({ kind: "post_lost", claim })
    else if (res.reason === "slot_taken") rejected.push({ kind: "slot_taken", claim })
    else rejected.push({ kind: "error", claim, message: res.message })
  }
  return { ...base, claimed, rejected, complete: rejected.length === 0 && claimed.length === claims.length }
}

/**
 * The real executor, over a Supabase-shaped client.
 *
 * Every eligibility column is in the WHERE clause. That is what makes this safe to run concurrently
 * with anything else that touches social_posts, including the publish worker — the row is claimed
 * only if it is still exactly the row the plan chose.
 *
 * Passing `supabaseAdmin` is required: social_posts writes through an RLS client can affect zero
 * rows and still return 200, which here would read as "another writer won" and silently under-fill
 * the schedule.
 */
export function supabaseClaimExecutor(client: SupabaseLike): ClaimExecutor {
  return async (req) => {
    const q = client
      .from("social_posts")
      // updated_at is set EXPLICITLY. social_posts has no trigger maintaining it — every other
      // writer in the codebase stamps it by hand, and a claim that skipped it would leave a freshly
      // scheduled row looking untouched since its last edit.
      .update({ scheduled_at: req.scheduledAtUtc, connection_id: req.connectionId, status: "scheduled", updated_at: new Date().toISOString() })
      .eq("id", req.postId)
      .eq("status", req.requireStatus)
      .eq("render_status", req.requireRenderStatus)
      .not("rendered_storage_path", "is", null)
    for (const col of req.requireNullColumns) q.is(col, null)

    const { data, error } = await q.select("id")
    if (error) {
      // 23505 is the destination-slot index; 23514 is the regression trigger. Both are expected
      // outcomes of a race, not faults, so they are classified rather than thrown.
      const code = (error as { code?: string }).code
      if (code === "23505") return { ok: false, reason: "slot_taken" }
      return { ok: false, reason: "error", message: `${code ?? "?"}: ${error.message}` }
    }
    return (data?.length ?? 0) > 0 ? { ok: true } : { ok: false, reason: "no_match" }
  }
}

/** The minimum of the Supabase client this module uses — kept local so tests need no SDK. */
export type SupabaseLike = {
  from: (t: string) => {
    update: (v: Record<string, unknown>) => {
      eq: (c: string, v: unknown) => QueryChain
    }
  }
}
type QueryChain = {
  eq: (c: string, v: unknown) => QueryChain
  is: (c: string, v: unknown) => QueryChain
  // `op` is the literal "is", not a general string: the Supabase builder's overloads narrow it, and
  // a widened signature here makes the real client fail to satisfy this type.
  not: (c: string, op: "is", v: null) => QueryChain
  // PromiseLike, not Promise: the Supabase builder is a thenable that only becomes a real Promise
  // when awaited, so requiring .catch/.finally here would reject the actual client.
  select: (cols: string) => PromiseLike<{ data: { id: string }[] | null; error: { message: string; code?: string } | null }>
}
