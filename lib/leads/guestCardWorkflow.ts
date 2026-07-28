// Guest Card workflow (Locator Beast Workflow Engine).
//
// Each Favorite Property a locator adds to a List Sent lead is a distinct
// property the client may tour, and each one needs its own guest card. So
// EVERY favorite added while the lead is in List Sent spawns its own
// property-specific "Email Guest Card" action (scoped by property_id), unless
// a guest card for that same property already exists (open OR completed).
//
// Adding the first one also clears the pending follow-up chase (FU1/FU2/…) —
// the client has responded and progressed. The pipeline stage is never touched
// automatically: the lead stays in List Sent until a tour is actually booked.
//
// Setup Tour is created by the completion handler (LeadPanel) only once EVERY
// selected property's guest card is done — not after the first one.

import type { SupabaseClient } from "@supabase/supabase-js"

const FOLLOW_UP_TITLES = new Set(["fu1", "fu2", "fu3", "final", "final fu", "follow up"])

// A follow-up chase step, superseded once the lead sends a guest card.
export function isFollowUpTitle(title: string): boolean {
  return FOLLOW_UP_TITLES.has(title.trim().toLowerCase())
}

export function isGuestCardTitle(title: string | null | undefined): boolean {
  return (title ?? "").trim().toLowerCase() === "email guest card"
}

// Note: the "suppress the computed follow-up while a guest card / Setup Tour is
// open on a List Sent lead" rule lives inline in lib/nextActions.ts (that
// module stays dependency-free of this one).

type OpenActionRow = { id: number; lead_id: number; title: string; completed?: boolean | null }
type FavoriteRow = { id: number; lead_id?: number; property_name?: string | null; property_address?: string | null }

export type CreatedGuestCardAction = {
  id: number
  lead_id: number
  title: string
  due_at: string
  priority: "low" | "medium" | "high"
  property_id: number | null
  property_name: string | null
  completed: boolean
  completed_at: string | null
}

/**
 * Fires when a Favorite Property is saved on a List Sent lead. Creates an
 * "Email Guest Card" action scoped to that property (priority "high" so it
 * sits ahead of any Setup Tour), skipping if a guest card for the same
 * property already exists (open OR completed). The first favorite also clears
 * any pending follow-up rows.
 *
 * Returns the created action + the follow-up ids removed so the caller can
 * update its in-memory nextActions state; null when nothing applies.
 */
export async function triggerGuestCardForFavorite(
  client: SupabaseClient,
  lead: { id: number | string; crm_status?: string | null },
  favorite: FavoriteRow,
  openActions: OpenActionRow[]
): Promise<{ created: CreatedGuestCardAction | null; removedIds: number[] } | null> {
  if (lead.crm_status !== "list_sent") return null

  // Clear the pending follow-up(s) once — the lead has progressed.
  const pendingFollowUps = openActions.filter(
    (a) => a.lead_id === lead.id && !a.completed && isFollowUpTitle(a.title)
  )
  const removedIds = pendingFollowUps.map((a) => a.id)
  if (removedIds.length > 0) {
    const { error } = await client.from("lead_next_actions").delete().in("id", removedIds)
    if (error) console.error("[guest-card-workflow] clearing follow-ups failed:", error)
  }

  // Per-property dedup: skip if a guest card for this property already exists,
  // whether it's still open or already completed.
  const { data: existing, error: checkError } = await client
    .from("lead_next_actions")
    .select("id")
    .eq("lead_id", lead.id)
    .eq("property_id", favorite.id)
    .ilike("title", "Email Guest Card")
    .limit(1)

  if (checkError) {
    console.error("[guest-card-workflow] dedup check failed:", checkError)
    return { created: null, removedIds }
  }
  if (existing && existing.length > 0) return { created: null, removedIds }

  const propertyName = (favorite.property_name || favorite.property_address || "").trim() || null

  const { data: created, error: insertError } = await client
    .from("lead_next_actions")
    .insert([
      {
        lead_id: lead.id,
        title: "Email Guest Card",
        due_at: new Date().toISOString(),
        priority: "high",
        property_id: favorite.id,
        property_name: propertyName,
      },
    ])
    .select("*")
    .single()

  if (insertError) {
    console.error("[guest-card-workflow] create failed:", insertError)
    return { created: null, removedIds }
  }

  return { created: created as CreatedGuestCardAction, removedIds }
}
