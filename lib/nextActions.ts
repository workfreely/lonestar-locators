// Unified Next Action ranking (CRM v1.1.0 Phase 1).
//
// Every lead may have one automatic stage action (computed, never stored —
// see lib/nextAction.ts) and zero or more manual actions (stored in
// lead_next_actions). This module picks a single "primary" action to
// display and returns the rest as "other open actions" — it never deletes
// or replaces the automatic action, only decides which one currently wins.
//
// Ranking: due-date urgency first (overdue, then today, then upcoming/none),
// `priority` as a tiebreaker within the same urgency bucket. The automatic
// action participates using the lead's next_action_date at priority
// "medium" — a null next_action_date is NOT treated as overdue (matches
// the existing Follow-Ups sidebar behavior, where a due-less lead is only
// surfaced via the separate "Urgent" = new-lead rule, not the date queue).
//
// Deliberately ranking-only, not labeling — LeadPanel and FollowUpRow each
// already have their own (differently-worded) automatic-action label
// function. Forcing both to share one label string would silently change
// visible text neither caller asked to change, so the automatic label is
// passed in by the caller rather than computed here.

export type ManualNextAction = {
  id: number
  lead_id: number
  title: string
  due_at: string
  priority: "low" | "medium" | "high"
  completed: boolean
  completed_at: string | null
  notes: string | null
  created_at: string
  // Set only on property-specific actions (Email Guest Card) — see
  // lib/leads/guestCardWorkflow.ts.
  property_id?: number | null
  property_name?: string | null
}

export type RankedAction = {
  kind: "automatic" | "manual"
  title: string
  dueAt: string | null
  priority: "low" | "medium" | "high"
  urgency: "overdue" | "today" | "upcoming" | "none"
  manualAction?: ManualNextAction
}

const PRIORITY_RANK: Record<"low" | "medium" | "high", number> = { high: 0, medium: 1, low: 2 }
const URGENCY_RANK: Record<RankedAction["urgency"], number> = { overdue: 0, today: 1, upcoming: 2, none: 3 }

function urgencyOf(dueAt: string | null): RankedAction["urgency"] {
  if (!dueAt) return "none"
  const today = new Date()
  const d = new Date(dueAt)
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  if (d.getTime() < today.getTime()) return "overdue"
  if (d.getTime() === today.getTime()) return "today"
  return "upcoming"
}

function compareActions(a: RankedAction, b: RankedAction): number {
  const urgencyDiff = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]
  if (urgencyDiff !== 0) return urgencyDiff

  const priorityDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  if (priorityDiff !== 0) return priorityDiff

  // Earlier due date wins within the same urgency + priority bucket.
  if (a.dueAt && b.dueAt) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
  if (a.dueAt) return -1
  if (b.dueAt) return 1
  return 0
}

/**
 * Ranks a lead's automatic stage action against its open manual actions.
 * Returns the single highest-priority action as `primary`, everything
 * else (including the automatic action when a manual one wins) as
 * `others`, already sorted the same way.
 *
 * `automaticLabel` is the caller's own label for the automatic action
 * (e.g. lib/nextAction.ts's getNextAction(), or FollowUpRow's own wording)
 * — this module only decides which action wins, never what to call it.
 */
export function rankLeadActions(
  lead: any,
  manualActions: ManualNextAction[],
  automaticLabel: string
): { primary: RankedAction; others: RankedAction[] } {
  // Archived leads are out of the active workflow entirely — neither the
  // automatic stage action nor any open manual action should ever surface
  // as due/overdue while archived. Nothing is deleted here (the lead's
  // next_action_date and its lead_next_actions rows are untouched), so
  // restoring the lead to an active stage resumes ranking normally.
  if (lead.crm_status === "archived") {
    return {
      primary: {
        kind: "automatic",
        title: automaticLabel,
        dueAt: null,
        priority: "medium",
        urgency: "none",
      },
      others: [],
    }
  }

  let openManual = manualActions.filter((a) => !a.completed && a.lead_id === lead.id)

  // Once a lead is Closed, its required next step is "Get Invoice Details". The
  // Applied-stage "Check App" row is created earlier and never auto-deleted, so
  // it can linger as an open row and (if overdue) outrank the invoice step —
  // making a Closed lead show "Check App" as its current Next Action. Suppress
  // that stale row for Closed leads so the invoice action wins. (The card badge
  // can't show it anyway — getNextAction is purely stage-derived.)
  if (lead.crm_status === "closed") {
    openManual = openManual.filter((a) => a.title.trim().toLowerCase() !== "check app")
  }

  // The Workflow Engine (lib/workflowEngine.ts) now creates real
  // lead_next_actions rows for most stage transitions, often titled
  // exactly what this automatic label already says (e.g. "Contact Lead",
  // "Setup Tour", "Check App"). Once that real row exists, showing the
  // placeholder automatic entry too would just be a duplicate of the
  // same action — so it's dropped whenever an open manual action shares
  // its title. Leads/stages the engine hasn't touched yet (or has no
  // rule for) are completely unaffected: the automatic entry still
  // participates exactly as before.
  const hasEquivalentManual = openManual.some(
    (a) => a.title.trim().toLowerCase() === automaticLabel.trim().toLowerCase()
  )

  // Guest Card progression: once a List Sent lead has an open "Email Guest
  // Card" or "Setup Tour" action, it has moved past the follow-up chase — so
  // the computed FU automatic action is suppressed (see lib/leads/
  // guestCardWorkflow.ts). The lead stays in List Sent regardless.
  const hasGuestCardProgression =
    lead.crm_status === "list_sent" &&
    openManual.some((a) => {
      const t = a.title.trim().toLowerCase()
      return t === "email guest card" || t === "setup tour"
    })

  const automatic: RankedAction | null = hasEquivalentManual || hasGuestCardProgression ? null : {
    kind: "automatic",
    title: automaticLabel,
    dueAt: lead.next_action_date ?? null,
    priority: "medium",
    urgency: urgencyOf(lead.next_action_date ?? null),
  }

  const manualRanked: RankedAction[] = openManual.map((a) => ({
    kind: "manual",
    title: a.title,
    dueAt: a.due_at,
    priority: a.priority,
    urgency: urgencyOf(a.due_at),
    manualAction: a,
  }))

  const all: RankedAction[] = automatic
    ? [automatic, ...manualRanked].sort(compareActions)
    : manualRanked.sort(compareActions)

  return { primary: all[0], others: all.slice(1) }
}
