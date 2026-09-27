import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getPiMetrics } from "@/lib/controlCenter/piMetrics"
import { fmtInt, pctOf } from "@/lib/controlCenter/format"
import { Card, Chip, CovRow, Num, Row, SecHead, Tile } from "../../_components/ui"

// Property Intelligence → Sources: provenance inspection over the EXISTING property_field_provenance
// table (one row per property × field, with source_type + verification_status) and the image
// provenance columns. Read-only; nothing is manufactured — every figure is a live count.
export const dynamic = "force-dynamic"

const SOURCE_TYPES = ["official_property_site", "official_management_site", "google_places", "trusted_locator_source", "trusted_brokerage_source", "manual_verified", "public_web", "unknown"] as const
const VERIFICATION = ["verified", "inferred", "unverified", "unknown"] as const
const LABEL: Record<string, string> = {
  official_property_site: "Official property website", official_management_site: "Official management website", google_places: "Google Places",
  trusted_locator_source: "Trusted locator source", trusted_brokerage_source: "Trusted brokerage source", manual_verified: "Manual (verified)", public_web: "Public web", unknown: "Unknown",
}
const head = { count: "exact" as const, head: true }
async function cnt(q: PromiseLike<{ count: number | null; error: { message: string } | null }>) { const r = await q; return r.error ? null : (r.count ?? 0) }

export default async function SourcesPage() {
  await ensurePlatformAdminPage()
  const m = await getPiMetrics()
  const total = await cnt(supabaseAdmin.from("property_field_provenance").select("*", head))
  const bySource = await Promise.all(SOURCE_TYPES.map(async (s) => [s, await cnt(supabaseAdmin.from("property_field_provenance").select("*", head).eq("source_type", s))] as const))
  const byVerif = await Promise.all(VERIFICATION.map(async (v) => [v, await cnt(supabaseAdmin.from("property_field_provenance").select("*", head).eq("verification_status", v))] as const))
  const imgOther = Math.max(0, m.populated - m.v11Writes - m.v10Writes)

  return (
    <>
      <div className="grid g4">
        <Tile k="Field provenance rows" v={<Num n={total} />} s="property_field_provenance · one per property × field" />
        <Tile k="Verified rows" v={<Num n={byVerif.find(([v]) => v === "verified")?.[1] ?? null} />} s="verification_status = verified" />
        <Tile k="Primary images with v1.1 / v1.0 provenance" v={<span>{fmtInt(m.v11Writes)} / {fmtInt(m.v10Writes)}</span>} s={`${fmtInt(imgOther)} legacy / other`} />
        <Tile k="Enrichment events" v={<span>see History</span>} s="property_enrichment_events" />
      </div>

      <div className="grid g2">
        <Card>
          <SecHead eyebrow="Field provenance by source" note="share of all provenance rows · authority is field-scoped (policy.ts)" />
          <div>{bySource.map(([s, c]) => <CovRow key={s} label={LABEL[s]} count={c} total={total ?? 1} note={s === "public_web" ? "authoritative for nothing" : s === "google_places" ? "owns rating · reviews · geo · canonical address" : s.startsWith("official") ? "owns identity · contact · specials" : s.startsWith("trusted") || s === "manual_verified" ? "authoritative for any non-commission field" : "—"} source={`property_field_provenance.source_type = ${s}`} />)}</div>
        </Card>
        <Card>
          <SecHead eyebrow="Field provenance by verification" note="Unknown ≠ No" />
          <div className="rows">
            {byVerif.map(([v, c]) => <Row key={v} t={v} d={v === "verified" ? "eligible to fill empty fields; disagreements surface as conflicts" : v === "inferred" ? "may fill empty fields" : "never fills a field"} right={<><Chip tone={v === "verified" ? "good" : v === "inferred" ? "info" : "neutral"}>{v}</Chip><Num n={c} /></>} />)}
          </div>
          <SecHead eyebrow="Image provenance" note="property_image_source_detail · algo tag" />
          <div className="rows">
            <Row t="Property Image Intelligence v1.1" d="structured / alternate-page discovery + full-res normalization" right={<Num n={m.v11Writes} />} />
            <Row t="Property Image Intelligence v1.0" d="frozen engine · website:gallery:<provider>" right={<Num n={m.v10Writes} />} />
            <Row t="Legacy / other" d="populated Primary without an algo tag" right={<Num n={imgOther} />} />
          </div>
          <p className="note" style={{ marginTop: 8 }}>Coverage of provenance vs. populated fields is not summarized here (it would need a per-field join); inspect it per property on Property Detail → Sources.</p>
        </Card>
      </div>
      <p className="subnote">Shares use {fmtInt(total)} provenance rows as the denominator ({pctOf(byVerif.find(([v]) => v === "verified")?.[1] ?? 0, total ?? 1).toFixed(1)}% verified).</p>
    </>
  )
}
