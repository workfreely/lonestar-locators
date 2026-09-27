import Link from "next/link"
import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import { getOverview } from "@/lib/controlCenter/overview"
import { fmtInt, pctOf } from "@/lib/controlCenter/format"
import { Chip, NotWired, Num, Pct, Row, Seg } from "./_components/ui"
import { CC_BASE } from "@/lib/controlCenter/paths"

// Control Center → Overview: a command center answering three questions with status + counts only.
// Every number is read live from a real source (see lib/controlCenter/overview.ts). Signals without a
// reliable backend source render as "not wired" — never invented. Detail lives in the modules.
export const dynamic = "force-dynamic"
const PI = `${CC_BASE}/property-intelligence`

export default async function ControlCenterOverview() {
  await ensurePlatformAdminPage()
  const ov = await getOverview()
  const { pi, jobs, social, reviews, crons } = ov
  const primaryPct = pctOf(pi.populated, pi.total)
  const latestPiJob = jobs.rows[0]
  const followupCron = crons.find((c) => /followup-tick/.test(c.path))
  const metaCron = crons.find((c) => /meta-insights/.test(c.path))
  const socialQueued = (social.byStatus.scheduled ?? 0) + (social.byStatus.publishing ?? 0)
  const doingHeadline = jobs.running > 0 ? `${jobs.running} job${jobs.running === 1 ? "" : "s"} running.` : "No background jobs running."
  const cautions: string[] = []
  if (!social.available) cautions.push("Social Beast queue unavailable")
  if (!reviews.available) cautions.push("review queues unavailable")
  if (pi.changeRequestedPrimary + pi.changeRequestedBackup > 0) cautions.push("stranded change_requested")
  if (pi.imageStatus.unreachable > 0) cautions.push(`${pi.imageStatus.unreachable} Primary images unreachable`)

  return (
    <main className="content">
      <section className="glance" aria-label="Command center">
        {/* ── What is Beast doing? ── */}
        <section className="card busy">
          <span className="eyebrow">What is Beast doing?</span>
          <span className="ans">{doingHeadline}</span>
          <div className="rows">
            <Row t="Follow-Up Agent" d={followupCron ? `cron ${followupCron.schedule} · configured (runtime not instrumented)` : "cron not found in vercel.json"} right={<Chip tone={followupCron ? "accent" : "neutral"} dot>{followupCron ? "configured" : "unknown"}</Chip>} />
            <Row t="Property Image Intelligence" d={latestPiJob ? `last job: ${latestPiJob.job_type} · ${latestPiJob.status} · ${fmtInt(latestPiJob.processed)}/${fmtInt(latestPiJob.total)}` : jobs.available ? "no jobs recorded in property_enrichment_jobs" : "jobs table unavailable"} right={<Chip tone="warn" dot>production frozen</Chip>} />
            <Row t="Social Beast publisher" d={social.available ? `scheduled ${social.byStatus.scheduled ?? 0} · draft ${social.byStatus.draft ?? 0} · published ${social.byStatus.published ?? 0} · manual dispatch (no worker)` : "queue unavailable"} right={<Chip tone={socialQueued ? "info" : "neutral"}>{socialQueued ? `${socialQueued} queued` : "idle"}</Chip>} />
            <Row t="Meta insights sync" d={metaCron ? `cron ${metaCron.schedule} · configured` : "cron not found"} right={<Chip tone={metaCron ? "accent" : "neutral"} dot>{metaCron ? "configured" : "unknown"}</Chip>} />
            <Row t="Enrichment · Location resolver" d="manual · approved-only · nothing running" right={<Chip tone="neutral">idle</Chip>} />
          </div>
          <Link className="more" href={`${CC_BASE}/agents-jobs`}>All agents, runs &amp; schedules → Agents / Jobs</Link>
        </section>

        {/* ── What needs my attention? ── */}
        <section className="card attn">
          <span className="eyebrow">What needs my attention?</span>
          <span className="ans"><Num n={ov.attentionTotal} /> item{ov.attentionTotal === 1 ? "" : "s"} waiting on a human</span>
          <div className="rows">
            <Row t="Data conflicts awaiting your decision" d="property_conflict_review · legitimate disagreements, existing value preserved" right={<><Chip tone="crit">decide</Chip><Num n={reviews.available ? reviews.conflictsPending : null} /></>} />
            <Row t="Qualification matches pending" d="property_qualification_review · ambiguous catalog matches" right={<><Chip tone="info">match</Chip><Num n={reviews.available ? reviews.qualificationPending : null} /></>} />
            <Row t="Missing Primary images" d="official-site recovery paused at checkpoint" right={<><Chip tone="warn">missing</Chip><Num n={pi.missing} /></>} />
            <Row t="Stranded change_requested" d="primary / backup — should always be 0" right={<><Chip tone={pi.changeRequestedPrimary + pi.changeRequestedBackup ? "crit" : "good"}>{pi.changeRequestedPrimary + pi.changeRequestedBackup ? "fix" : "clean"}</Chip><span className="num">{pi.changeRequestedPrimary} / {pi.changeRequestedBackup}</span></>} />
            <Row t="Social posts needing attention" d="needs_attention state in the Social Beast queue" right={<><Chip tone={social.needsAttention ? "warn" : "neutral"}>{social.needsAttention ? "review" : "none"}</Chip><Num n={social.available ? social.needsAttention : null} /></>} />
          </div>
          <NotWired what="Good / Bad / Uncertain image classification" why="audit + human-review decisions are file-based, not persisted to the database" />
          <Link className="more" href={`${CC_BASE}/review-center`}>Full queues → Review Center · module inboxes</Link>
        </section>

        {/* ── Is everything healthy? ── */}
        <section className="card ok">
          <span className="eyebrow">Is everything healthy?</span>
          <span className="ans">{cautions.length ? `Yes — ${cautions.length} caution${cautions.length === 1 ? "" : "s"}` : "Yes"}</span>
          <div className="rows">
            <Row t="Catalog" d={`Dallas ${fmtInt(pi.markets.Dallas)} · Austin ${fmtInt(pi.markets.Austin)} · Houston ${fmtInt(pi.markets.Houston)} · San Antonio ${fmtInt(pi.markets["San Antonio"])} · no market ${fmtInt(pi.markets.none)}`} right={<Num n={pi.total} />} />
            <Row t="Primary images" d={`populated ${fmtInt(pi.populated)} · missing ${fmtInt(pi.missing)} · status valid ${fmtInt(pi.imageStatus.valid)} / unreachable ${fmtInt(pi.imageStatus.unreachable)}`} right={<Pct value={primaryPct} />} />
            <Seg label="Primary image coverage" parts={[{ w: primaryPct, tone: "good", title: "populated" }, { w: 100 - primaryPct, tone: "warn", title: "missing" }]} />
            <Row t="Fallback images" d="deferred to V2" right={<><Num n={pi.fallback} /><Pct value={pctOf(pi.fallback, pi.total)} /></>} />
            <Row t="Supabase · source of truth" d="catalog + PI tables readable" right={<Chip tone="good" dot>ok</Chip>} />
            <Row t="Scheduled crons" d={crons.map((c) => c.label).join(" · ") || "none found"} right={<Chip tone="accent">{crons.length} configured</Chip>} />
            <Row t="Social connections" d="connected publishing accounts" right={<Num n={social.connections} />} />
          </div>
          {cautions.length ? <p className="note"><b>Cautions:</b> {cautions.join(" · ")}</p> : null}
          <NotWired what="AI / API spend · service versions" why="no cost or version telemetry source yet" />
          <Link className="more" href={`${CC_BASE}/system`}>Service detail → System · business metrics → Analytics</Link>
        </section>
      </section>

      <p className="subnote">
        Overview shows status and counts only. Agent detail lives in <Link href={`${CC_BASE}/agents-jobs`}>Agents / Jobs</Link>, review queues in their modules and the <Link href={`${CC_BASE}/review-center`}>Review Center</Link>, property data in <Link href={PI}>Property Intelligence</Link>, and business analytics in Analytics.
      </p>
    </main>
  )
}
