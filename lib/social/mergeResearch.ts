// MERGING VERIFIED RESEARCH — the rule that a newer source cannot erase an older finding.
//
// ── THE HAZARD ──────────────────────────────────────────────────────────────────────────────
// Research arrives one source at a time. A leasing page lists twelve amenities today and five
// tomorrow, because the page was redesigned — not because seven amenities were removed from the
// building. A floor-plan catalogue shows the two plans that happen to be available this week, not
// the twenty-two that exist. A plain object spread, or a plain column write, treats both of those
// as deletions and silently discards work that took real effort to verify.
//
// ── THE RULE ────────────────────────────────────────────────────────────────────────────────
// OMISSION IS NOT DELETION.
//
//   key missing from the incoming object   →  the existing value is KEPT
//   key present with a different value     →  the incoming value WINS (this is a correction)
//   nested object                          →  merged recursively, same rules
//   array                                  →  UNIONED, never truncated — see below
//   explicit `remove`                      →  the only way a key is deleted
//
// Arrays get the same protection as keys, for the same reason: a shorter new list is far more
// often an incomplete source than a shrunken building. "communityAmenities: [pool]" arriving
// against a stored list of twelve must not leave one. Union preserves the earlier findings and
// adds the new ones, in order, deduplicated.
//
// An array that genuinely SHOULD be replaced — a floor-plan catalogue re-read in full from the
// official site, superseding a partial third-party one — is replaced by naming its path in
// `replace`. Explicit, reviewable, and never the default.
//
// ── WHAT THIS IS NOT ────────────────────────────────────────────────────────────────────────
// Not a conflict resolver. When two sources disagree, that disagreement belongs in `unresolved`
// as a flagged conflict, not silently resolved here. This only governs whether an ABSENT fact
// survives — and it always does.
//
// Pricing is deliberately NOT merged by this helper. A special that has expired must stop being
// current, which is a replacement, not a union; `pricing.specials[].status` already carries
// verified_current / previously_recorded / expired / conflicting / unknown so history and current
// truth live side by side there.

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json }
type JsonObject = { [k: string]: Json }

const isPlainObject = (v: Json | undefined): v is JsonObject =>
  typeof v === "object" && v !== null && !Array.isArray(v)

/** Deep structural equality, used to decide whether two array entries are the same finding. */
function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a), kb = Object.keys(b)
    return ka.length === kb.length && ka.every((k) => k in b && deepEqual(a[k], b[k]))
  }
  return false
}

/**
 * The identity of an array entry, for deduplication.
 *
 * Floor plans and sources are objects with a natural key — a plan called "A1" read again from a
 * better source is the SAME plan with better detail, not a second one. Everything else falls back
 * to deep equality, which is what makes a list of amenity strings union correctly.
 */
function entryKey(v: Json): string | null {
  if (!isPlainObject(v)) return null
  for (const k of ["name", "url", "field"]) {
    const id = v[k]
    if (typeof id === "string" && id.trim()) return `${k}:${id.trim()}`
  }
  return null
}

/** Union two arrays: existing entries first, then genuinely new ones. Entries that share an
 *  identity are merged so a later, richer reading of the same plan keeps the earlier detail. */
function unionArrays(current: Json[], incoming: Json[]): Json[] {
  const out: Json[] = [...current]
  for (const item of incoming) {
    const key = entryKey(item)
    if (key) {
      const at = out.findIndex((e) => entryKey(e) === key)
      if (at >= 0) {
        const existing = out[at]
        out[at] = isPlainObject(existing) && isPlainObject(item)
          ? (mergeStableResearch(existing, item) as Json)
          : item
        continue
      }
    } else if (out.some((e) => deepEqual(e, item))) {
      continue
    }
    out.push(item)
  }
  return out
}

export type MergeOptions = {
  /** Dot paths whose ARRAY should be replaced rather than unioned — e.g. "floorPlans" when a full
   *  official catalogue supersedes a partial one. Explicit by design. */
  replace?: string[]
  /** Dot paths to DELETE outright — the only way merging removes anything. Use when a fact was
   *  wrong, not merely unmentioned. */
  remove?: string[]
}

/**
 * Merge newly verified research into the stored `stable` object without losing anything by omission.
 *
 * Pure, and never mutates either input.
 */
export function mergeStableResearch(
  current: JsonObject | null | undefined,
  incoming: JsonObject | null | undefined,
  opts: MergeOptions = {},
  path = "",
): JsonObject {
  const base: JsonObject = current ? { ...current } : {}
  const next: JsonObject = incoming ?? {}
  const replace = new Set(opts.replace ?? [])
  const remove = new Set(opts.remove ?? [])

  for (const [k, v] of Object.entries(next)) {
    const here = path ? `${path}.${k}` : k
    if (remove.has(here)) continue // handled below, so an incoming value cannot resurrect it
    const existing = base[k]

    if (Array.isArray(existing) && Array.isArray(v)) {
      base[k] = replace.has(here) ? v : unionArrays(existing, v)
    } else if (isPlainObject(existing) && isPlainObject(v)) {
      base[k] = mergeStableResearch(existing, v, opts, here)
    } else {
      base[k] = v
    }
  }

  // EXPLICIT REMOVAL, applied last so it wins over anything the incoming object carried.
  for (const p of remove) {
    const parts = p.split(".")
    const prefix = path ? `${path}.` : ""
    if (!p.startsWith(prefix)) continue
    const rel = p.slice(prefix.length).split(".")
    if (rel.length === 1 && parts.length === (path ? path.split(".").length + 1 : 1)) {
      delete base[rel[0]]
    }
  }
  return base
}

/**
 * What a merge would DISCARD if it were a plain overwrite — the keys the incoming object omits.
 *
 * Reported rather than applied, so a research update can say out loud what it would have cost.
 * An empty list means an overwrite would have been safe.
 */
export function omittedKeys(
  current: JsonObject | null | undefined,
  incoming: JsonObject | null | undefined,
  path = "",
): string[] {
  const out: string[] = []
  if (!current) return out
  const next = incoming ?? {}
  for (const [k, v] of Object.entries(current)) {
    const here = path ? `${path}.${k}` : k
    if (!(k in next)) { out.push(here); continue }
    if (isPlainObject(v) && isPlainObject(next[k])) out.push(...omittedKeys(v, next[k] as JsonObject, here))
    else if (Array.isArray(v) && Array.isArray(next[k])) {
      const lost = v.filter((e) => !(next[k] as Json[]).some((n) => deepEqual(e, n) || (entryKey(e) && entryKey(e) === entryKey(n))))
      if (lost.length) out.push(`${here}[${lost.length} entr${lost.length === 1 ? "y" : "ies"}]`)
    }
  }
  return out
}
