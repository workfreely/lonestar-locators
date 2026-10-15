// THE ONLY WAY RESEARCH IS WRITTEN — so "use the merge helper" is enforced, not remembered.
//
// Every enrichment script imports saveResearch() rather than calling .insert() or .update()
// directly. That matters because the failure it prevents is silent: a second pass over a property
// that happens to omit the floor-plan catalogue would, with a plain update, delete twenty-two
// verified plans and report success.
//
// ── THE RULES, PER COLUMN ───────────────────────────────────────────────────────────────────
//   stable      merged — OMISSION NEVER DELETES. A key the new reading doesn't mention is kept;
//               a key it changes wins; arrays union. Explicit `replace`/`remove` still work.
//   sources     UNIONED by url. A source that was consulted once was consulted; later readings
//               add to the bibliography, they do not shorten it.
//   unresolved  UNIONED. A flagged conflict stays flagged until it is explicitly resolved —
//               a later reading that simply didn't notice it must not clear it.
//   pricing     merged, but `specials` and `startingPrices` REPLACED by default. This is the one
//               place replacement is right: an expired concession must stop being current. The
//               previous values are not lost — they are in revision history, and each entry
//               carries its own status (verified_current | previously_recorded | expired |
//               conflicting | unknown), sourceKind and verifiedAt, so what is current stays
//               distinguishable from what was merely once observed.
//
// Nothing here deletes a row, and the database trigger records the previous values of every
// update regardless — so even a mistake made through this path is recoverable.

import type { SupabaseClient } from "@supabase/supabase-js"
import { mergeStableResearch, omittedKeys, type Json, type MergeOptions } from "@/lib/social/mergeResearch"

type JsonObject = { [k: string]: Json }

export type ResearchRecord = {
  owner_user_id: string
  /** Google Places id. With owner_user_id this is the canonical identity — never a surrogate. */
  place_id: string
  property_name?: string | null
  stable?: JsonObject
  pricing?: JsonObject
  sources?: Json[]
  unresolved?: Json[]
}

export type SaveResult = {
  property: string
  action: "inserted" | "merged" | "unchanged"
  /** Keys the new reading omitted that were KEPT rather than deleted. The whole point, made visible. */
  preserved: string[]
  /** What the new reading actually contributed. */
  added: { sources: number; unresolved: number }
  warnings: string[]
}

const urlOf = (v: Json): string | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) && typeof (v as JsonObject).url === "string"
    ? ((v as JsonObject).url as string) : null

/** Union a list by `url` when entries have one, else by deep identity. Existing entries stay first. */
function unionList(current: Json[], incoming: Json[]): { out: Json[]; added: number } {
  const out = [...current]
  let added = 0
  for (const item of incoming) {
    const u = urlOf(item)
    const dup = u
      ? out.some((e) => urlOf(e) === u)
      : out.some((e) => JSON.stringify(e) === JSON.stringify(item))
    if (!dup) { out.push(item); added++ }
  }
  return { out, added }
}

/**
 * Insert a new research record, or merge into the existing one for (owner_user_id, place_id).
 *
 * Never deletes, never truncates, and reports what a plain overwrite would have cost.
 */
export async function saveResearch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, any, any>,
  rec: ResearchRecord,
  opts: MergeOptions = {},
): Promise<SaveResult> {
  const name = rec.property_name ?? rec.place_id
  const warnings: string[] = []
  if (!rec.owner_user_id || !rec.place_id) {
    throw new Error(`saveResearch needs BOTH owner_user_id and place_id — the identity is the pair, not either half (${name})`)
  }

  // IDENTITY IS THE PAIR. Looking up by place_id alone would merge one account's research into
  // another's the moment two operators research the same building.
  const { data: existing, error: readErr } = await sb
    .from("social_property_research")
    .select("id, property_name, stable, pricing, sources, unresolved")
    .eq("owner_user_id", rec.owner_user_id)
    .eq("place_id", rec.place_id)
    .maybeSingle()
  if (readErr) throw new Error(`saveResearch read failed for ${name}: ${readErr.message}`)

  if (!existing) {
    const { error } = await sb.from("social_property_research").insert({
      owner_user_id: rec.owner_user_id,
      place_id: rec.place_id,
      property_name: rec.property_name ?? null,
      stable: rec.stable ?? {},
      pricing: rec.pricing ?? {},
      sources: rec.sources ?? [],
      unresolved: rec.unresolved ?? [],
    })
    if (error) throw new Error(`saveResearch insert failed for ${name}: ${error.message}`)
    return { property: name, action: "inserted", preserved: [], added: { sources: (rec.sources ?? []).length, unresolved: (rec.unresolved ?? []).length }, warnings }
  }

  // WHAT A PLAIN OVERWRITE WOULD HAVE DESTROYED — computed before merging, so it can be reported.
  const preserved = rec.stable ? omittedKeys(existing.stable as JsonObject, rec.stable) : []

  const stable = rec.stable
    ? mergeStableResearch(existing.stable as JsonObject, rec.stable, opts)
    : (existing.stable as JsonObject)

  // Pricing: merged, but the time-sensitive lists are superseded rather than accumulated.
  const pricing = rec.pricing
    ? mergeStableResearch(existing.pricing as JsonObject, rec.pricing, {
        ...opts,
        replace: [...(opts.replace ?? []), "specials", "startingPrices", "overallRange"],
      })
    : (existing.pricing as JsonObject)

  const srcU = unionList((existing.sources as Json[]) ?? [], rec.sources ?? [])
  const unrU = unionList((existing.unresolved as Json[]) ?? [], rec.unresolved ?? [])

  const next = {
    property_name: rec.property_name ?? existing.property_name,
    stable, pricing, sources: srcU.out, unresolved: unrU.out,
    updated_at: new Date().toISOString(),
  }

  // Skip a write that would change nothing, so no needless revision is recorded.
  const same =
    JSON.stringify(next.stable) === JSON.stringify(existing.stable) &&
    JSON.stringify(next.pricing) === JSON.stringify(existing.pricing) &&
    JSON.stringify(next.sources) === JSON.stringify(existing.sources) &&
    JSON.stringify(next.unresolved) === JSON.stringify(existing.unresolved) &&
    next.property_name === existing.property_name
  if (same) return { property: name, action: "unchanged", preserved, added: { sources: 0, unresolved: 0 }, warnings }

  const { error } = await sb.from("social_property_research").update(next).eq("id", existing.id)
  if (error) throw new Error(`saveResearch update failed for ${name}: ${error.message}`)

  if (preserved.length) {
    warnings.push(`${preserved.length} stable key(s) the new reading omitted were KEPT: ${preserved.slice(0, 6).join(", ")}${preserved.length > 6 ? ` …+${preserved.length - 6}` : ""}`)
  }
  return { property: name, action: "merged", preserved, added: { sources: srcU.added, unresolved: unrU.added }, warnings }
}
