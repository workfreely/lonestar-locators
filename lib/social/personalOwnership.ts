// WHOSE VIDEO IS THIS? — the Personal checkbox, extended from two states to three.
//
// ── WHAT EXISTS TODAY, AND WHY IT IS NOT ENOUGH ─────────────────────────────────────────────
// The operator's "Personal — Only Me" checkbox is stored INVERTED in social_content
// .available_to_agents, and renderAuthorization refuses a Personal video at an EXTERNAL AGENT's
// destination. Two states:
//
//   available_to_agents = true    general apartment content — any destination may carry it
//   available_to_agents = false   Personal — only the operator's own accounts
//
// That cannot express "Lisette — Personal". Marking her video Personal under today's rule makes it
// the OPERATOR's — refused at her account, allowed at his. Exactly backwards.
//
// ── THE THIRD STATE, AS ONE NULLABLE COLUMN ─────────────────────────────────────────────────
// social_content.personal_agent_user_id names WHOSE personal video it is. It is only ever read
// alongside the existing column, never instead of it:
//
//   available_to_agents  personal_agent_user_id   meaning
//   ───────────────────  ──────────────────────   ─────────────────────────────────────────────
//   true                 null                     general apartment content        (today)
//   false                null                     the OPERATOR's personal video    (today)
//   false                <uuid>                   that person's personal video     (new)
//
// Every row in production is one of the first two, because the column does not exist yet and the
// absent value reads as null. So nothing the operator has today changes meaning — which is the
// requirement, and is asserted rather than claimed (scripts/social/personalOwnership.test.ts).
//
// ── THE ONE THING THIS ADDS THAT THE OLD RULE COULD NOT DO ──────────────────────────────────
// Today's refusal only fires at an EXTERNAL agent's destination; the operator's own accounts are
// let through before it is asked. An assigned personal video has to be refused in BOTH directions
// — her video must not reach his queue any more than his reaches hers — so this predicate is
// deliberately asked OUTSIDE that branch. It is the only rule here that can refuse at the
// operator's own destination, and it can only do so for a row that names someone else, which no
// row does until the operator assigns one.
//
// ── IT ONLY EVER REFUSES ────────────────────────────────────────────────────────────────────
// Same discipline as renderAuthorization, which this feeds: nothing here grants access. An
// unassigned video is governed exactly as it is today, by available_to_agents and the identity
// rules. Pure — no I/O, so every rule is testable with no database.
import { effectiveAgent, type ConnectionIdentity } from "@/lib/social/agentIdentity"

/** A destination, as this module needs it: whose account it is, and whether the post has one
 *  yet. renderAuthorization's own Destination type satisfies it. */
export type AssignmentDestination = ConnectionIdentity & { connectionId?: string | null }

export type ContentOwnership = {
  /** social_content.available_to_agents — the existing sharing decision. */
  availableToAgents?: boolean | null
  /**
   * social_content.personal_agent_user_id — WHOSE personal video this is.
   *
   * Optional on the type, deliberately: every caller that predates the column passes an object
   * without it, which reads as null and leaves that caller's behaviour untouched.
   */
  personalAgentUserId?: string | null
}

const trimmed = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : ""
  return s ? s : null
}

/** The person this video is reserved for, or null when it is reserved for nobody in particular. */
export function personalOwnerOf(content: ContentOwnership | null | undefined): string | null {
  return trimmed(content?.personalAgentUserId)
}

/** Is this an assigned personal video — one reserved for a named person's accounts? */
export function isAssignedPersonal(content: ContentOwnership | null | undefined): boolean {
  return personalOwnerOf(content) !== null
}

/**
 * Which of the three states this row is in. Named so a UI, a report and a test can all say the
 * same thing about a row rather than each re-deriving it from two columns.
 */
export type OwnershipKind = "general" | "operator_personal" | "assigned_personal"

export function ownershipKindOf(content: ContentOwnership | null | undefined): OwnershipKind {
  if (isAssignedPersonal(content)) return "assigned_personal"
  return content?.availableToAgents === true ? "general" : "operator_personal"
}

/**
 * Is this row assigned to THIS person specifically?
 *
 * The one primitive the rest of the module is written in terms of, so "assigned to her" means the
 * same thing to the planner (which holds an agent id) and to the publishers (which hold a
 * destination). An unassigned row is never "assigned to" anybody, including the operator.
 */
export function assignedTo(
  content: ContentOwnership | null | undefined,
  agentUserId: string | null | undefined,
): boolean {
  const owner = personalOwnerOf(content)
  return owner !== null && trimmed(agentUserId) === owner
}

export type PersonalRefusal = "personal_other_agent"

/**
 * May this content reach this destination, as far as personal ASSIGNMENT is concerned?
 *
 * Returns a reason only for an assigned video at a destination that is not its person's. Null for
 * everything else, including every unassigned row — so this predicate is silent on the whole of
 * today's library and the existing rules continue to decide those on their own.
 *
 * A post with no destination yet has no question to answer, matching renderRefusalFor's own
 * position on the unassigned case.
 */
export function personalAssignmentRefusal(
  content: ContentOwnership | null | undefined,
  destination: AssignmentDestination | null | undefined,
): PersonalRefusal | null {
  const owner = personalOwnerOf(content)
  if (!owner) return null
  if (!destination?.connectionId) return null
  return effectiveAgent(destination) === owner ? null : "personal_other_agent"
}

/**
 * IS THE MARKET RESTRICTION WAIVED FOR THIS ROW AT THIS DESTINATION?
 *
 * A market restriction exists to keep a destination's feed inside its markets. An assigned
 * personal video has no market to be inside — it is a person, not a property — and refusing it
 * for that reason would make "Lisette — Personal" unpublishable on the only accounts it is
 * allowed to reach.
 *
 * SO THE WAIVER IS AS NARROW AS IT CAN BE, and each condition carries its weight:
 *
 *   • the row must name a person (an unassigned row is never waived, so the restriction is
 *     unchanged for the entire existing library);
 *   • that person must be THIS destination's own effective agent (so a waiver can never carry a
 *     video onto somebody else's account — the refusal above has already settled that, and this
 *     asks the same question again rather than trusting the order of two checks);
 *   • it waives the MARKET only. Approval, rendering, identity, the publishing gates, the
 *     per-destination pause and the owner-wide switch are all untouched and all still apply.
 *
 * It is a predicate, not an action: a caller that never asks keeps enforcing the restriction on
 * everything, which is what every caller does today.
 */
export function marketRestrictionWaived(
  content: ContentOwnership | null | undefined,
  destination: AssignmentDestination | null | undefined,
): boolean {
  const owner = personalOwnerOf(content)
  if (!owner) return false
  if (!destination?.connectionId) return false
  return assignedTo(content, effectiveAgent(destination))
}

/**
 * The reverse question, for the PLANNER — which has no single destination in hand when it filters
 * a pool, only the rule it is filtering for.
 *
 * `agentUserId` is the destination's effective agent (agent_user_id, falling back to the owner).
 * Returns true when this row may be offered to that agent at all:
 *
 *   unassigned  → true, decided elsewhere exactly as today
 *   assigned    → only to the person it names
 */
export function mayOfferToAgent(
  content: ContentOwnership | null | undefined,
  agentUserId: string | null | undefined,
): boolean {
  if (!isAssignedPersonal(content)) return true
  return assignedTo(content, agentUserId)
}
