import Link from "next/link"
import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getPiMetrics } from "@/lib/controlCenter/piMetrics"
import { PI_BASE } from "@/lib/controlCenter/paths"
import { fmtDate, fmtInt, pctOf, toText, truncate } from "@/lib/controlCenter/format"
import { Card, Chip, Empty, NotWired, Num, Pct, Row, SecHead, Seg, Tile } from "../../_components/ui"

// Property Intelligence → Images (working screen, READ-ONLY): canonical Primary/Fallback slot state,
// technical status, provenance (source · scene · mechanism · algorithm · verified date), and the
// queues that follow from them (missing, unreachable, stranded change_requested, recent v1.1 writes).
// Good / Bad / Uncertain and the 195-GOOD / 58-BAD human decisions are file-based ledgers that are
// NOT persisted in the database — shown as "not wired", never approximated.
export const dynamic = "force-dynamic"

type Lite = { place_id: string; property_name: string | null; market: string | null; website_url: string | null; property_image_url: string | null; property_image_source: string | null; property_image_source_detail: string | null; property_image_status: string | null; property_image_verified_at: string | null; image_selection_state: string | null }
const COLS = "place_id, property_name, market, website_url, property_image_url, property_image_source, property_image_source_detail, property_image_status, property_image_verified_at, image_selection_state"
const scene = (sd: string | null) => (sd ?? "").match(/primary=([^;]+)/)?.[1] ?? "—"
const mech = (sd: string | null) => (sd ?? "").match(/mechanism=([^;]+)/)?.[1] ?? null
const algo = (sd: string | null) => /v1\.1/.test(sd ?? "") ? "v1.1" : /v1\.0/.test(sd ?? "") ? "v1.0" : "—"

