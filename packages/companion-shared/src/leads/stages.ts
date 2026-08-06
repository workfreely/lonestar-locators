/**
 * Lead stages — the single source of truth for the CRM pipeline, replacing the
 * `any`-typed, separately-enumerated stage lists in LeadBoard/LeadColumn/LeadPanel.
 * Values match the existing `leads.crm_status` column exactly (do not rename —
 * they are persisted).
 */

export const LEAD_STAGES = [
  "new",
  "contacted",
  "searching",
  "list_sent",
  "ready_to_tour",
  "done_touring",
  "applied",
  "closed",
  "archived",
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];

export function isLeadStage(value: unknown): value is LeadStage {
  return typeof value === "string" && (LEAD_STAGES as readonly string[]).includes(value);
}

/** Human labels (title-cased) — mirrors LeadPanel's formatStatus output. */
export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new: "New",
  contacted: "Contacted",
  searching: "Searching",
  list_sent: "List Sent",
  ready_to_tour: "Ready to Tour",
  done_touring: "Done Touring",
  applied: "Applied",
  closed: "Closed",
  archived: "Archived",
};

/**
 * Semantic badge tone per stage — a design token, NOT a hard-coded color. The
 * renderer maps a tone to the shared palette (see tokens). Mirrors the existing
 * STATUS_STYLES intent (amber/blue/violet/emerald/orange/yellow/gray/green/slate)
 * without baking Tailwind classes into shared code.
 */
export type BadgeTone =
  | "amber"
  | "blue"
  | "violet"
  | "emerald"
  | "orange"
  | "yellow"
  | "gray"
  | "green"
  | "slate"
  | "red";

export const LEAD_STAGE_TONE: Record<LeadStage, BadgeTone> = {
  new: "amber",
  contacted: "blue",
  searching: "violet",
  list_sent: "emerald",
  ready_to_tour: "orange",
  done_touring: "yellow",
  applied: "gray",
  closed: "green",
  archived: "slate",
};
