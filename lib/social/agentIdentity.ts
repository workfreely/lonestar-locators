// WHAT MAKES A CONNECTION AN EXTERNAL AGENT'S — one definition, used everywhere.
//
// ── THE BUG THIS EXISTS TO PREVENT ──────────────────────────────────────────────────────────
// The obvious test is `agent_user_id IS NOT NULL`. It is WRONG, and production says so: the
// admin's own Instagram connection (realestatepro_tx) carries agent_user_id = owner_user_id,
// self-assigned when the invite flow was run against his own account. Under the naive test, 8 of
// the admin's own published posts classify as "agent-owned" — so the unconditional agent
// publishing hold would have been applied to the admin's queue, which is exactly the behaviour
// change that was ruled out.
//
//   naive  (agent_user_id IS NOT NULL)                     -> 8 posts   WRONG
//   true   (… AND agent_user_id <> owner_user_id)          -> 0 posts   RIGHT
//
// ── THIS IS A CLASSIFIER, NOT A KEY TO THE DOOR ─────────────────────────────────────────────
// Being an external agent connection does NOT grant anyone access to anything. Access is decided
// by requireSocialAgent: an authenticated session, membership of the server-side beta allowlist,
// and ownership of the specific connection being acted on. This module answers a different
// question — "do the external-agent safeguards apply to this row?" — and is used to switch
// protections ON, never to let anybody in.
//
// Keep the SQL and the TypeScript in step. Both are stated here so a reader can see they agree.

/** The SQL predicate, for policies and migrations. `c` is a social_connections alias. */
export const EXTERNAL_AGENT_SQL =
  "(c.agent_user_id is not null and c.agent_user_id <> c.owner_user_id)"

export type ConnectionIdentity = {
  agent_user_id?: string | null
  owner_user_id?: string | null
}

/**
 * Is this connection delegated to someone OTHER than the owner?
 *
 * A connection whose agent is its own owner is the owner's personal account wearing an agent
 * label, not a delegated one, and must keep the owner's behaviour.
 */
export function isExternalAgentConnection(c: ConnectionIdentity | null | undefined): boolean {
  const agent = c?.agent_user_id
  const owner = c?.owner_user_id
  if (!agent || !owner) return false
  return agent !== owner
}

/**
 * Do the external-agent publishing safeguards apply to this post?
 *
 * Takes the post's JOINED connection, because a post alone cannot answer it — the distinction
 * lives entirely on the connection row. A post with no connection is unassigned admin work and is
 * never agent-owned.
 */
export function isAgentOwnedPost(
  post: { connection_id?: string | null } | null | undefined,
  connection: ConnectionIdentity | null | undefined,
): boolean {
  if (!post?.connection_id) return false
  return isExternalAgentConnection(connection)
}
