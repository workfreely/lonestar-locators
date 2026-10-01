// Follow-Up Agent — DISPATCHER (production entry point).
//
// Thin wrapper: binds the shared engine core to the Supabase-backed store. All
// orchestration logic lives in engine.ts so production and the dry-run simulator
// run the identical code path — only the store backing differs. The cron route
// calls tick(); enrollLifecycleRuns is exposed for the same reason enrollNewLeads
// always was (it replaced it — one producer now covers every lifecycle sequence).

import { enrollLifecycleRuns as engineEnroll, tick as engineTick, type TickSummary } from "./engine"
import { SupabaseFollowupStore } from "./stores/supabaseStore"

const store = new SupabaseFollowupStore()

export type { TickSummary }

export async function enrollLifecycleRuns(now: Date = new Date()): Promise<number> {
  return engineEnroll(store, now)
}

export async function tick(now: Date = new Date()): Promise<TickSummary> {
  return engineTick(store, now)
}
