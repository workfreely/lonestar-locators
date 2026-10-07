// v1 rotation: one ordered ready pool, one start index per connected account.
//
// The invariant: two connected accounts must never be assigned the same source on the same date
// while inventory allows otherwise — and when inventory does NOT allow it, that must be REPORTED,
// never silently absorbed.
import { assignStartIndices, rotatePool, planRotation, circularGap } from "@/lib/social/autopilotRotation"
import { dayKeysFrom } from "@/lib/social/recurrence"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log("  ✓", l) } else { fail++; console.log("  ✗", l + (d ? ` — ${d}` : "")) } }
const DAYS = dayKeysFrom("2026-10-08", 30)
const conn = (id: string, startIndex: number | null = null) => ({ connectionId: id, startIndex })
const PRIMARY = "aaaa1111-0000-4000-8000-000000000001"
const SECOND  = "bbbb2222-0000-4000-8000-000000000002"
const THIRD   = "cccc3333-0000-4000-8000-000000000003"
const FOURTH  = "dddd4444-0000-4000-8000-000000000004"

console.log("the worked example — 60-post pool, primary pinned at 0:")
{
  const s = assignStartIndices([conn(PRIMARY, 0), conn(SECOND)], 60)
  ok("primary starts at index 0", s.get(PRIMARY) === 0)
  ok("second starts ~halfway (30)", s.get(SECOND) === 30, String(s.get(SECOND)))
  const pool = Array.from({ length: 60 }, (_, i) => i + 1)   // 1..60
  const a = rotatePool(pool, s.get(PRIMARY)!)
  const b = rotatePool(pool, s.get(SECOND)!)
  ok("primary sees 1…60", a[0] === 1 && a[59] === 60)
  ok("second sees 31…60 then 1…30", b[0] === 31 && b[29] === 60 && b[30] === 1 && b[59] === 30)
  ok("rotation PRESERVES order, it does not reorder", b.join() === [...pool.slice(30), ...pool.slice(0, 30)].join())
  ok("both accounts see the whole pool", new Set(a).size === 60 && new Set(b).size === 60)
}

console.log("\nadding an account must not move the existing ones:")
{
  const two = assignStartIndices([conn(PRIMARY, 0), conn(SECOND)], 60)
  const three = assignStartIndices([conn(PRIMARY, 0), conn(SECOND), conn(THIRD)], 60)
  const four = assignStartIndices([conn(PRIMARY, 0), conn(SECOND), conn(THIRD), conn(FOURTH)], 60)
  // This is why placement is greedy max-min rather than an even i*n/k spread: even spreading
  // recomputes everyone, so connecting a third account would silently move the first two and make
  // per-account performance incomparable across the change.
  ok("primary unchanged when a 3rd joins", three.get(PRIMARY) === two.get(PRIMARY))
  ok("second unchanged when a 3rd joins", three.get(SECOND) === two.get(SECOND), `${two.get(SECOND)} -> ${three.get(SECOND)}`)
  ok("primary + second unchanged when a 4th joins", four.get(PRIMARY) === two.get(PRIMARY) && four.get(SECOND) === two.get(SECOND))
  ok("the 3rd lands between them", three.get(THIRD) === 15, String(three.get(THIRD)))
  ok("the 4th fills the remaining gap", four.get(FOURTH) === 45, String(four.get(FOURTH)))
}

console.log("\ndeterminism:")
{
  const a = assignStartIndices([conn(PRIMARY, 0), conn(SECOND), conn(THIRD)], 60)
  const b = assignStartIndices([conn(THIRD), conn(SECOND), conn(PRIMARY, 0)], 60)   // different input order
  ok("input order does not change the result", [PRIMARY, SECOND, THIRD].every((k) => a.get(k) === b.get(k)))
  ok("repeated calls agree", assignStartIndices([conn(SECOND)], 37).get(SECOND) === assignStartIndices([conn(SECOND)], 37).get(SECOND))
}

console.log("\nNO same-date collisions across a 30-day horizon when inventory allows:")
for (const [poolSize, k] of [[60, 2], [60, 3], [60, 4], [20, 2], [20, 3], [9, 3], [8, 4], [8, 2], [4, 2]] as const) {
  const conns = [conn(PRIMARY, 0), conn(SECOND), conn(THIRD), conn(FOURTH)].slice(0, k)
  const plan = planRotation({ connections: conns, poolSize, postsPerDay: 2, dayKeys: DAYS })
  ok(`pool=${poolSize} accounts=${k}: no collisions over 30 days`, plan.sufficient && plan.collisions.length === 0,
    plan.collisions[0] ? `${plan.collisions[0].dateKey} idx ${plan.collisions[0].poolIndex}` : "")
}

