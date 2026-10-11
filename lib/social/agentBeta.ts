// SOCIAL BEAST — AGENT BETA ALLOWLIST.
//
// ONE question: is this authenticated user allowed into the agent experience at all? It is asked
// before anything else, on the server, in every agent route. Failing it is a 403 — not an empty
// list, not a hidden nav item.
//
// ── WHY AN ENV ALLOWLIST AND NOT A DATABASE FLAG ────────────────────────────────────────────
// A column would be editable by anything holding a service-role key, and the beta's whole point is
// that exactly one named account can reach it. An env var is changed deliberately, by a person,
// in the Vercel dashboard, and its current value is visible in one place.
//
// EMPTY BY DEFAULT, so merging this code enables the beta for NOBODY. The feature does not exist
// until an id is added to the variable. That is also what makes stage 1 safe to ship ahead of the
// interface: every route below is live and every route refuses everyone.
//
// The beta account is Sarah Mitchell, workingfreely@gmail.com, user id
// 23ebb70e-2567-4c87-aacd-f58d3594dc09 — verified against public.profiles, and NOT a platform
// admin, which is what makes her a real test of the agent boundary rather than an admin in
// disguise. Her id is deliberately NOT hardcoded here: identity belongs in configuration, the same
// rule platform_admins follows.
export const AGENT_BETA_FLAG = "SOCIAL_AGENT_BETA_USER_IDS"

/** Parse the allowlist. Comma or whitespace separated; blank entries ignored. */
export function agentBetaUserIds(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env[AGENT_BETA_FLAG] ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Is this user in the beta?
 *
 * Exact string match on the auth user id. No prefixes, no wildcards, no "*" escape hatch — a
 * wildcard in an allowlist is how an allowlist stops being one.
 */
export function isAgentBetaUser(userId: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!userId) return false
  return agentBetaUserIds(env).includes(userId)
}
