// Automatic demo-exit on first real lead — pure/mocked unit tests (no DB, no
// email). Run: npx tsx scripts/leads/demoExit.test.ts
import { shouldExitDemoOnLead, exitDemoModeForOwner } from "@/lib/demo/demoExit"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

// A mock that records the update payload + .eq() filters and returns a canned
// result. `matchedRows` models how many profile rows the WHERE matched.
function mockClient(opts: { matchedRows?: number; error?: unknown } = {}) {
  const calls: { table?: string; update?: any; eq: [string, unknown][] } = { eq: [] }
  const builder: any = {
    update(payload: any) { calls.update = payload; return builder },
    eq(col: string, val: unknown) { calls.eq.push([col, val]); return builder },
    select(_c: string) {
      const rows = Array.from({ length: opts.matchedRows ?? 0 }, () => ({ id: "row" }))
      return Promise.resolve({ data: opts.error ? null : rows, error: opts.error ?? null })
    },
  }
  const client: any = { from(table: string) { calls.table = table; return builder } }
  return { client, calls }
}

async function main() {
  console.log("shouldExitDemoOnLead — trigger gate:")
  ok("new lead + attributed owner → exit", shouldExitDemoOnLead(true, "owner-1") === true)
  ok("NOT new (dup/failed handled upstream) → no exit", shouldExitDemoOnLead(false, "owner-1") === false)
  ok("no attributed owner (manual add / Lone Star) → no exit", shouldExitDemoOnLead(true, null) === false)
  ok("undefined owner → no exit", shouldExitDemoOnLead(true, undefined) === false)

  console.log("\nCASE A — first real lead, owner in demo → demo_mode flipped:")
  {
    const { client, calls } = mockClient({ matchedRows: 1 })
    const res = await exitDemoModeForOwner(client as any, "owner-A")
    ok("exited=true (a row was flipped)", res.exited === true)
    ok("targets profiles table", calls.table === "profiles")
    ok("sets demo_mode=false", JSON.stringify(calls.update) === JSON.stringify({ demo_mode: false }))
    ok("scoped to the owner id", calls.eq.some(([c, v]) => c === "id" && v === "owner-A"))
    ok("GUARDED by .eq(demo_mode,true) — idempotent/no-op safety", calls.eq.some(([c, v]) => c === "demo_mode" && v === true))
  }

  console.log("\nCASE C — already-live account (demo_mode=false) → no-op:")
  {
    const { client, calls } = mockClient({ matchedRows: 0 })
    const res = await exitDemoModeForOwner(client as any, "owner-C")
    ok("exited=false (WHERE demo_mode=true matched nothing)", res.exited === false)
    ok("still guarded by .eq(demo_mode,true)", calls.eq.some(([c, v]) => c === "demo_mode" && v === true))
  }

  console.log("\nCASE D — second real lead (already exited) → no-op, no demo reintroduced:")
  {
    const { client } = mockClient({ matchedRows: 0 })
    const res = await exitDemoModeForOwner(client as any, "owner-D")
    ok("exited=false, nothing changes", res.exited === false)
  }

  console.log("\nFailure isolation — a DB error never throws:")
  {
    const { client } = mockClient({ error: { message: "boom" } })
    const res = await exitDemoModeForOwner(client as any, "owner-E")
    ok("returns exited=false instead of throwing", res.exited === false)
  }

  console.log(`\nDemo-exit unit: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main()
