// Applied-flow guest-card reconciliation — the PURE decisions behind the Applied
// guard's "Yes, the guest card was sent" path. No I/O: DashboardClient executes the
// returned plan using the EXISTING canonical completion semantics (the same
// completed-action write handleGuestCardSent uses, and createGuestCardForProperty for
// creation). This exists so the decision is unit-testable and never diverges into a
// parallel guest-card completion system.
//
// Why a completion (not just the timeline event) is required: the Companion/CRM Last
// Action is derived ONLY from completed lead_next_actions (deriveLastAction). "Guest
// Card Sent" is the completed-state label of a completed `email_guest_card` action.
// Answering Yes must therefore reconcile that action — complete an existing open one,
// or create-then-complete one when none exists for the applied property — so the lead
// reads: Guest Card Sent (completed) -> Check App (next). The guest_card timeline event
// is kept separately by the caller as the guard's persistent "handled" signal.

type ActionRow = {
  id?: number | string | null
  action_key?: string | null
  property_id?: number | string | null
  completed?: boolean | null
  status?: string | null
}

const sameProp = (a: number | string | null | undefined, b: number | string | null | undefined) =>
  a != null && b != null && String(a) === String(b)

const isDone = (a: ActionRow) => a.completed === true || String(a.status ?? "").toLowerCase() === "completed"
const isCanceled = (a: ActionRow) => {
  const s = String(a.status ?? "").toLowerCase()
  return s === "canceled" || s === "cancelled"
}
const isOpen = (a: ActionRow) => !isDone(a) && !isCanceled(a)

/** How to reconcile the applied property's guest card into a COMPLETED state. */
export type GuestCardSentPlan =
  // An open email_guest_card exists for this property -> complete THIS row.
  | { action: "complete"; actionId: number | string }
  // No email_guest_card exists for this property -> create one, then complete it.
  | { action: "create-complete" }
  // A completed email_guest_card already exists for this property -> nothing to do
  // (never record the same Guest Card Sent twice).
  | { action: "noop" }

/**
 * Decide how to record "guest card sent" for the applied property, scoped to that
 * property only (never another property's card). Prefers reconciling an existing open
 * action; only creates when the property has no email_guest_card at all.
 */
export function planGuestCardSent(propertyId: number | string, actions: ActionRow[]): GuestCardSentPlan {
  const rows = (actions ?? []).filter(
    (a) => String(a.action_key ?? "") === "email_guest_card" && sameProp(a.property_id, propertyId),
  )
  if (rows.some(isDone)) return { action: "noop" }
  const open = rows.find(isOpen)
  if (open && open.id != null) return { action: "complete", actionId: open.id }
  return { action: "create-complete" }
}

/** How the applied property is recorded on the canonical property-scoped action. */
export type CheckAppPlan =
  // An open start_application/check_application already exists -> stamp its property
  // (no new row) so Check App is never duplicated.
  | { action: "stamp"; actionId: number | string; actionKey: string }
  // Nothing open for the applied stage -> create the property-scoped Check App.
  | { action: "create" }
  // Closed stage owns confirm_lease elsewhere -> create nothing here.
  | { action: "noop" }

/**
 * SPEC MIRROR of DashboardClient.ensureAppliedPropertyAction (the shipped A+B Check App
 * association). Kept pure so the "existing Check App -> no duplicate" contract is
 * regression-tested. Behavior: an open start_application wins, else an open
 * check_application, else (applied) create one, else (closed) create nothing.
 */
export function planCheckAppAssociation(
  propertyId: number | string,
  actions: ActionRow[],
  targetStage: "applied" | "closed",
): CheckAppPlan {
  void propertyId // the association stamps whichever open action exists; property scope is applied by the caller
  const openOf = (key: string) => (actions ?? []).find((a) => String(a.action_key ?? "") === key && isOpen(a))
  const openApply = openOf("start_application")
  if (openApply && openApply.id != null) return { action: "stamp", actionId: openApply.id, actionKey: "start_application" }
  const openCheck = openOf("check_application")
  if (openCheck && openCheck.id != null) return { action: "stamp", actionId: openCheck.id, actionKey: "check_application" }
  if (targetStage === "closed") return { action: "noop" }
  return { action: "create" }
}
