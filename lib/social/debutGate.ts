// THE FIRST VIDEO — one creative that must publish before anything else reaches an account.
//
// ── THE REQUIREMENT, AND WHY A PRIORITY FLAG DOES NOT MEET IT ───────────────────────────────
// "This must be the first video published on BOTH of her accounts" is two claims, not one:
//
//   1. it goes FIRST — the earliest slot on each account;
//   2. nothing else goes BEFORE it — not merely "it is scheduled earliest".
//
// A priority score only does (1). The moment the first attempt fails, the queue behind it moves
// up, and the second video becomes the first published — which is exactly the outcome being ruled
// out, and it would be discovered afterwards from a live account. So this is a GATE, not a sort
// key: until the debut is satisfied, nothing else may publish on those destinations at all.
//
// ── SATISFIED MEANS PUBLISHED, ON EVERY DESTINATION, NOT SENT ───────────────────────────────
// A pair publishes to two accounts independently (lib/social/mirroredSchedule.ts). The debut is
// satisfied only when a post of that content has reached status 'published' on EVERY one of that
// agent's destinations. One of two is not "mostly satisfied":
//
//   Instagram published, TikTok failed  ->  NOT satisfied  ->  regular content stays held
//
// and the already-published Instagram post is terminal — status 'published' with an
// external_post_id — so every eligibility predicate in the system excludes it and nothing can
// publish it a second time while its sibling is retried. That is the partial-failure requirement,
// and it needs no new mechanism: it falls out of holding the rest and of the row being terminal.
//
// ── RELEASE IS AN EXPLICIT HUMAN ACT ────────────────────────────────────────────────────────
// Nothing here times out, retries past a limit, or decides on its own that a stuck debut has gone
// on long enough. The hold ends when the debut publishes everywhere, or when the operator clears
// social_content.debut_for_agent_user_id — one deliberate statement, which is what "or I
// explicitly approve proceeding" means. A gate that releases itself is not a gate.
//
// Pure: no I/O. The caller supplies which destinations exist and where the debut has published.
import { assignedTo, type ContentOwnership } from "@/lib/social/personalOwnership"

const trimmed = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : ""
  return s ? s : null
}

export type DebutContent = ContentOwnership & {
  id?: string | null
  /** social_content.debut_for_agent_user_id — the agent whose account this must open. */
  debutForAgentUserId?: string | null
}

/** The agent this content is the debut for, or null. */
export function debutAgentOf(content: DebutContent | null | undefined): string | null {
  return trimmed(content?.debutForAgentUserId)
}

export type DebutState =
  /** This agent has no outstanding first-video requirement — the ordinary case, and the state of
   *  every agent until the operator designates one. */
  | { required: false }
  | {
      required: true
      contentId: string
      satisfied: boolean
      /** Destinations where the debut has published. */
      publishedOn: string[]
      /** Destinations still waiting for it. Empty exactly when satisfied. */
      pending: string[]
    }

/**
 * Where this agent's first-video requirement stands.
 *
 * `destinations` is every destination belonging to the agent — ALL of them, including ones that
 * are paused. A paused destination is deliberately still counted: "first on both accounts" is a
 * statement about the accounts, and silently satisfying the gate because one of them was switched
 * off is the kind of convenience that produces a surprise later. If the operator genuinely means
 * one account, the honest action is to clear the debut.
 *
 * NO DESTINATIONS AT ALL ⇒ NOT satisfied. A debut that has published nowhere cannot be complete,
 * and returning "satisfied" for an agent with no connected accounts would release the hold at
 * exactly the moment there is nothing to prove.
 */
export function debutStateFor(input: {
  contentId: string | null | undefined
  destinationConnectionIds: readonly string[]
  /** Connections where a post of that content has reached 'published'. */
  publishedConnectionIds: readonly string[]
}): DebutState {
  const contentId = trimmed(input.contentId)
  if (!contentId) return { required: false }

  const all = [...new Set(input.destinationConnectionIds.map((c) => trimmed(c)).filter((c): c is string => !!c))].sort()
  const done = new Set(input.publishedConnectionIds.map((c) => trimmed(c)).filter((c): c is string => !!c))
  const publishedOn = all.filter((c) => done.has(c))
  const pending = all.filter((c) => !done.has(c))
  return {
    required: true,
    contentId,
    satisfied: all.length > 0 && pending.length === 0,
    publishedOn,
    pending,
  }
}

export type DebutRefusal = "debut_pending"

export const DEBUT_REFUSAL_MESSAGE =
  "held: this account's first video has not published on every one of its destinations yet"

/**
 * May this post publish, given the agent's debut state?
 *
 * The debut content itself is always allowed — it is the thing being waited for. Everything else
 * is refused while the debut is outstanding.
 *
 * This is a HOLD, not a failure: the caller leaves the row scheduled and tries again next run,
 * exactly as it treats an unreadable credential. Failing the row instead would consume the slot
 * and need a human to put it back, for a condition that resolves on its own the moment the debut
 * lands.
 */
export function debutRefusalFor(
  state: DebutState,
  postContentId: string | null | undefined,
): DebutRefusal | null {
  if (!state.required || state.satisfied) return null
  return trimmed(postContentId) === state.contentId ? null : "debut_pending"
}

/**
 * Is this debut designation coherent?
 *
 * A debut that is also an ASSIGNED personal video must be assigned to the same person: a video
 * reserved for Lisette cannot be the first video on the operator's account, because it may not
 * publish there at all. Reported rather than corrected — the operator chose both values and the
 * fix is theirs to pick.
 */
export function debutMismatch(content: DebutContent | null | undefined): "debut_for_another_person" | null {
  const debut = debutAgentOf(content)
  if (!debut) return null
  const owner = content?.personalAgentUserId
  if (!trimmed(owner)) return null
  return assignedTo(content, debut) ? null : "debut_for_another_person"
}