export default async function ImagesPage() {
  await ensurePlatformAdminPage()
  const m = await getPiMetrics()
  const [missing, unreachable, stranded, recentV11] = await Promise.all([
    supabaseAdmin.from("property_catalog").select(COLS).or("property_image_url.is.null,property_image_url.eq.").order("property_name", { ascending: true, nullsFirst: false }).limit(60),
    supabaseAdmin.from("property_catalog").select(COLS).eq("property_image_status", "unreachable").order("property_name", { ascending: true, nullsFirst: false }).limit(40),
    supabaseAdmin.from("property_catalog").select(COLS).or("image_selection_state.eq.change_requested,image_backup_state.eq.change_requested"),
    supabaseAdmin.from("property_catalog").select(COLS).ilike("property_image_source_detail", "%property-image-intelligence-v1.1%").order("property_image_verified_at", { ascending: false, nullsFirst: false }).limit(40),
  ])
  const primaryPct = pctOf(m.populated, m.total)
  const Name = ({ r }: { r: Lite }) => <Link href={`${PI_BASE}/properties/${encodeURIComponent(r.place_id)}`} style={{ fontWeight: 500 }}>{toText(r.property_name) ?? "(unnamed)"}</Link>

  return (
    <>
      <div className="grid g4">
        <Tile k="Primary populated" v={<Pct value={primaryPct} />} s={`${fmtInt(m.populated)} of ${fmtInt(m.total)}`} />
        <Tile k="Primary missing" v={<Num n={m.missing} />} s="image_selection_state = missing" />
        <Tile k="Fallback populated" v={<Pct value={pctOf(m.fallback, m.total)} />} s={`${fmtInt(m.fallback)} · property_image_url_backup`} />
        <Tile k="Stranded change_requested" v={<span>{m.changeRequestedPrimary} / {m.changeRequestedBackup}</span>} s="primary / backup · should be 0" />
      </div>

      <div className="grid g2">
        <Card>
          <SecHead eyebrow="Primary slot state" note="canonical columns" />
          <Seg height={12} label="Primary" parts={[{ w: primaryPct, tone: "good", title: "populated" }, { w: 100 - primaryPct, tone: "warn", title: "missing" }]} />
          <div className="rows" style={{ marginTop: 6 }}>
            <Row t="Populated · keep (locked)" right={<Num n={m.populated} />} />
            <Row t="Missing" right={<Num n={m.missing} />} />
            <Row t="Technical status: valid" d="property_image_status" right={<Num n={m.imageStatus.valid} />} />
            <Row t="Technical status: unreachable" d="URL failed the last reachability check" right={<><Chip tone="warn">check</Chip><Num n={m.imageStatus.unreachable} /></>} />
            <Row t="Technical status: no_image" right={<Num n={m.imageStatus.no_image} />} />
            <Row t="Written by v1.1 · v1.0" d="algorithm version in provenance" right={<span className="num">{fmtInt(m.v11Writes)} · {fmtInt(m.v10Writes)}</span>} />
          </div>
        </Card>
        <Card>
          <SecHead eyebrow="Quality classification & human review" note="what is and isn't persisted" />
          <div className="rows">
            <NotWired what="Good / Bad / Uncertain Primary classification" why="produced by the read-only audit ledger (file-based) — not stored in the database" />
            <NotWired what="Human review decisions (195 GOOD · 58 BAD · uncertain second review)" why="recorded in review manifests (file-based); persisting them is a decision for the resume plan" />
            <NotWired what="Change Image / Approve replacement" why="must go through the existing change_requested path in the safe writer; not enabled in read-only V1 while production image processing is frozen" />
          </div>
        </Card>
      </div>

      <Card>
        <SecHead eyebrow="Stranded change_requested" note="primary or backup left authorized without a write — must always be empty" />
        {(stranded.data ?? []).length === 0 ? <Empty>None. Write safety is clean.</Empty> : (
          <table><thead><tr><th>Property</th><th>Market</th><th>State</th></tr></thead><tbody>
            {((stranded.data ?? []) as Lite[]).map((r) => <tr key={r.place_id}><td><Name r={r} /></td><td className="muted">{r.market ?? "—"}</td><td><Chip tone="crit">{r.image_selection_state}</Chip></td></tr>)}
          </tbody></table>
        )}
      </Card>

      <div className="grid g2">
        <Card>
          <SecHead eyebrow="Missing Primary" note={`first ${(missing.data ?? []).length} of ${fmtInt(m.missing)} · recovery paused at checkpoint`} />
          {(missing.data ?? []).length === 0 ? <Empty>No missing Primary images.</Empty> : (
            <table><thead><tr><th>Property</th><th>Market</th><th>Website</th></tr></thead><tbody>
              {((missing.data ?? []) as Lite[]).map((r) => <tr key={r.place_id}><td><Name r={r} /></td><td className="muted">{r.market ?? "—"}</td><td className="faint" style={{ fontSize: 12 }}>{r.website_url ? <a href={r.website_url} target="_blank" rel="noreferrer">{truncate(r.website_url, 44)}</a> : "no website"}</td></tr>)}
            </tbody></table>
          )}
          <p className="subnote" style={{ marginTop: 8 }}><Link href={`${PI_BASE}/properties?image=missing`}>Browse all missing in Properties →</Link></p>
        </Card>
        <Card>
          <SecHead eyebrow="Unreachable Primary" note={`first ${(unreachable.data ?? []).length} of ${fmtInt(m.imageStatus.unreachable)} · property_image_status = unreachable`} />
          {(unreachable.data ?? []).length === 0 ? <Empty>None.</Empty> : (
            <table><thead><tr><th>Property</th><th>Market</th><th>URL</th></tr></thead><tbody>
              {((unreachable.data ?? []) as Lite[]).map((r) => <tr key={r.place_id}><td><Name r={r} /></td><td className="muted">{r.market ?? "—"}</td><td className="faint" style={{ fontSize: 12 }}>{truncate(r.property_image_url, 48)}</td></tr>)}
            </tbody></table>
          )}
          <p className="subnote" style={{ marginTop: 8 }}><Link href={`${PI_BASE}/properties?image=unreachable`}>Browse all unreachable →</Link></p>
        </Card>
      </div>

      <Card>
        <SecHead eyebrow="Recent v1.1 Primary writes" note={`latest ${(recentV11.data ?? []).length} of ${fmtInt(m.v11Writes)} · provenance-stamped algo=property-image-intelligence-v1.1`} />
        {(recentV11.data ?? []).length === 0 ? <Empty>No v1.1 writes yet.</Empty> : (
          <table><thead><tr><th>Property</th><th>Image</th><th>Scene · mechanism</th><th>Source</th><th>Algo</th><th>Verified</th></tr></thead><tbody>
            {((recentV11.data ?? []) as Lite[]).map((r) => (
              <tr key={r.place_id}>
                <td><Name r={r} /><span className="d">{r.market ?? "—"}</span></td>
                <td>{r.property_image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img className="thumb" src={r.property_image_url} alt="" loading="lazy" /> : "—"}</td>
                <td>{scene(r.property_image_source_detail)}{mech(r.property_image_source_detail) ? <span className="d">{mech(r.property_image_source_detail)}</span> : null}</td>
                <td className="muted" style={{ fontSize: 12 }}>{truncate(r.property_image_source, 40)}</td>
                <td><Chip tone="accent">{algo(r.property_image_source_detail)}</Chip></td>
                <td className="muted">{fmtDate(r.property_image_verified_at)}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </Card>
    </>
  )
}
