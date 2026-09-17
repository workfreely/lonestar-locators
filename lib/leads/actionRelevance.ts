// Workflow-relevance for Next Action ranking — the ONE place that answers
// "given where this client is right now, which class of action advances their
// current objective?" It turns the approved business rule into a single stage →
// foreground-action-keys map, so ranking no longer relies on scattered per-stage
// suppression hacks.
//
// Two tiers:
//   • FOREGROUND — the current stage's objective, its same-property prerequisites,
//     the active transaction, same-stage multi-property work, the automatic stage
//     action, and manual/custom tasks. These compete for Primary Next Action.
//   • BACKGROUND — stale / earlier-context / competing-property actions. They stay
//     OPEN and visible, but never become Primary while the current context is active.
//     Nothing is deleted, so a workflow regression (e.g. Applied → denied → touring)
//     lets a demoted action become foreground again automatically.
//
// This is deliberately NON-destructive and NON-property-tiebreaking: within the
// foreground class the existing urgency → priority → due ordering still decides the
// winner (so three legitimate Ready-to-Tour guest cards still rank by overdue-first).

export const RELEVANCE_FOREGROUND = 0
export const RELEVANCE_BACKGROUND = 1
export type RelevanceRank = typeof RELEVANCE_FOREGROUND | typeof RELEVANCE_BACKGROUND

// Foreground action_keys per crm_status. Derived directly from the workflow the
// engine actually creates at each stage (see lib/workflowEngine.ts + the per-stage
// workflow modules). "applied" is the active APPLICATION transaction (Check App →
// Approved → Confirm Lease); "closed" is the post-lease closing chain. Competing
// earlier-property actions (email_guest_card / tour_follow_up for other properties)
// are intentionally absent from applied/closed, which is what demotes them.
const STAGE_FOREGROUND: Record<string, ReadonlySet<string>> = {
  new: new Set(["contact_lead", "contact_follow_up_1", "contact_follow_up_2", "contact_follow_up_3"]),
  contacted: new Set(["build_list", "contact_follow_up_1", "contact_follow_up_2", "contact_follow_up_3"]),
  searching: new Set(["send_list"]),
  list_sent: new Set(["follow_up_1", "follow_up_2", "follow_up_3", "final_follow_up", "email_guest_card", "setup_tour"]),
  ready_to_tour: new Set(["setup_tour", "reconnect_client", "email_guest_card", "tour_follow_up"]),
  done_touring: new Set(["tour_follow_up", "start_application", "email_guest_card"]),
  applied: new Set(["start_application", "check_application", "confirm_lease"]),
  closed: new Set(["get_invoice_details", "send_invoice", "commission_paid", "send_rebate", "lease_follow_up"]),
  archived: new Set([]),
}

/** Does this stage have a defined foreground set? (Unknown stages don't demote.) */
export function hasForegroundMap(stage: string | null | undefined): boolean {
  return Object.prototype.hasOwnProperty.call(STAGE_FOREGROUND, String(stage ?? ""))
}

/**
 * The EFFECTIVE foreground set for a lead — usually its stage's set, but the applied
 * stage is sub-state-aware: a denied/canceled application does NOT change crm_status
 * (it reopens setup_tour and stays 'applied', see applicationOutcomeWorkflow), so the
 * lead's live objective has regressed to touring. In that state the touring actions
 * are foreground again (the "workflow regression" rule) and the finished application
 * actions no longer dominate. Approved/pending/other keep the application transaction
 * foreground (Confirm Lease is the objective after approval — the lead stays applied).
 * Returns null for unknown stages (→ never demote).
 */
function effectiveForeground(lead: { crm_status?: string | null; application_status?: string | null } | null | undefined): ReadonlySet<string> | null {
  const stage = String(lead?.crm_status ?? "")
  if (stage === "applied") {
    const appStatus = String(lead?.application_status ?? "")
    if (appStatus === "denied" || appStatus === "canceled") return STAGE_FOREGROUND.ready_to_tour
    return STAGE_FOREGROUND.applied
  }
  return STAGE_FOREGROUND[stage] ?? null
}

/**
 * Workflow-relevance rank for one action given the lead's current stage (and applied
 * sub-state).
 *   • The automatic stage action is always FOREGROUND (it IS the stage's action).
 *   • Manual/custom tasks (action_key null / action_type 'manual') are always
 *     FOREGROUND — their current ranking semantics are preserved on purpose;
 *     whether a stale manual task should be demoted is a separate product decision.
 *   • Workflow actions are FOREGROUND iff their action_key is in the effective set.
 *   • Unknown stage, or a stage with no map, never demotes (safe default).
 */
export function actionRelevanceRank(
  lead: { crm_status?: string | null; application_status?: string | null } | null | undefined,
  action: { action_key?: string | null; action_type?: string | null; isAutomatic?: boolean } | null | undefined,
): RelevanceRank {
  if (!action) return RELEVANCE_BACKGROUND
  if (action.isAutomatic) return RELEVANCE_FOREGROUND
  const key = String(action.action_key ?? "")
  const isManual = key === "" || String(action.action_type ?? "") === "manual"
  if (isManual) return RELEVANCE_FOREGROUND
  const fg = effectiveForeground(lead)
  if (!fg) return RELEVANCE_FOREGROUND // unknown stage → don't demote anything
  return fg.has(key) ? RELEVANCE_FOREGROUND : RELEVANCE_BACKGROUND
}
