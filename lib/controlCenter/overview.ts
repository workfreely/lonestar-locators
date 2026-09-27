// Control Center — Overview signals (READ-ONLY, server-side).
//
// Answers "What is Beast doing? / What needs my attention? / Is everything healthy?" from sources
// that actually exist. Anything without a reliable backend source is left for the UI to render as
// "not wired" — never invented. Sources:
//   • property_enrichment_jobs         (durable job model; Run/Pause/Stop runner not built)
//   • social_posts / social_connections (Social Beast queue + connected accounts)
//   • property_conflict_review / property_qualification_review (human review queues)
//   • vercel.json crons                (configured schedules — CONFIGURED, not runtime-verified)
//   • getPiMetrics()                   (catalog / images)
import fs from "node:fs"
import path from "node:path"
import { unstable_cache } from "next/cache"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { POST_STATUSES } from "@/lib/social/postStatus"
import { getPiMetrics, type PiMetrics } from "./piMetrics"

export type JobRow = {
  id: string; job_type: string; status: string; dry_run: boolean
  total: number; processed: number; added: number; updated: number; skipped: number; conflicts: number; failed: number
  created_at: string; updated_at: string | null
}
export type Cron = { path: string; schedule: string; label: string }

export type OverviewData = {
  generatedAt: string
  pi: PiMetrics
  supabaseOk: boolean
  jobs: { rows: JobRow[]; running: number; available: boolean }
  social: { byStatus: Record<string, number>; needsAttention: number; connections: number | null; available: boolean }
  reviews: { conflictsPending: number; conflictsAutoResolved: number; conflictsResolved: number; qualificationPending: number; qualificationTotal: number; available: boolean }
  crons: Cron[]
  attentionTotal: number
}

const head = { count: "exact" as const, head: true }
async function cnt(q: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const r = await q; if (r.error) throw new Error(r.error.message); return r.count ?? 0
}

function cronLabel(p: string): string {
  if (/followup-tick/.test(p)) return "Follow-Up Agent tick"
  if (/send-3day-followups/.test(p)) return "3-day follow-ups"
  if (/auto-archive-no-response/.test(p)) return "Auto-archive (no response)"
  if (/archive-monthly-closed/.test(p)) return "Archive monthly closed"
  if (/trial-ending/.test(p)) return "Trial-ending reminders"
  if (/meta-insights/.test(p)) return "Meta insights sync"
  return p
}
function readCrons(): Cron[] {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")) as { crons?: { path: string; schedule: string }[] }
    return (raw.crons ?? []).map((c) => ({ ...c, label: cronLabel(c.path) }))
  } catch { return [] }
}

/** Uncached compute (exported for verification scripts; pages use the cached getOverview). */
export async function computeOverview(piOverride?: PiMetrics): Promise<OverviewData> {
  // In the app this reuses the 5-minute PI metrics cache; verification scripts pass a precomputed object.
  const pi = piOverride ?? await getPiMetrics()

  // Jobs (durable model). Table may be empty; that is a real, reportable state.
  let jobs: OverviewData["jobs"] = { rows: [], running: 0, available: false }
  try {
    const { data, error } = await supabaseAdmin.from("property_enrichment_jobs")
      .select("id, job_type, status, dry_run, total, processed, added, updated, skipped, conflicts, failed, created_at, updated_at")
      .order("created_at", { ascending: false }).limit(10)
    if (!error) jobs = { rows: (data ?? []) as JobRow[], running: (data ?? []).filter((r: { status: string }) => r.status === "running").length, available: true }
  } catch { /* leave unavailable */ }

  // Social Beast queue + accounts
  let social: OverviewData["social"] = { byStatus: {}, needsAttention: 0, connections: null, available: false }
  try {
    const byStatus: Record<string, number> = {}
    for (const s of POST_STATUSES) byStatus[s] = await cnt(supabaseAdmin.from("social_posts").select("*", head).eq("status", s))
    let connections: number | null = null
    try { connections = await cnt(supabaseAdmin.from("social_connections").select("*", head)) } catch { connections = null }
    social = { byStatus, needsAttention: byStatus.needs_attention ?? 0, connections, available: true }
  } catch { /* leave unavailable */ }

  // Human review queues
  let reviews: OverviewData["reviews"] = { conflictsPending: 0, conflictsAutoResolved: 0, conflictsResolved: 0, qualificationPending: 0, qualificationTotal: 0, available: false }
  try {
    const [cp, car, cap, cr, qp, qt] = await Promise.all([
      cnt(supabaseAdmin.from("property_conflict_review").select("*", head).eq("disposition", "preserved_pending_review")),
      cnt(supabaseAdmin.from("property_conflict_review").select("*", head).eq("disposition", "auto_refreshed")),
      cnt(supabaseAdmin.from("property_conflict_review").select("*", head).eq("disposition", "auto_replaced")),
      cnt(supabaseAdmin.from("property_conflict_review").select("*", head).eq("disposition", "resolved")),
      cnt(supabaseAdmin.from("property_qualification_review").select("*", head).eq("status", "pending")),
      cnt(supabaseAdmin.from("property_qualification_review").select("*", head)),
    ])
    reviews = { conflictsPending: cp, conflictsAutoResolved: car + cap, conflictsResolved: cr, qualificationPending: qp, qualificationTotal: qt, available: true }
  } catch { /* leave unavailable */ }

  const attentionTotal = reviews.conflictsPending + reviews.qualificationPending + social.needsAttention + pi.changeRequestedPrimary + pi.changeRequestedBackup

  return { generatedAt: new Date().toISOString(), pi, supabaseOk: true, jobs, social, reviews, crons: readCrons(), attentionTotal }
}

export const getOverview = unstable_cache(computeOverview, ["cc-overview-v1"], { revalidate: 60, tags: ["cc-overview"] })
