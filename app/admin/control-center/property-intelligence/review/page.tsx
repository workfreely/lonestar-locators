import Link from "next/link"
import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getOverview } from "@/lib/controlCenter/overview"
import { PI_BASE } from "@/lib/controlCenter/paths"
import { fmtDate, fmtInt, toText, truncate } from "@/lib/controlCenter/format"
import { Card, Chip, Empty, NotWired, Num, Row, SecHead, Tile } from "../../_components/ui"
import ConflictReview from "@/app/admin/property-intelligence/conflicts/_ConflictReview"

// Property Intelligence → Review: the existing durable review queues, connected — not rebuilt.
//  • Data conflicts   → property_conflict_review, actioned by the EXISTING ConflictReview component and
//                       its existing platform-admin-gated API (/api/admin/property-intelligence/conflicts).
//                       That is the one write path on this screen and it pre-dates the Control Center.
//  • Qualification    → property_qualification_review (ambiguous catalog matches) — read-only here.
//  • Image review     → file-based today → not wired (no durable store).
export const dynamic = "force-dynamic"

type Qual = { id: number; source_property_name: string; market: string | null; criterion: string | null; original_value: string | null; candidate_name: string | null; candidate_place_id: string | null; match_confidence: string | null; status: string; created_at: string }

export default async function ReviewPage() {
  await ensurePlatformAdminPage()
  const ov = await getOverview()
  const { reviews } = ov
  const { data: qual } = await supabaseAdmin.from("property_qualification_review")
    .select("id, source_property_name, market, criterion, original_value, candidate_name, candidate_place_id, match_confidence, status, created_at")
    .eq("status", "pending").order("created_at", { ascending: false }).limit(40)
  const conf = (c?: string | null) => (c === "exact" || c === "strong" ? "good" : c === "weak" ? "warn" : "neutral") as "good" | "warn" | "neutral"

  return (
    <>
      <div className="grid g4">
        <Tile k="Conflicts awaiting decision" v={<Num n={reviews.available ? reviews.conflictsPending : null} />} s="preserved_pending_review" />
        <Tile k="Conflicts auto-resolved" v={<Num n={reviews.available ? reviews.conflictsAutoResolved : null} />} s="stale Google refresh · malformed replaced" />
        <Tile k="Conflicts resolved by you" v={<Num n={reviews.available ? reviews.conflictsResolved : null} />} s="disposition = resolved" />
        <Tile k="Qualification pending" v={<Num n={reviews.available ? reviews.qualificationPending : null} />} s={`of ${fmtInt(reviews.qualificationTotal)} rows`} />
      </div>

      <Card>
        <SecHead eyebrow="Data conflicts" note={<>existing curated value preserved until you decide · actions use the existing gated API · also at <Link href="/admin/property-intelligence/conflicts">the standalone page</Link></>} />
        <ConflictReview />
      </Card>

      <Card>
        <SecHead eyebrow="Qualification matches pending" note={`${(qual ?? []).length} shown of ${fmtInt(reviews.qualificationPending)} · identity is never guessed · read-only in V1`} />
        {(qual ?? []).length === 0 ? <Empty>No pending qualification matches.</Empty> : (
          <table><thead><tr><th>Source property</th><th>Market</th><th>Criterion · value</th><th>Best catalog candidate</th><th>Confidence</th><th>Created</th></tr></thead><tbody>
            {((qual ?? []) as Qual[]).map((q) => (
              <tr key={q.id}>
                <td style={{ fontWeight: 500 }}>{q.source_property_name}</td>
                <td className="muted">{q.market ?? "—"}</td>
                <td><span>{q.criterion ?? "—"}</span><span className="d">{truncate(q.original_value, 60)}</span></td>
                <td>{q.candidate_place_id ? <Link href={`${PI_BASE}/properties/${encodeURIComponent(q.candidate_place_id)}`}>{toText(q.candidate_name) ?? q.candidate_place_id}</Link> : <span className="faint">none</span>}</td>
                <td><Chip tone={conf(q.match_confidence)}>{q.match_confidence ?? "none"}</Chip></td>
                <td className="muted">{fmtDate(q.created_at)}</td>
              </tr>
            ))}
          </tbody></table>
        )}
        <p className="note" style={{ marginTop: 8 }}>Matching / excluding a qualification row is a write; no write path for it exists yet in the Control Center and none was invented here.</p>
      </Card>

      <Card>
        <SecHead eyebrow="Image review" note="missing · bad · uncertain · proposed replacement" />
        <div className="rows">
          <Row t="Missing Primary images" d="canonical slot state — browse in Images / Properties" right={<><Chip tone="warn">missing</Chip><Num n={ov.pi.missing} /></>} />
          <NotWired what="Bad / Uncertain Primary review + Approve / Reject / Keep" why="decisions live in file-based review manifests; a durable image-review store and the change_requested UI action are not built (production image processing is frozen)" />
        </div>
      </Card>
    </>
  )
}
