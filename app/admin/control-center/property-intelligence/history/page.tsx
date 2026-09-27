import Link from "next/link"
import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { PI_BASE } from "@/lib/controlCenter/paths"
import { fmtDateTime, fmtInt, labelize, toText, truncate } from "@/lib/controlCenter/format"
import { Card, Chip, Empty, SecHead, Tile, Num } from "../../_components/ui"

// Property Intelligence → History: the EXISTING append-only enrichment event trail
// (property_enrichment_events: what changed, old → new, source, agent/job, reason, when). Read-only.
// Nothing is manufactured — this table is written by the safe writer on every enrichment decision.
export const dynamic = "force-dynamic"
const PAGE = 100
type SP = { action?: string; page?: string }
type Ev = { id: number; job_id: string; place_id: string; field_name: string; action: string; old_value: string | null; new_value: string | null; source_type: string | null; reason: string | null; created_at: string }
const ACTIONS = ["written", "skipped", "rejected"] as const
const head = { count: "exact" as const, head: true }
async function cnt(q: PromiseLike<{ count: number | null; error: { message: string } | null }>) { const r = await q; return r.error ? null : (r.count ?? 0) }

export default async function HistoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  await ensurePlatformAdminPage()
  const sp = await searchParams
  const action = ACTIONS.includes(sp.action as typeof ACTIONS[number]) ? (sp.action as string) : ""
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1)

  const [total, written, skipped, rejected] = await Promise.all([
    cnt(supabaseAdmin.from("property_enrichment_events").select("*", head)),
    cnt(supabaseAdmin.from("property_enrichment_events").select("*", head).eq("action", "written")),
    cnt(supabaseAdmin.from("property_enrichment_events").select("*", head).eq("action", "skipped")),
    cnt(supabaseAdmin.from("property_enrichment_events").select("*", head).eq("action", "rejected")),
  ])
  let q = supabaseAdmin.from("property_enrichment_events").select("id, job_id, place_id, field_name, action, old_value, new_value, source_type, reason, created_at", { count: "exact" })
  if (action) q = q.eq("action", action)
  const { data, count, error } = await q.order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1)
  const events = (data ?? []) as Ev[]
  const ids = [...new Set(events.map((e) => e.place_id))]
  const names = new Map<string, string>()
  if (ids.length) {
    const { data: nm } = await supabaseAdmin.from("property_catalog").select("place_id, property_name").in("place_id", ids)
    for (const n of (nm ?? []) as { place_id: string; property_name: string | null }[]) names.set(n.place_id, toText(n.property_name) ?? n.place_id)
  }
  const shown = count ?? 0
  const pages = Math.max(1, Math.ceil(shown / PAGE))
  const link = (p: number, a = action) => `${PI_BASE}/history?${new URLSearchParams({ ...(a ? { action: a } : {}), page: String(p) }).toString()}`

  return (
    <>
      <div className="grid g4">
        <Tile k="All enrichment events" v={<Num n={total} />} s="property_enrichment_events" />
        <Tile k="Written" v={<Num n={written} />} s="a value was filled or refreshed" chip={<Chip tone="good">written</Chip>} />
        <Tile k="Skipped" v={<Num n={skipped} />} s="preserved · unchanged · conflict · unverified" chip={<Chip tone="neutral">skipped</Chip>} />
        <Tile k="Rejected" v={<Num n={rejected} />} s="firewall · locked slot · not writable" chip={<Chip tone="crit">rejected</Chip>} />
      </div>

      <Card>
        <SecHead eyebrow="Event trail" note={`${fmtInt(shown)} event${shown === 1 ? "" : "s"}${action ? ` · action = ${action}` : ""} · newest first · page ${page} of ${pages}`} />
        <div className="filters" style={{ marginBottom: 10 }}>
          <Link className={`btn${action ? " ghost" : ""}`} href={link(1, "")}>All</Link>
          {ACTIONS.map((a) => <Link key={a} className={`btn${action === a ? "" : " ghost"}`} href={link(1, a)}>{a}</Link>)}
        </div>
        {error ? <Empty>Could not load events: {error.message}</Empty> : events.length === 0 ? <Empty>No events.</Empty> : (
          <table>
            <thead><tr><th>When</th><th>Property</th><th>Field</th><th>Action</th><th>Old → New</th><th>Source</th><th>Reason · job</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDateTime(e.created_at)}</td>
                  <td><Link href={`${PI_BASE}/properties/${encodeURIComponent(e.place_id)}`} style={{ fontWeight: 500 }}>{names.get(e.place_id) ?? e.place_id}</Link></td>
                  <td>{labelize(e.field_name)}</td>
                  <td><Chip tone={e.action === "written" ? "good" : e.action === "rejected" ? "crit" : "neutral"}>{e.action}</Chip></td>
                  <td style={{ fontSize: 12 }}>{truncate(e.old_value, 36)} → {truncate(e.new_value, 36)}</td>
                  <td className="muted">{e.source_type ?? "—"}</td>
                  <td className="faint" style={{ fontSize: 12 }}>{e.reason ?? "—"}<span className="d">{e.job_id}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {pages > 1 ? <div className="pager" style={{ marginTop: 12 }}>{page > 1 ? <Link href={link(page - 1)}>← Newer</Link> : null}<span>page {page} of {pages}</span>{page < pages ? <Link href={link(page + 1)}>Older →</Link> : null}</div> : null}
      </Card>
    </>
  )
}