console.log("\nwhen inventory is too small it is REPORTED, not hidden:")
{
  const conns = [conn(PRIMARY, 0), conn(SECOND)]
  const plan = planRotation({ connections: conns, poolSize: 3, postsPerDay: 2, dayKeys: DAYS })
  ok("a 3-post pool for 2 accounts is reported insufficient", plan.sufficient === false)
  ok("collisions are listed with the date and pool index", plan.collisions.length > 0 && !!plan.collisions[0].dateKey)
  ok("…and name BOTH colliding connections", plan.collisions[0].connectionIds.length === 2)
  ok("the required pool size is stated", plan.requiredPoolSize === 4, String(plan.requiredPoolSize))
  ok("the actual pool size is stated", plan.poolSize === 3)
  // The rule: poolSize >= postsPerDay * accounts. Verified at the boundary, both sides.
  ok("exactly at the boundary (4 posts, 2 accounts) is sufficient",
    planRotation({ connections: conns, poolSize: 4, postsPerDay: 2, dayKeys: DAYS }).sufficient)
  ok("one below the boundary is not",
    planRotation({ connections: conns, poolSize: 3, postsPerDay: 2, dayKeys: DAYS }).sufficient === false)
  // Your CURRENT inventory: 7 rendered posts.
  const real = planRotation({ connections: conns, poolSize: 7, postsPerDay: 2, dayKeys: DAYS })
  ok("today's 7 rendered posts support 2 accounts collision-free", real.sufficient)
}

console.log("\nstability vs optimal packing — a real trade-off, stated not hidden:")
{
  // Greedy placement keeps existing accounts fixed, but it cannot know a third account is coming.
  // Pinned 0, the second goes to the furthest point (3 of 6) — which then leaves only gap-1 slots.
  // An even i*n/k spread would pack 3 accounts into a 6-pool perfectly as [0,2,4], but it would
  // RELOCATE accounts 1 and 2 to do it. Stability was chosen; the cost is that a pool sized exactly
  // at the minimum can still collide, and when it does it is REPORTED rather than absorbed.
  const conns = [conn(PRIMARY, 0), conn(SECOND), conn(THIRD)]
  const plan = planRotation({ connections: conns, poolSize: 6, postsPerDay: 2, dayKeys: DAYS })
  ok("a pool at exactly the minimum can still collide under greedy placement", plan.sufficient === false)
  ok("…and it says so, with required vs actual", plan.requiredPoolSize === 6 && plan.poolSize === 6)
  ok("one extra post above the minimum resolves it",
    planRotation({ connections: conns, poolSize: 9, postsPerDay: 2, dayKeys: DAYS }).sufficient)
  // Pinning is always available as the escape hatch when packing matters more than stability.
  ok("explicit pins achieve the optimal packing when you want it",
    planRotation({ connections: [conn(PRIMARY, 0), conn(SECOND, 2), conn(THIRD, 4)], poolSize: 6, postsPerDay: 2, dayKeys: DAYS }).sufficient)
}

console.log("\nthe gap rule is what makes this decidable up front:")
{
  // Because every account advances at the same rate, the circular gap never changes — so a
  // horizon-wide guarantee follows from the start indices alone.
  const s = assignStartIndices([conn(PRIMARY, 0), conn(SECOND)], 60)
  ok("gap >= postsPerDay ⇒ collision-free", circularGap(s.get(PRIMARY)!, s.get(SECOND)!, 60) >= 2)
  const tight = assignStartIndices([conn(PRIMARY, 0), conn(SECOND, 1)], 60)   // deliberately pinned adjacent
  const plan = planRotation({ connections: [conn(PRIMARY, 0), conn(SECOND, 1)], poolSize: 60, postsPerDay: 2, dayKeys: DAYS })
  ok("gap 1 < postsPerDay 2 ⇒ collisions, even in a LARGE pool",
    circularGap(tight.get(PRIMARY)!, tight.get(SECOND)!, 60) === 1 && !plan.sufficient)
  ok("…so a big pool alone does not guarantee safety — the pins do", plan.collisions.length > 0)
}

console.log("\nedge cases:")
ok("empty pool → no assignments, no crash", assignStartIndices([conn(PRIMARY)], 0).size === 0)
ok("empty pool → plan is empty, not sufficient-by-vacuum",
  planRotation({ connections: [conn(PRIMARY)], poolSize: 0, postsPerDay: 2, dayKeys: DAYS }).assignments.get(PRIMARY)!.length === 0)
ok("no connections → nothing to plan", planRotation({ connections: [], poolSize: 10, postsPerDay: 2, dayKeys: DAYS }).collisions.length === 0)
ok("single account can never collide with itself on a date",
  planRotation({ connections: [conn(PRIMARY, 0)], poolSize: 10, postsPerDay: 2, dayKeys: DAYS }).sufficient)
ok("an out-of-range pin wraps into the pool", assignStartIndices([conn(PRIMARY, 125)], 60).get(PRIMARY) === 5)
ok("a negative pin wraps too", assignStartIndices([conn(PRIMARY, -1)], 60).get(PRIMARY) === 59)
ok("rotatePool on an empty pool returns empty", rotatePool([], 3).length === 0)

console.log(`\nAutopilot rotation: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
