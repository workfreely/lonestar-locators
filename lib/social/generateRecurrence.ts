// Beast Social — server-side occurrence GENERATION for a recurring rule. Reads current source
// metadata (future occurrences always use the latest), reads existing planned posts as slot
// OCCUPANCY (manual posts always win — never overwritten), asks the pure scheduler for placements,
// and inserts each occurrence as a NORMAL social_posts row (status 'scheduled' → shows in Queue +
// Calendar). Idempotent: only occurrence indices that don't yet exist for the rule are inserted, so
// re-running (this checkpoint on save; the future daily cron) never duplicates. NO publishing here.
//
// Server-only. The future replenish cron will call generateOccurrences() with the same logic.
import type { PlatformAdminGuardOk } from "@/lib/auth/requirePlatformAdmin"
import { preparePost, startingPriceLabel } from "@/lib/social/composePost"
import {
  planOccurrences, dayKeysFrom, dateKeyInTz, wallClockToUtcISO, horizonDays, maxOccurrencesFor,
  slotForMinute, isGeneratingState, DEFAULT_TIMEZONE, type Occupancy, type Slot, type PlacementPref,
} from "@/lib/social/recurrence"

type SB = PlatformAdminGuardOk["supabase"]

export type RuleRow = {
  id: string
  owner_user_id: string
  source_content_id: string
  platform: string
  interval_days: number
  end_mode: string
  end_at: string | null
  placement_pref: string
  posts_per_day: number
  state: string
  post_type: string
  audio_choice: string
}

export type GenerateResult = { created: number; horizonDays: number; planned: number }

/** Generate (idempotently) the rolling first-horizon occurrences for one ACTIVE rule. */
export async function generateOccurrences(supabase: SB, rule: RuleRow, tz: string = DEFAULT_TIMEZONE): Promise<GenerateResult> {
  if (!isGeneratingState(rule.state)) return { created: 0, horizonDays: 0, planned: 0 }

  const { data: src } = await supabase
    .from("social_content")
    .select("market, property_type, special, budget_range, amenities, overlay_mode, display_name")
    .eq("id", rule.source_content_id)
    .maybeSingle()
  if (!src) return { created: 0, horizonDays: 0, planned: 0 }
  const s = src as Record<string, unknown>

  // Horizon: start TOMORROW (never schedule in the past), rolling-capped at 30 days.
  const now = Date.now()
  const startKey = dateKeyInTz(new Date(now + 86400000), tz)
  const startMs = new Date(`${startKey}T12:00:00Z`).getTime()
  let durationDays = Infinity
  if (rule.end_mode !== "until_stopped" && rule.end_at) {
    durationDays = Math.max(0, Math.round((new Date(rule.end_at).getTime() - startMs) / 86400000))
  }
  const horizon = horizonDays(durationDays)
  const maxOcc = maxOccurrencesFor(rule.interval_days, horizon)
  const days = dayKeysFrom(startKey, horizon + 25) // +buffer so bumped occurrences still fit

  // Occupancy from every existing PLANNED post for this owner (manual + prior occurrences).
  const { data: existing } = await supabase
    .from("social_posts")
    .select("scheduled_at")
    .eq("owner_user_id", rule.owner_user_id)
    .not("scheduled_at", "is", null)
  const occupancy: Occupancy = new Map()
  const hm = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" })
  for (const row of (existing ?? []) as { scheduled_at: string }[]) {
    const d = new Date(row.scheduled_at)
    if (isNaN(d.getTime())) continue
    const dk = dateKeyInTz(d, tz)
    const parts = Object.fromEntries(hm.formatToParts(d).map((x) => [x.type, x.value]))
    const min = (Number(parts.hour) % 24) * 60 + Number(parts.minute)
    const slot = slotForMinute(min)
    const day = occupancy.get(dk) ?? { count: 0, slots: new Set<Slot>() }
    day.count += 1
    if (slot) day.slots.add(slot)
    occupancy.set(dk, day)
  }

  const placements = planOccurrences({
    ruleId: rule.id,
    intervalDays: rule.interval_days,
    placementPref: rule.placement_pref as PlacementPref,
    postsPerDay: rule.posts_per_day,
    days,
    occupancy,
    maxOccurrences: maxOcc,
  })

  // Only insert occurrence indices that don't already exist for this rule → idempotent re-runs.
  const { data: had } = await supabase.from("social_posts").select("recurrence_index").eq("recurring_rule_id", rule.id)
  const have = new Set((had ?? []).map((r) => (r as { recurrence_index: number | null }).recurrence_index))

  const prepared = preparePost(
    { market: s.market as string | null, propertyType: s.property_type as string | null, special: s.special as string | null, budgetRange: s.budget_range as string | null, amenities: s.amenities as string | null },
    rule.source_content_id,
  )
  const overlayMode = s.overlay_mode === "existing" ? "existing" : "generate"
  const postName = typeof s.display_name === "string" ? (s.display_name as string) : null

  const rows = placements
    .filter((p) => !have.has(p.index))
    .map((p) => ({
      owner_user_id: rule.owner_user_id,
      source_content_id: rule.source_content_id,
      platform: rule.platform,
      post_type: rule.post_type,
      post_name: postName,
      caption: prepared.caption,
      overlay_headline: prepared.overlayHeadline,
      overlay_subheadline: startingPriceLabel(s.budget_range as string | null),
      overlay_mode: overlayMode,
      hashtags: prepared.hashtags,
      audio_choice: rule.audio_choice,
      render_status: "none",
      status: "scheduled",
      scheduled_at: wallClockToUtcISO(p.dateKey, p.minute, tz),
      recurring_rule_id: rule.id,
      recurrence_index: p.index,
      recurrence_slot: p.slot,
    }))

  let created = 0
  if (rows.length) {
    const { data, error } = await supabase.from("social_posts").insert(rows).select("id")
    if (!error) created = (data ?? []).length
  }
  await supabase
    .from("social_recurring_rules")
    .update({ last_generated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", rule.id)

  return { created, horizonDays: horizon, planned: placements.length }
}
