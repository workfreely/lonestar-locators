import Link from "next/link"
import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { PI_BASE } from "@/lib/controlCenter/paths"
import { fmtInt, toText } from "@/lib/controlCenter/format"
import { Card, Chip, Empty } from "../../_components/ui"

// Property Intelligence → Properties: searchable, filterable catalog (working screen). Read-only.
// Filters are a plain GET form (URL is the state) so the page stays a server component with no
// browser→Supabase access. Completeness dots are computed from the canonical sources for the rows on
// the current page only (two small `in (...)` lookups), never a 380-column table.
export const dynamic = "force-dynamic"
const PAGE = 50
type SP = { q?: string; market?: string; image?: string; page?: string }
type Row = {
  place_id: string; property_name: string | null; market: string | null; website_url: string | null
  property_image_url: string | null; image_selection_state: string | null; property_image_status: string | null
  pets_allowed: string | null; management_company: string | null; inventory_type: string | null; structural_scale: string | null; property_grade: string | null; year_built: number | null
}

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await ensurePlatformAdminPage()
  const sp = await searchParams
  const q = (sp.q ?? "").trim().replace(/[%_,()]/g, " ").trim()
  const market = sp.market ?? ""
  const image = sp.image ?? ""
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1)

  let query = supabaseAdmin.from("property_catalog")
    .select("place_id, property_name, market, website_url, property_image_url, image_selection_state, property_image_status, pets_allowed, management_company, inventory_type, structural_scale, property_grade, year_built", { count: "exact" })
  if (q) query = query.ilike("property_name", `%${q}%`)
  if (market === "none") query = query.is("market", null)
  else if (market) query = query.eq("market", market)
  if (image === "missing") query = query.or("property_image_url.is.null,property_image_url.eq.")
  else if (image === "populated") query = query.not("property_image_url", "is", null).neq("property_image_url", "")
  else if (image === "unreachable") query = query.eq("property_image_status", "unreachable")
  else if (image === "change_requested") query = query.eq("image_selection_state", "change_requested")
  const { data, count, error } = await query.order("property_name", { ascending: true, nullsFirst: false }).range((page - 1) * PAGE, page * PAGE - 1)
  const rows = (data ?? []) as Row[]
  const ids = rows.map((r) => r.place_id)

  // per-page canonical lookups (features / floor plans / open conflicts)
  const [attrs, fps, conf] = ids.length
    ? await Promise.all([
        supabaseAdmin.from("property_attributes").select("place_id").in("place_id", ids),
        supabaseAdmin.from("property_floor_plans").select("place_id").in("place_id", ids),
        supabaseAdmin.from("property_conflict_review").select("place_id").in("place_id", ids).eq("disposition", "preserved_pending_review"),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]
  const hasAttr = new Set((attrs.data ?? []).map((r: { place_id: string }) => r.place_id))
  const hasFp = new Set((fps.data ?? []).map((r: { place_id: string }) => r.place_id))
  const hasConflict = new Set((conf.data ?? []).map((r: { place_id: string }) => r.place_id))

  const total = count ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const link = (p: number) => { const u = new URLSearchParams(); if (q) u.set("q", q); if (market) u.set("market", market); if (image) u.set("image", image); u.set("page", String(p)); return `${PI_BASE}/properties?${u.toString()}` }

  return (
    <>
      <Card>
        <form method="get" className="filters" action={`${PI_BASE}/properties`}>
          <input type="search" name="q" placeholder="Search property name" defaultValue={q} aria-label="Search property name" />
          <select name="market" defaultValue={market} aria-label="Market">
            <option value="">All markets</option>
            <option value="Dallas">Dallas</option><option value="Austin">Austin</option><option value="Houston">Houston</option><option value="San Antonio">San Antonio</option><option value="none">No market</option>
          </select>
          <select name="image" defaultValue={image} aria-label="Image state">
            <option value="">Any image state</option>
            <option value="populated">Primary populated</option><option value="missing">Primary missing</option><option value="unreachable">Primary unreachable</option><option value="change_requested">change_requested</option>
          </select>
          <button type="submit">Filter</button>
          {(q || market || image) ? <Link href={`${PI_BASE}/properties`} className="btn ghost">Clear</Link> : null}
          <span className="faint" style={{ marginLeft: "auto", fontSize: 12 }}>{fmtInt(total)} propert{total === 1 ? "y" : "ies"} · page {page} of {pages}</span>
        </form>
      </Card>

      <Card>
        {error ? <Empty>Could not load properties: {error.message}</Empty> : rows.length === 0 ? <Empty>No properties match these filters.</Empty> : (
          <table>
            <thead><tr><th>Property</th><th>Market</th><th>Primary image</th><th>Classification</th><th>Completeness</th><th>Review</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const hasImg = !!toText(r.property_image_url)
                const cls = [r.inventory_type, r.structural_scale, r.property_grade].map(toText).filter(Boolean).join(" · ")
                const dots: [string, boolean][] = [["identity (website)", !!toText(r.website_url)], ["image", hasImg], ["pets", !!toText(r.pets_allowed)], ["management", !!toText(r.management_company)], ["year built", r.year_built != null], ["features", hasAttr.has(r.place_id)], ["floor plans", hasFp.has(r.place_id)], ["classification", !!cls]]
                const done = dots.filter((d) => d[1]).length
                return (
                  <tr key={r.place_id} className="link">
                    <td>
                      <Link href={`${PI_BASE}/properties/${encodeURIComponent(r.place_id)}`} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        {hasImg ? /* eslint-disable-next-line @next/next/no-img-element */ <img className="thumb" src={r.property_image_url!} alt="" loading="lazy" /> : <span className="thumb empty">none</span>}
                        <span><span style={{ fontWeight: 500 }}>{toText(r.property_name) ?? "(unnamed)"}</span><span className="d">{toText(r.website_url) ?? "no website"}</span></span>
                      </Link>
                    </td>
                    <td className="muted">{toText(r.market) ?? "—"}</td>
                    <td>{r.image_selection_state === "change_requested" ? <Chip tone="crit">change_requested</Chip> : hasImg ? <Chip tone={r.property_image_status === "unreachable" ? "warn" : "good"}>{r.property_image_status === "unreachable" ? "unreachable" : "keep"}</Chip> : <Chip tone="warn">missing</Chip>}</td>
                    <td className="muted">{cls || <span className="faint">not yet enriched</span>}</td>
                    <td><span className="dots" title={dots.map(([n, ok]) => `${ok ? "●" : "○"} ${n}`).join("\n")}>{dots.map(([n, ok]) => <i key={n} className={ok ? "on" : ""} />)}</span> <span className="faint num" style={{ fontSize: 11 }}>{done}/{dots.length}</span></td>
                    <td>{hasConflict.has(r.place_id) ? <Chip tone="crit">conflict</Chip> : <span className="faint">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {pages > 1 ? (
          <div className="pager" style={{ marginTop: 12 }}>
            {page > 1 ? <Link href={link(page - 1)}>← Previous</Link> : null}
            <span>page {page} of {pages}</span>
            {page < pages ? <Link href={link(page + 1)}>Next →</Link> : null}
          </div>
        ) : null}
      </Card>
    </>
  )
}
