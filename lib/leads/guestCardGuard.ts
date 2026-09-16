// Property-specific Guest Card guard — the SHARED policy both the manual Lead
// Board drag and Beast Voice hit (via moveLeadToStage). It protects the locator's
// commission by ensuring a Guest Card was handled FOR THE APPLIED/LEASED PROPERTY
// before a lead advances to Applied or Closed.
//
// Pure + offline: these helpers only read the lead + its already-loaded
// lead_next_actions. They never write, never query, and never decide UI. The
// orchestration (modal, the one timeline lookup for an external confirmation, the
// truthful timeline write, and continuing the move) lives in DashboardClient.
//
// Nothing here fabricates history: "handled" is a COMPLETED per-property
// email_guest_card action, or an agent-confirmed guest_card timeline event for
// that same property — never an assumption from the stage itself.

/** A minimal shape of a lead_next_actions row this guard reads. */
type ActionRow = {
  action_key?: string | null
  property_id?: number | string | null
  completed?: boolean | null
  status?: string | null
}

/** An action is OPEN when it is neither completed nor closed (completed/canceled). */
function isOpen(a: ActionRow): boolean {
  if (a.completed === true) return false
  const s = String(a.status ?? "").toLowerCase()
  return s !== "completed" && s !== "canceled" && s !== "cancelled"
}

const sameProp = (a: number | string | null | undefined, b: number | string | null | undefined) =>
  a != null && b != null && String(a) === String(b)

/**
 * The canonical property the guard protects for a given target stage, using the
 * exact hierarchy from the audit. Returns null when no property is known yet
 * (e.g. a raw jump / friend-referral lead with no Top Pick) — the caller then
 * asks the agent to identify it via the existing Favorites/Top Pick mechanism.
 *
 *   applied → open start_application.property_id
 *           → open check_application.property_id
 *           → lead.top_pick_favorite_id
 *   closed  → open confirm_lease.property_id
 *           → lead.top_pick_favorite_id
 */
export function resolveGuardPropertyId(
  lead: { top_pick_favorite_id?: number | string | null } | null | undefined,
  nextActions: ActionRow[],
  targetStage: "applied" | "closed"
): number | string | null {
  const open = (key: string) =>
    (nextActions ?? []).find((a) => String(a.action_key ?? "") === key && isOpen(a))?.property_id ?? null

  if (targetStage === "applied") {
    const fromApply = open("start_application")
    if (fromApply != null) return fromApply
    const fromCheck = open("check_application")
    if (fromCheck != null) return fromCheck
  } else {
    const fromLease = open("confirm_lease")
    if (fromLease != null) return fromLease
  }
  return lead?.top_pick_favorite_id ?? null
}

/**
 * Is there a COMPLETED Guest Card action for exactly this property? This is the
 * primary "handled" signal and is always available client-side (it lives in the
 * loaded lead_next_actions). A completed card for a DIFFERENT property does not
 * count.
 */
export function hasCompletedGuestCardAction(
  propertyId: number | string,
  nextActions: ActionRow[]
): boolean {
  return (nextActions ?? []).some(
    (a) =>
      String(a.action_key ?? "") === "email_guest_card" &&
      (a.completed === true || String(a.status ?? "").toLowerCase() === "completed") &&
      sameProp(a.property_id, propertyId)
  )
}

/**
 * Combined synchronous "handled" check: a completed per-property Guest Card
 * action, OR a caller-supplied set of property ids the agent has confirmed
 * externally (assembled from the guest_card timeline lookup / session state).
 * The timeline lookup itself is async and lives in the caller, so this stays pure.
 */
export function isGuestCardHandled(
  propertyId: number | string,
  nextActions: ActionRow[],
  confirmedPropertyIds?: Iterable<number | string> | null
): boolean {
  if (hasCompletedGuestCardAction(propertyId, nextActions)) return true
  if (confirmedPropertyIds) {
    for (const id of confirmedPropertyIds) if (sameProp(id, propertyId)) return true
  }
  return false
}

/** The two stages the guard protects. */
export function isGuardedStage(stage: string): stage is "applied" | "closed" {
  return stage === "applied" || stage === "closed"
}
