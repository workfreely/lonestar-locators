// v1 multi-account rotation: ONE ordered ready pool, each connected account starting at a
// different index into it.
//
// WHY THIS AND NOT A MARKET SELECTOR. When the pool is bulk-rendered with the desired market mix
// already in it, a live per-slot market selector is redundant machinery: rotating the START
// POSITION achieves the real goal — two agents never publishing the same creative on the same day
// — while preserving the pool's curated order exactly.
//
// THE PROPERTY THAT MAKES THIS SAFE. Every account consumes at the same rate, so the distance
// between two accounts' positions NEVER changes. Collisions are therefore decidable up front from
// the start indices alone, rather than being discovered on day twelve:
//
//     two accounts collide on some date  <=>  their circular start gap < postsPerDay
//
// which gives a hard minimum: poolSize >= postsPerDay * accountCount.

/** Circular distance between two indices in a pool of `n`. */
export function circularGap(a: number, b: number, n: number): number {
  if (n <= 0) return 0
  const d = Math.abs(a - b) % n
  return Math.min(d, n - d)
}

export type ConnectionSlot = {
  connectionId: string
  /** Explicit pin, e.g. the primary account at 0. Null ⇒ placed automatically. */
  startIndex?: number | null
}

/**
 * Assign each connection a start index into the pool.
 *
 * Pinned values are honoured. Unpinned connections are placed GREEDILY at whichever index is
 * furthest from every already-assigned start (ties to the lowest index, so it is deterministic).
 *
 * Greedy max-min rather than an even `i * n / k` spread, deliberately: even spreading recomputes
 * every account's offset whenever the account count changes, so connecting a third account would
 * silently move the first two. Greedy placement only ever adds, so an existing account's position
 * is stable for its lifetime — which is what makes per-account performance comparable over time.
 *
 * For one pinned account at 0 in a 60-post pool, the second lands at 30 — "approximately halfway",
 * as intended — and the third at 15 rather than disturbing either.
 */
export function assignStartIndices(connections: readonly ConnectionSlot[], poolSize: number): Map<string, number> {
  const out = new Map<string, number>()
  if (poolSize <= 0) return out
  // Stable input order so the result does not depend on how the rows arrived.
  const ordered = [...connections].sort((a, b) => (a.connectionId < b.connectionId ? -1 : a.connectionId > b.connectionId ? 1 : 0))

  const assigned: number[] = []
  for (const c of ordered) {
    if (c.startIndex !== null && c.startIndex !== undefined && Number.isFinite(c.startIndex)) {
      const v = ((Math.trunc(c.startIndex) % poolSize) + poolSize) % poolSize
      out.set(c.connectionId, v)
      assigned.push(v)
    }
  }
  for (const c of ordered) {
    if (out.has(c.connectionId)) continue
    let best = 0
    if (assigned.length > 0) {
      let bestScore = -1
      for (let i = 0; i < poolSize; i++) {
        const score = Math.min(...assigned.map((a) => circularGap(i, a, poolSize)))
        if (score > bestScore) { bestScore = score; best = i } // strict >, so ties keep the lowest index
      }
    }
    out.set(c.connectionId, best)
    assigned.push(best)
  }
  return out
}

/** The pool, rotated to start at `startIndex`. Order is PRESERVED — only the entry point moves. */
export function rotatePool<T>(pool: readonly T[], startIndex: number): T[] {
  const n = pool.length
  if (n === 0) return []
  const s = ((Math.trunc(startIndex) % n) + n) % n
  return pool.map((_, i) => pool[(s + i) % n])
}

export type RotationCollision = { dateKey: string; poolIndex: number; connectionIds: string[] }
export type RotationPlan = {
  /** connectionId → the pool indices it takes, in order, across the horizon. */
  assignments: Map<string, number[]>
  startIndices: Map<string, number>
  collisions: RotationCollision[]
  /** False when the pool cannot support collision-free scheduling for this many accounts. */
  sufficient: boolean
  poolSize: number
  requiredPoolSize: number
}

/**
 * Plan which pool entries each connection takes, and REPORT rather than hide any reuse.
 *
 * The caller decides what to do with `sufficient: false` — this never silently assigns the same
 * creative to two accounts on one date and calls it success.
 */
export function planRotation(input: {
  connections: readonly ConnectionSlot[]
  poolSize: number
  postsPerDay: number
  dayKeys: readonly string[]
}): RotationPlan {
  const { poolSize, dayKeys } = input
  const postsPerDay = Math.max(1, Math.trunc(input.postsPerDay) || 1)
  const startIndices = assignStartIndices(input.connections, poolSize)
  const requiredPoolSize = postsPerDay * input.connections.length

  const assignments = new Map<string, number[]>()
  // dateKey -> poolIndex -> connections taking it
  const perDate = new Map<string, Map<number, string[]>>()

  for (const c of input.connections) {
    const start = startIndices.get(c.connectionId)
    if (start === undefined || poolSize <= 0) { assignments.set(c.connectionId, []); continue }
    const taken: number[] = []
    dayKeys.forEach((dk, d) => {
      for (let s = 0; s < postsPerDay; s++) {
        const idx = (start + d * postsPerDay + s) % poolSize
        taken.push(idx)
        const m = perDate.get(dk) ?? new Map<number, string[]>()
        m.set(idx, [...(m.get(idx) ?? []), c.connectionId])
        perDate.set(dk, m)
      }
    })
    assignments.set(c.connectionId, taken)
  }

  const collisions: RotationCollision[] = []
  for (const [dateKey, m] of perDate) {
    for (const [poolIndex, ids] of m) {
      if (ids.length > 1) collisions.push({ dateKey, poolIndex, connectionIds: ids })
    }
  }
  collisions.sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : a.poolIndex - b.poolIndex))

  return { assignments, startIndices, collisions, sufficient: collisions.length === 0, poolSize, requiredPoolSize }
}
