import Link from "next/link"
import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import { getPiMetrics } from "@/lib/controlCenter/piMetrics"
import { getOverview } from "@/lib/controlCenter/overview"
import { PI_BASE } from "@/lib/controlCenter/paths"
import { fmtDate, fmtInt, pctOf, timeAgo } from "@/lib/controlCenter/format"
import { Card, Chip, CovRow, Num, Pct, Row, SecHead, Seg, Tile } from "../_components/ui"

// Property Intelligence → Overview: a snapshot, not a report. Every figure is live from the canonical
// source named in its row's title attribute (see lib/controlCenter/piMetrics.ts).
export const dynamic = "force-dynamic"

export default async function PropertyIntelligenceOverview() {
  await ensurePlatformAdminPage()
  const [m, ov] = await Promise.all([getPiMetrics(), getOverview()])
  const primaryPct = pctOf(m.populated, m.total)
  const stranded = m.changeRequestedPrimary + m.changeRequestedBackup
  return (
    <>
      <section className="sec">
        <SecHead eyebrow="Property Intelligence" note={`${fmtInt(m.total)} properties · ~380 canonical fields · live from Supabase · computed ${timeAgo(m.generatedAt)}`} />
        <div className="grid g4">
          <Tile k="Primary image" v={<Pct value={primaryPct} />} s={`${fmtInt(m.populated)} populated · ${fmtInt(m.missing)} missing`} />
          <Tile k="Fallback image" v={<Pct value={pctOf(m.fallback, m.total)} />} s={`${fmtInt(m.fallback)} · recovery deferred to V2`} />
          <Tile k="v1.1 image writes" v={<Num n={m.v11Writes} />} s={`${fmtInt(m.v10Writes)} written by v1.0`} />
          <Tile k="Open data conflicts" v={<Num n={ov.reviews.available ? ov.reviews.conflictsPending : null} />} s={<Link href={`${PI_BASE}/review`}>awaiting your decision → Review</Link>} />
        </div>
      </section>

      <div className="grid g2">
        <Card>
          <SecHead eyebrow="Data completeness by category" note="% populated — live · hover a row for its canonical source" />
          <div>
            {m.categories.map((c) => <CovRow key={c.key} label={c.label} count={c.count} total={m.total} note={c.note} source={c.source} na={c.na} />)}
          </div>
          <p className="note" style={{ marginTop: 10 }}>
            <b>⚠ Classification.</b> Counted from <code>inventory_type</code> · <code>structural_scale</code> · <code>property_grade</code> · <code>classification_tags</code> on the catalog. The <code>property_attributes</code> dictionary no longer carries <code>building_style</code> / <code>residential_type:*</code> keys (dropped when migration <code>20260925000008</code> re-seeded the 138 feature terms), so Classification is not sourced from the attribute model. Features is unaffected.
          </p>
          {m.distinctErrors.length ? <p className="note"><b>Source error:</b> {m.distinctErrors.join(" · ")}</p> : null}
        </Card>

        <div className="grid" style={{ gridTemplateColumns: "1fr", alignContent: "start" }}>
          <Card>
            <SecHead eyebrow="Primary image status" note="canonical slot + status columns" />
            <Seg height={14} label="Primary image status" parts={[{ w: primaryPct, tone: "good", title: "populated" }, { w: 100 - primaryPct, tone: "warn", title: "missing" }]} />
            <div className="rows" style={{ marginTop: 6 }}>
              <Row t="Populated" d="property_image_url present · image_selection_state keep" right={<><Chip tone="good">keep</Chip><Num n={m.populated} /></>} />
              <Row t="Missing" d="image_selection_state missing · recovery paused" right={<><Chip tone="warn">recover</Chip><Num n={m.missing} /></>} />
              <Row t="Status: valid / unreachable / no_image" d="property_image_status (last technical check)" right={<span className="num">{fmtInt(m.imageStatus.valid)} / {fmtInt(m.imageStatus.unreachable)} / {fmtInt(m.imageStatus.no_image)}</span>} />
              <Row t="Stranded change_requested" d="primary / backup" right={<><Chip tone={stranded ? "crit" : "good"}>{stranded ? "fix" : "clean"}</Chip><span className="num">{m.changeRequestedPrimary} / {m.changeRequestedBackup}</span></>} />
            </div>
            <p className="note" style={{ marginTop: 8 }}>Good / Bad / Uncertain classification lives in file-based audit + human-review ledgers and is <b style={{ color: "var(--ink-3)" }}>not persisted</b> to the database, so it is not shown here. See <Link href={`${PI_BASE}/images`}>Images</Link>.</p>
          </Card>

          <Card>
            <SecHead eyebrow="Safety & health" note="the UI requests · the backend decides" />
            <div className="inv">
              {["commission firewall", "per-slot image locks", "change_requested only", "no-churn on v1.1 rows", "human-GOOD immutable", "v1.0 engine frozen", "preserve-by-default", "Unknown ≠ No"].map((t) => <Chip key={t} tone="accent">{t}</Chip>)}
            </div>
            <div className="rows" style={{ marginTop: 8 }}>
              <Row t="Write safety" d="stranded change_requested · primary / backup" right={<span className="num">{m.changeRequestedPrimary} / {m.changeRequestedBackup}</span>} />
              <Row t="v1.1 image writes" d="algo=property-image-intelligence-v1.1 in provenance" right={<Num n={m.v11Writes} />} />
              <Row t="Fallback images" d={`${fmtInt(m.fallback)} populated · deferred to V2`} right={<Pct value={pctOf(m.fallback, m.total)} />} />
              <Row t="Snapshot" d="metrics cache refreshes every 5 minutes" right={<span className="faint">{fmtDate(m.generatedAt)}</span>} />
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
