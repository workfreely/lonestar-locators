// App-side read/write for workspace follow-up template OVERRIDES (CP2).
//
// The write path is the security-definer RPC save_follow_up_templates, scoped to
// the caller's current_workspace_id() — the same pattern save_smart_form uses.
// This module ONLY persists/reads the override map; it does not build UI, wire
// the Companion menu, or apply overrides at the send sites (later checkpoints).
//
// Content only — nothing here touches the workflow engine, Next Actions,
// action_key values, timing, stages, or automation.
import { supabase } from "@/lib/supabase/client"
import {
  sanitizeFollowUpOverrides,
  type FollowUpOverrides,
} from "@bc/companion-shared"

/**
 * Persist the workspace's follow-up template overrides. Sanitizes first (drops
 * empty / equal-to-default values, rejects invalid keys / over-length / non-
 * strings), then calls the RPC with only the customized keys. Returns the
 * saved-at timestamp. Throws if any entry is invalid (a server-boundary guard;
 * the editing UI should validate before calling).
 */
export async function saveFollowUpTemplateOverrides(input: unknown): Promise<string> {
  const { overrides, rejected } = sanitizeFollowUpOverrides(input)
  if (rejected.length) {
    throw new Error(
      `invalid follow-up template overrides: ${rejected.map((r) => `${r.key} (${r.reason})`).join(", ")}`,
    )
  }
  const { data, error } = await supabase.rpc("save_follow_up_templates", {
    p_templates: overrides,
  })
  if (error) throw error
  return data as string
}

/**
 * Read a workspace's stored overrides from the raw `follow_up_templates` jsonb
 * (or a workspaces row's column value). Runs it back through the sanitizer so a
 * caller always gets a clean, validated override map.
 */
export function readFollowUpTemplateOverrides(raw: unknown): FollowUpOverrides {
  return sanitizeFollowUpOverrides(raw).overrides
}
