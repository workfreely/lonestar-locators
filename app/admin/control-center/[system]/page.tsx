import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import { getOverview } from "@/lib/controlCenter/overview"
import { CC_BASE, PI_BASE } from "@/lib/controlCenter/paths"
import { fmtDateTime, fmtInt } from "@/lib/controlCenter/format"
import { Card, Chip, Empty, NotWired, Num, Row, SecHead, Tile } from "../_components/ui"

// Control Center → the other Beast systems. Rule: connect what exists, never fake an operational
// screen. Social Beast / Security Beast redirect to their EXISTING apps. Agents / Jobs, Review Center and
// System read real sources (jobs table, review queues, social queue, cron config). Property Search,
// Follow-Up, Import / Export and Analytics show an honest not-yet-wired state that names where the
// existing functionality lives — normal Locator Beast workflows are NOT duplicated here.
export const dynamic = "force-dynamic"

const KNOWN = new Set(["agents-jobs", "review-center", "system", "property-search", "follow-up", "import-export", "analytics", "social-beast", "security-beast"])

export default async function SystemPage({ params }: { params: Promise<{ system: string }> }) {
  // ONE authorization pattern for every Control Center route: the platform-admin gate runs FIRST —
  // before any redirect to an existing app and before 404ing unknown slugs.
  await ensurePlatformAdminPage()
  const { system } = await params
  if (system === "social-beast") redirect("/admin/social-autopilot")
  if (system === "security-beast") redirect("/admin/security")
  if (!KNOWN.has(system)) notFound()
  const ov = await getOverview()

  if (system === "agents-jobs") {
    return (
      <main className="content">
        <div className="grid g4">
          <Tile k="Jobs running" v={<Num n={ov.jobs.available ? ov.jobs.running : null} />} s="property_enrichment_jobs · status = running" />
          <Tile k="Jobs recorded" v={<Num n={ov.jobs.available ? ov.jobs.rows.length : null} />} s="latest 10 shown" />
          <Tile k="Configured crons" v={<Num n={ov.crons.length} />} s="vercel.json · configured, not runtime-verified" />
          <Tile k="Social posts queued" v={<Num n={ov.social.available ? (ov.social.byStatus.scheduled ?? 0) + (ov.social.byStatus.publishing ?? 0) : null} />} s="scheduled + publishing · manual dispatch" />
        </div>
        <Card>
          <SecHead eyebrow="Durable job model" note="property_enrichment_jobs · Run / Pause / Resume / Stop are backend states; no runner service or UI control exists yet" />
          {!ov.jobs.available ? <Empty>Jobs table unavailable.</Empty> : ov.jobs.rows.length === 0 ? <Empty>No jobs recorded.</Empty> : (
            <table><thead><tr><th>Job</th><th>Status</th><th className="r">Processed / total</th><th className="r">Added · Updated · Skipped</th><th className="r">Conflicts · Failed</th><th>Created</th></tr></thead><tbody>
              {ov.jobs.rows.map((j) => <tr key={j.id}><td>{j.job_type}{j.dry_run ? <span className="d">dry run</span> : null}</td><td><Chip tone={j.status === "running" ? "accent" : j.status === "failed" ? "crit" : j.status === "completed" ? "good" : "neutral"}>{j.status}</Chip></td><td className="r num">{fmtInt(j.processed)} / {fmtInt(j.total)}</td><td className="r num">{fmtInt(j.added)} · {fmtInt(j.updated)} · {fmtInt(j.skipped)}</td><td className="r num">{fmtInt(j.conflicts)} · {fmtInt(j.failed)}</td><td className="muted">{fmtDateTime(j.created_at)}</td></tr>)}
            </tbody></table>
          )}
          <div style={{ marginTop: 10 }}><NotWired what="Run · Pause · Resume · Stop" why="requires the always-on job-runner service (Mac Mini host) — observability only in V1" /></div>
        </Card>
        <div className="grid g2">
          <Card>
            <SecHead eyebrow="Scheduled automations" note="from vercel.json — configured schedules, not execution telemetry" />
            <div className="rows">{ov.crons.map((c) => <Row key={c.path} t={c.label} d={c.path} right={<Chip tone="accent">{c.schedule}</Chip>} />)}</div>
          </Card>
          <Card>
            <SecHead eyebrow="Agents without a runtime signal yet" note="exist as CLI scripts / app code" />
            <div className="rows">
              <Row t="Property Image Intelligence v1.1" d="production processing frozen at checkpoint" right={<Chip tone="warn">frozen</Chip>} />
              <Row t="Property Enrichment · Website Resolver · Google Identity" d="CLI scripts through the safe writer" right={<Chip tone="neutral">manual</Chip>} />
              <Row t="Location Intelligence resolver" d="approved-only runs" right={<Chip tone="neutral">manual</Chip>} />
              <Row t="Social Beast render / publish workers" d="not built — posts publish on manual trigger" right={<Chip tone="neutral">designed</Chip>} />
            </div>
            <NotWired what="AI / API cost per run" why="no cost telemetry source yet" />
          </Card>
        </div>
      </main>
    )
  }

  if (system === "review-center") {
    const r = ov.reviews
    return (
      <main className="content">
        <div className="grid g4">
          <Tile k="Data conflicts" v={<Num n={r.available ? r.conflictsPending : null} />} s="awaiting your decision" chip={<Chip tone="crit">decide</Chip>} />
          <Tile k="Qualification matches" v={<Num n={r.available ? r.qualificationPending : null} />} s="pending · identity never guessed" chip={<Chip tone="info">match</Chip>} />
          <Tile k="Social posts" v={<Num n={ov.social.available ? ov.social.needsAttention : null} />} s="needs_attention" chip={<Chip tone={ov.social.needsAttention ? "warn" : "neutral"}>queue</Chip>} />
          <Tile k="Missing Primary images" v={<Num n={ov.pi.missing} />} s="recovery paused" chip={<Chip tone="warn">missing</Chip>} />
        </div>
        <Card>
          <SecHead eyebrow="One inbox for exceptions" note="automate the normal case · escalate exceptions · decisions are kept" />
          <div className="rows">
            <Row t="Property data conflicts" d="property_conflict_review — action them in Property Intelligence → Review (existing gated API)" right={<Link className="btn" href={`${PI_BASE}/review`}>Open →</Link>} />
            <Row t="Qualification / approval matches" d="property_qualification_review — read-only list in Property Intelligence → Review" right={<Link className="btn ghost" href={`${PI_BASE}/review`}>View →</Link>} />
            <Row t="Social Beast queue" d="needs_attention posts live in the existing Social Beast app" right={<Link className="btn ghost" href="/admin/social-autopilot/queue">Open ↗</Link>} />
            <Row t="Image review" d="Good / Bad / Uncertain decisions are file-based today" right={<Chip tone="neutral">not wired</Chip>} />
          </div>
          <div className="rows" style={{ marginTop: 6 }}>
            <NotWired what="New property discovery (Add · Skip · Exclude · Pending)" why="discovery agent + exclusion registry are designed, not built" />
            <NotWired what="Identity matches · feature candidates · search/matching · follow-up handoffs · security" why="no durable review queues exist for these yet" />
          </div>
        </Card>
      </main>
    )
  }

  if (system === "system") {
    return (
      <main className="content">
        <div className="grid g4">
          <Tile k="Supabase" v={<Chip tone="good" dot>reachable</Chip>} s="canonical source of truth · PI tables readable" />
          <Tile k="Configured crons" v={<Num n={ov.crons.length} />} s="vercel.json" />
          <Tile k="Catalog" v={<Num n={ov.pi.total} />} s="active properties" />
          <Tile k="Snapshot age" v={<span className="faint" style={{ fontSize: 16 }}>{fmtDateTime(ov.generatedAt)}</span>} s="overview cache refreshes every 60s" />
        </div>
        <div className="grid g2">
          <Card>
            <SecHead eyebrow="Services" note="what this surface can currently observe" />
            <div className="rows">
              <Row t="Supabase (LB project)" d="reads succeeded this request" right={<Chip tone="good" dot>ok</Chip>} />
              <Row t="Vercel crons" d={ov.crons.map((c) => `${c.label} (${c.schedule})`).join(" · ")} right={<Chip tone="accent">configured</Chip>} />
              <Row t="Mac Mini execution host" d="planned always-on host for Beast Sync, Follow-Up, Social workers, PI jobs — the Control Center must not depend on a laptop staying open" right={<Chip tone="neutral">planned</Chip>} />
            </div>
          </Card>
          <Card>
            <SecHead eyebrow="Not yet instrumented" />
            <div className="rows">
              <NotWired what="Service / API health checks (Google, Anthropic, Resend, Meta, TikTok/Instagram)" why="no health-probe source" />
              <NotWired what="Errors · usage / cost · versions / deployments · backups" why="no telemetry or deployment-record source wired" />
            </div>
          </Card>
        </div>
      </main>
    )
  }

  const copy: Record<string, { title: string; what: string; why: string; existing?: { label: string; href: string } }> = {
    "property-search": { title: "Property Search", what: "Search inspector / matching-brain debugger", why: "matching filters (lib/matching) and location clusters exist inside the app; no operator surface is built yet (V1.5)" },
    "follow-up": { title: "Follow-Up", what: "Scheduled · sent · cancelled · failed · replied · needs-human, with the agent's reasoning", why: `the Follow-Up engine is live in the product (cron tick ${ov.crons.find((c) => /followup-tick/.test(c.path))?.schedule ?? "—"}); an operator view over lead_next_actions is not built yet (V1.5)` },
    "import-export": { title: "Import / Export", what: "Upload → Analyze → Match → Map → Validate → Preview → Import; presets + provenance columns on export", why: "requirements are defined; the round-trip pipeline over the safe writer is not built yet (V1.5)", existing: { label: "Import Leads (existing LB workflow — not property intelligence)", href: "/admin/import" } },
    analytics: { title: "Analytics", what: "Property / agent / search / social analytics and marketing attribution", why: "Sales Analytics is a normal Locator Beast workflow and is intentionally not duplicated here; property/agent/search analytics are V2", existing: { label: "Sales Analytics (existing LB workflow)", href: "/admin/analytics" } },
  }
  const c = copy[system]
  return (
    <main className="content">
      <Card>
        <SecHead eyebrow={c.title} note="honest state — nothing operational is faked here" />
        <NotWired what={c.what} why={c.why} />
        {c.existing ? <p className="subnote" style={{ marginTop: 10 }}>Related existing workflow: <Link href={c.existing.href}>{c.existing.label}</Link></p> : null}
        <p className="subnote" style={{ marginTop: 6 }}>Back to <Link href={CC_BASE}>Overview</Link>.</p>
      </Card>
    </main>
  )
}
