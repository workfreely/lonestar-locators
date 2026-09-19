/**
 * Database row shapes — the INTERNAL representation, mirrored from the audited
 * `leads` / `lead_next_actions` columns. These are NOT the public Companion
 * contract (see contract.ts); server code maps rows → contract DTOs so raw DB
 * rows are never exposed across the extension boundary.
 *
 * TODO(auth phase): replace this hand-authored shape with the output of
 *   `supabase gen types typescript --project-id onwrrajmklxtnabekzcy`
 * and keep contract.ts as the stable public surface on top of it. Hand-authored
 * now only because generating requires live DB access (local env targets the
 * frozen Lone Star project).
 */

import type { LeadStage } from "./stages";

/** IDs: real leads are bigint (number); demo leads use string ids ("demo-1"). */
export type LeadId = number | string;
export type NextActionId = number | string;

export type LeadPriority = "low" | "medium" | "high";

export interface LeadRow {
  id: LeadId;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  neighborhoods: string | null;
  move_date: string | null;
  desired_rent: string | null;
  property_type: string | null;
  beds: string | null;
  baths: string | null;
  credit_score: string | null;
  credit_history: string | null;
  criminal_background: string | null;
  broken_lease_age: string | null;
  eviction_age: string | null;
  felony_age: string | null;
  misdemeanor_age: string | null;
  lead_type: string | null;
  landing_page: string | null;
  source: string | null;
  crm_status: LeadStage;
  follow_up_count: number | null;
  next_action_date: string | null;
  first_text_sent_at: string | null;
  archive_reason: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  pre_delete_status: LeadStage | null;
  // On Hold state (see 20260920000000_add_hold_to_leads). held_at non-null ⇒ the
  // lead is paused; crm_status is preserved. hold_follow_up_at is the reminder date.
  held_at: string | null;
  hold_follow_up_at: string | null;
  closed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  workspace_id: string;
}

export interface LeadNextActionRow {
  id: NextActionId;
  lead_id: LeadId;
  title: string;
  due_at: string | null;
  priority: LeadPriority;
  notes: string | null;
  completed: boolean;
  completed_at: string | null;
  property_id: number | null;
  property_name: string | null;
  /**
   * Outcome/disposition extension point — NOT collected today (parity per the
   * approved decision). Reserved so the follow-up "outcome collection" phase can
   * add a column without reshaping the type. Never required.
   */
  outcome?: string | null;
}
