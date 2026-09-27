import Link from "next/link"
import { notFound } from "next/navigation"
import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { PI_BASE } from "@/lib/controlCenter/paths"
import { fmtDate, fmtDateTime, fmtInt, labelize, toText, truncate } from "@/lib/controlCenter/format"
import { Card, Chip, Empty, StateChip, type FieldState } from "../../../_components/ui"

// Property Intelligence → Property Detail (working screen, READ-ONLY).
// Organizes the canonical intelligence into sections and shows, per field: value · state · source ·
// verified date · provenance (property_field_provenance) · open conflicts (property_conflict_review) ·
// history (property_enrichment_events). Field states: Verified / Missing / Unknown / Conflict /
// Needs Review / Stale / Unsourced. Unknown ≠ No. No write controls are enabled in V1; the only
// sanctioned image write path is the existing change_requested flow through the safe writer.
export const dynamic = "force-dynamic"

type Prov = { field_name: string; value: string | null; source_type: string | null; source_reference: string | null; verification_status: string | null; checked_at: string | null; written_at: string | null; job_id: string | null }
type Conflict = { id: number; field_name: string; existing_value: string | null; incoming_value: string | null; incoming_source_type: string | null; classification: string; disposition: string }
type Attr = { attribute_key: string; value: string | null; value_text: string | null; applicability: string | null; floorplan_specific: boolean; source_type: string | null; verification_status: string | null; checked_at: string | null; property_attribute_keys: { label: string; category: string } | { label: string; category: string }[] | null }
type Plan = { id: string; name: string | null; beds: number | null; baths: number | null; sqft_min: number | null; sqft_max: number | null; starting_rent: number | null; is_townhome: boolean | null; is_split_level: boolean | null; is_loft: boolean | null; is_penthouse: boolean | null; verification_status: string | null; source_type: string | null }
type Ev = { id: number; job_id: string; field_name: string; action: string; old_value: string | null; new_value: string | null; source_type: string | null; reason: string | null; created_at: string }

const SECTIONS: { title: string; fields: string[]; stale?: string }[] = [
  { title: "Overview", fields: ["property_name", "address", "city", "state", "zip", "market", "neighborhood", "submarket", "place_id", "website_url", "phone", "leasing_email", "google_rating", "google_review_count", "latitude", "longitude", "business_status", "locator_status_detail"] },
  { title: "Classification", fields: ["inventory_type", "structural_scale", "property_grade", "classification_tags", "loft_type", "townhome_overlap", "rental_home_candidate", "dwelling_attachment", "stories", "penthouse_available", "classification_status", "year_built", "year_renovated"] },
  { title: "Pricing", fields: ["rent_min", "rent_max", "beds_min", "beds_max", "baths_min", "baths_max", "sqft_min", "sqft_max", "studio_starting_rent", "onebr_starting_rent", "twobr_starting_rent", "threebr_starting_rent", "fourbr_starting_rent", "has_live_pricing", "pricing_last_verified"], stale: "pricing_last_verified" },
  { title: "Specials", fields: ["current_special", "current_special_checked_at", "current_special_source"], stale: "current_special_checked_at" },
  { title: "Pets", fields: ["pets_allowed", "breed_restrictions", "restricted_breeds_notes", "pet_weight_limit", "pet_weight_limit_per_pet", "number_of_pets_allowed", "pet_deposit", "pet_fee", "monthly_pet_rent", "pet_policy_notes", "pet_policy_last_verified"], stale: "pet_policy_last_verified" },
  { title: "Utilities & Internet", fields: ["all_bills_paid", "water_included", "electric_included", "gas_included", "trash_included", "sewer_included", "cable_included", "utility_package_flat_fee", "utility_notes", "internet_included", "internet_provider", "fiber_available", "internet_package_required", "internet_fee", "internet_notes", "internet_last_verified"], stale: "internet_last_verified" },
  { title: "Location", fields: ["location", "location_keywords", "cross_streets", "nearby_freeways", "nearby_landmark_1", "nearby_landmark_1_type", "nearby_landmark_2", "nearby_landmark_2_type", "nearby_landmark_3", "nearby_landmark_3_type"] },
  { title: "Management", fields: ["management_company", "management_company_website_url", "management_company_id"] },
  { title: "Approval (catalog fields)", fields: ["escort_required", "tour_requirement_status", "escort_notes", "escort_requirement_last_verified", "affordable_program", "affordable_income_cap", "affordable_program_notes", "deposit_amount", "deposit_range", "application_fee", "admin_fee", "minimum_lease_term", "maximum_lease_term", "short_term_lease_available", "month_to_month_available"] },
]
const COMMISSION = ["send_commission", "escort_commission", "bonus_flat"]
const STALE_DAYS = 90

function isStale(iso: string | null | undefined) { if (!iso) return false; const d = new Date(iso).getTime(); return Number.isFinite(d) && Date.now() - d > STALE_DAYS * 86400000 }
function stateFor(field: string, value: unknown, prov: Prov | undefined, conflictFields: Set<string>): FieldState {
  if (conflictFields.has(field)) return "Conflict"
  const t = toText(value)
  if (t === null) return "Missing"
  if (/^unknown$/i.test(t)) return "Unknown"
  if (!prov) return "Unsourced"
  return prov.verification_status === "verified" ? "Verified" : "Needs Review"
}
function keyOf(a: Attr): { label: string; category: string } { const k = Array.isArray(a.property_attribute_keys) ? a.property_attribute_keys[0] : a.property_attribute_keys; return k ?? { label: a.attribute_key, category: "other" } }
// property_catalog.address is often the full Google-formatted address ("1 Riva Row, The Woodlands, TX 77380, USA");
// only append city / state / zip when the stored address does not already carry them — never repeat them.
function fullAddress(r: Record<string, unknown>): string {
  const address = toText(r.address) ?? ""
  const lower = address.toLowerCase()
  const city = toText(r.city), state = toText(r.state), zip = toText(r.zip)
  const cityPart = city && !lower.includes(city.toLowerCase()) ? city : null
  const stateZip = [state && !lower.includes(state.toLowerCase()) ? state : null, zip && !lower.includes(zip.toLowerCase()) ? zip : null].filter(Boolean).join(" ")
  return [address, cityPart, stateZip].filter(Boolean).join(", ")
}
function parseDetail(sd: string | null): Record<string, string> { const out: Record<string, string> = {}; for (const part of (sd ?? "").split(";")) { const [k, ...v] = part.split("="); if (k && v.length) out[k.trim()] = v.join("=").trim() } return out }

function FieldRow({ field, value, prov, state }: { field: string; value: unknown; prov?: Prov; state: FieldState }) {
  const text = toText(value)
  return (
    <div className="field">
      <span className="k">{labelize(field)}</span>
      <span className="v">{text ?? <span className="faint">—</span>}</span>
      <span className="meta" style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
        {prov ? <span title={prov.source_reference ?? undefined}>{prov.source_type} · {fmtDate(prov.checked_at ?? prov.written_at)}</span> : null}
        <StateChip state={state} />
      </span>
    </div>
  )
}

export default async function PropertyDetailPage({ params }: { params: Promise<{ placeId: string }> }) {
  await ensurePlatformAdminPage()
  const { placeId: raw } = await params
  const placeId = decodeURIComponent(raw)
  const { data: row, error } = await supabaseAdmin.from("property_catalog").select("*").eq("place_id", placeId).maybeSingle()
  if (error) return <Card><Empty>Could not load property: {error.message}</Empty></Card>
  if (!row) notFound()
  const r = row as Record<string, unknown>

  const [provRes, attrRes, planRes, specRes, apprRes, confRes, evRes] = await Promise.all([
    supabaseAdmin.from("property_field_provenance").select("field_name, value, source_type, source_reference, verification_status, checked_at, written_at, job_id").eq("place_id", placeId),
    supabaseAdmin.from("property_attributes").select("attribute_key, value, value_text, applicability, floorplan_specific, source_type, verification_status, checked_at, property_attribute_keys(label, category)").eq("place_id", placeId),
    supabaseAdmin.from("property_floor_plans").select("id, name, beds, baths, sqft_min, sqft_max, starting_rent, is_townhome, is_split_level, is_loft, is_penthouse, verification_status, source_type").eq("place_id", placeId).order("beds", { ascending: true, nullsFirst: false }),
    supabaseAdmin.from("property_specials").select("*").eq("place_id", placeId).maybeSingle(),
    supabaseAdmin.from("property_approval_policy").select("*").eq("place_id", placeId).maybeSingle(),
    supabaseAdmin.from("property_conflict_review").select("id, field_name, existing_value, incoming_value, incoming_source_type, classification, disposition").eq("place_id", placeId).eq("disposition", "preserved_pending_review"),
    supabaseAdmin.from("property_enrichment_events").select("id, job_id, field_name, action, old_value, new_value, source_type, reason, created_at").eq("place_id", placeId).order("created_at", { ascending: false }).limit(30),
  ])
  const prov = new Map<string, Prov>(((provRes.data ?? []) as Prov[]).map((p) => [p.field_name, p]))
  const attrs = (attrRes.data ?? []) as unknown as Attr[]
  const plans = (planRes.data ?? []) as Plan[]
  const special = (specRes.data ?? null) as Record<string, unknown> | null
  const approval = (apprRes.data ?? null) as Record<string, unknown> | null
  const conflicts = (confRes.data ?? []) as Conflict[]
  const conflictFields = new Set(conflicts.map((c) => c.field_name))
  const events = (evRes.data ?? []) as Ev[]

  const name = toText(r.property_name) ?? "(unnamed)"
  const primaryDetail = parseDetail(toText(r.property_image_source_detail))
  const backupDetail = parseDetail(toText(r.property_image_backup_source_detail))
  const attrsByCat = new Map<string, Attr[]>()
  for (const a of attrs) { const c = keyOf(a).category; if (!attrsByCat.has(c)) attrsByCat.set(c, []); attrsByCat.get(c)!.push(a) }

  const Section = ({ title, fields, stale }: { title: string; fields: string[]; stale?: string }) => {
    const populated = fields.filter((f) => toText(r[f]) !== null)
    const missing = fields.filter((f) => toText(r[f]) === null)
    const staleFlag = stale ? isStale(toText(r[stale])) : false
    return (
      <Card>
        <div className="sechead"><h2>{title}</h2><span className="note">{populated.length} of {fields.length} populated</span>{staleFlag ? <StateChip state="Stale" /> : null}</div>
        {populated.length ? <div className="kv">{populated.map((f) => <FieldRow key={f} field={f} value={r[f]} prov={prov.get(f)} state={stateFor(f, r[f], prov.get(f), conflictFields)} />)}</div> : <Empty>Not yet enriched.</Empty>}
        {missing.length ? <details style={{ marginTop: 8 }}><summary className="faint" style={{ cursor: "pointer", fontSize: 12 }}>Missing ({missing.length})</summary><p className="note">{missing.map(labelize).join(" · ")}</p></details> : null}
      </Card>
    )
  }

  const ImageSlot = ({ title, url, source, detail, status, verified, state }: { title: string; url: string | null; source: string | null; detail: Record<string, string>; status: string | null; verified: string | null; state: string | null }) => (
    <div>
      <div className="sechead"><h3>{title}</h3><span className="note">{state ?? "—"}</span>{state === "keep" ? <Chip tone="good">keep · locked</Chip> : state === "change_requested" ? <Chip tone="crit">change_requested</Chip> : <Chip tone="warn">missing</Chip>}</div>
      {url ? /* eslint-disable-next-line @next/next/no-img-element */ <img className="thumb lg" src={url} alt="" loading="lazy" /> : <div className="thumb lg empty" style={{ height: 160 }}>no image</div>}
      <div className="kv" style={{ marginTop: 10 }}>
        <span className="k">URL</span><span className="v" style={{ fontSize: 12 }}>{url ? <a href={url} target="_blank" rel="noreferrer">{truncate(url, 90)}</a> : "—"}</span><span />
        <span className="k">Source</span><span className="v">{source ?? "—"}</span><span />
        <span className="k">Scene · mechanism</span><span className="v">{detail.primary ?? detail.fallback ?? "—"}{detail.mechanism ? ` · ${detail.mechanism}` : ""}</span><span />
        <span className="k">Originating page</span><span className="v" style={{ fontSize: 12 }}>{detail.sourcePage ? <a href={detail.sourcePage} target="_blank" rel="noreferrer">{truncate(detail.sourcePage, 80)}</a> : "—"}</span><span />
        <span className="k">Algorithm</span><span className="v">{detail.algo ?? "—"}</span><span />
        <span className="k">Status · verified</span><span className="v">{status ?? "—"} · {fmtDate(verified)}</span><span />
      </div>
    </div>
  )

  return (
    <>
      <div className="sechead" style={{ margin: 0 }}>
        <div>
          <Link href={`${PI_BASE}/properties`} className="faint" style={{ fontSize: 12 }}>← Properties</Link>
          <h2 style={{ fontSize: 20 }}>{name}</h2>
          {/* Full street address as the readable secondary line. The Google Place ID stays in the Overview
              (identity) section below — useful internally, not part of the heading. */}
          <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            {fullAddress(r) || "Address not on file"}
            {toText(r.market) ? <span className="faint"> · {toText(r.market)}</span> : null}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {conflicts.length ? <Chip tone="crit">{conflicts.length} open conflict{conflicts.length === 1 ? "" : "s"}</Chip> : null}
          <Chip tone="neutral">{fmtInt(prov.size)} sourced fields</Chip>
          <Chip tone="neutral">{fmtInt(attrs.length)} attributes</Chip>
          <Chip tone="neutral">{fmtInt(plans.length)} floor plans</Chip>
          <Chip tone="accent">read-only</Chip>
        </div>
      </div>

      {conflicts.length ? (
        <Card>
          <div className="sechead"><h2>Open conflicts</h2><span className="note">existing value preserved until you decide · resolve in <Link href={`${PI_BASE}/review`}>Review</Link></span></div>
          <table><thead><tr><th>Field</th><th>Existing</th><th>Incoming</th><th>Source</th><th>Class</th></tr></thead><tbody>
            {conflicts.map((c) => <tr key={c.id}><td>{labelize(c.field_name)}</td><td>{truncate(c.existing_value, 60)}</td><td>{truncate(c.incoming_value, 60)}</td><td className="muted">{c.incoming_source_type ?? "—"}</td><td><Chip tone="crit">{c.classification}</Chip></td></tr>)}
          </tbody></table>
        </Card>
      ) : null}

      {SECTIONS.slice(0, 3).map((s) => <Section key={s.title} {...s} />)}

      <Card>
        <div className="sechead"><h2>Features</h2><span className="note">{attrs.length} structured attributes · property_attributes · applicability preserved</span></div>
        {attrs.length === 0 ? <Empty>Not yet enriched.</Empty> : (
          <div className="grid g2">
            {[...attrsByCat.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cat, list]) => (
              <div key={cat}>
                <span className="eyebrow">{labelize(cat)}</span>
                <div className="kv" style={{ marginTop: 6, gridTemplateColumns: "1fr auto auto" }}>
                  {list.map((a) => {
                    const val = a.value_text ?? a.value ?? null
                    const st: FieldState = val === null ? "Missing" : /^unknown$/i.test(val) ? "Unknown" : a.verification_status === "verified" ? "Verified" : a.verification_status ? "Needs Review" : "Unsourced"
                    return (
                      <div className="field" key={a.attribute_key}>
                        <span className="v">{keyOf(a).label}{a.floorplan_specific ? <span className="faint"> · select floor plans</span> : null}{a.applicability && a.applicability !== "property_wide" ? <span className="faint"> · {a.applicability.replace(/_/g, " ")}</span> : null}</span>
                        <span className="v" style={{ fontWeight: 500 }}>{val ?? "—"}</span>
                        <span className="meta"><StateChip state={st} /></span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {toText(r.amenity_keywords) ? <p className="note" style={{ marginTop: 10 }}>Amenity keywords (curated ranking layer): {toText(r.amenity_keywords)}</p> : null}
      </Card>

      <Card>
        <div className="sechead"><h2>Floor plans</h2><span className="note">{plans.length} · property_floor_plans</span></div>
        {plans.length === 0 ? <Empty>Not yet enriched.</Empty> : (
          <table><thead><tr><th>Name</th><th>Beds</th><th>Baths</th><th>Sq ft</th><th>Starting rent</th><th>Type</th><th>State</th></tr></thead><tbody>
            {plans.map((p) => <tr key={p.id}><td>{p.name ?? "—"}</td><td className="num">{p.beds ?? "—"}</td><td className="num">{p.baths ?? "—"}</td><td className="num">{p.sqft_min ?? "—"}{p.sqft_max && p.sqft_max !== p.sqft_min ? `–${p.sqft_max}` : ""}</td><td className="num">{p.starting_rent != null ? `$${fmtInt(p.starting_rent)}` : "—"}</td><td className="muted">{[p.is_townhome && "townhome", p.is_split_level && "split-level", p.is_loft && "loft", p.is_penthouse && "penthouse"].filter(Boolean).join(" · ") || "—"}</td><td><StateChip state={p.verification_status === "verified" ? "Verified" : p.verification_status ? "Needs Review" : "Unsourced"} /></td></tr>)}
          </tbody></table>
        )}
      </Card>

      <Card>
        <div className="sechead"><h2>Images</h2><span className="note">Primary + Fallback slots · locked unless explicitly change_requested · no write controls in V1</span></div>
        <div className="grid g2">
          <ImageSlot title="Primary" url={toText(r.property_image_url)} source={toText(r.property_image_source)} detail={primaryDetail} status={toText(r.property_image_status)} verified={toText(r.property_image_verified_at)} state={toText(r.image_selection_state)} />
          <ImageSlot title="Fallback" url={toText(r.property_image_url_backup)} source={toText(r.property_image_backup_source)} detail={backupDetail} status={toText(r.property_image_backup_status)} verified={toText(r.property_image_backup_verified_at)} state={toText(r.image_backup_state)} />
        </div>
        <p className="note" style={{ marginTop: 10 }}>Changing an image must use the existing <code>change_requested</code> path through the safe writer (Property Image Intelligence). That action is intentionally not exposed in this read-only V1; production image processing is frozen.</p>
      </Card>

      <Section {...SECTIONS[3]} />
      {special ? (
        <Card>
          <div className="sechead"><h2>Structured special</h2><span className="note">property_specials · freshness {fmtDate(toText(special.special_last_verified))}</span>{isStale(toText(special.special_last_verified)) ? <StateChip state="Stale" /> : null}</div>
          <div className="kv">{Object.entries(special).filter(([k, v]) => k !== "place_id" && k !== "updated_at" && toText(v) !== null).map(([k, v]) => <FieldRow key={k} field={k} value={v} state={/^unknown$/i.test(toText(v) ?? "") ? "Unknown" : "Unsourced"} />)}</div>
        </Card>
      ) : null}

      <Section {...SECTIONS[4]} />
      <Section {...SECTIONS[5]} />
      <Section {...SECTIONS[6]} />
      <Section {...SECTIONS[7]} />
      <Section {...SECTIONS[8]} />
      {approval ? (
        <Card>
          <div className="sechead"><h2>Approval policy</h2><span className="note">property_approval_policy · trusted/internal · Unknown ≠ No</span></div>
          <div className="kv">{Object.entries(approval).filter(([k, v]) => k !== "place_id" && k !== "updated_at" && toText(v) !== null).map(([k, v]) => <FieldRow key={k} field={k} value={v} state={/^unknown$/i.test(toText(v) ?? "") ? "Unknown" : "Unsourced"} />)}</div>
        </Card>
      ) : null}

      <Card>
        <div className="sechead"><h2>Commission</h2><span className="note">firewalled — never written by enrichment or this UI</span><Chip tone="accent">firewall</Chip></div>
        <div className="kv">{COMMISSION.map((f) => <FieldRow key={f} field={f} value={r[f]} state={toText(r[f]) === null ? "Missing" : "Unsourced"} />)}</div>
      </Card>

      <Card>
        <div className="sechead"><h2>Sources</h2><span className="note">{prov.size} fields with provenance · property_field_provenance</span></div>
        {prov.size === 0 ? <Empty>No field-level provenance recorded for this property.</Empty> : (
          <table><thead><tr><th>Field</th><th>Value</th><th>Source</th><th>Verification</th><th>Checked</th><th>Job</th></tr></thead><tbody>
            {[...prov.values()].sort((a, b) => a.field_name.localeCompare(b.field_name)).map((p) => <tr key={p.field_name}><td>{labelize(p.field_name)}</td><td>{truncate(p.value, 50)}</td><td className="muted" title={p.source_reference ?? undefined}>{p.source_type ?? "—"}</td><td><StateChip state={p.verification_status === "verified" ? "Verified" : "Needs Review"} /></td><td className="muted">{fmtDate(p.checked_at ?? p.written_at)}</td><td className="faint" style={{ fontSize: 11 }}>{p.job_id ?? "—"}</td></tr>)}
          </tbody></table>
        )}
      </Card>

      <Card>
        <div className="sechead"><h2>History</h2><span className="note">latest {events.length} enrichment events · property_enrichment_events</span></div>
        {events.length === 0 ? <Empty>No enrichment events recorded for this property.</Empty> : (
          <table><thead><tr><th>When</th><th>Field</th><th>Action</th><th>Old → New</th><th>Source</th><th>Reason</th></tr></thead><tbody>
            {events.map((e) => <tr key={e.id}><td className="muted">{fmtDateTime(e.created_at)}</td><td>{labelize(e.field_name)}</td><td><Chip tone={e.action === "written" ? "good" : e.action === "rejected" ? "crit" : "neutral"}>{e.action}</Chip></td><td style={{ fontSize: 12 }}>{truncate(e.old_value, 40)} → {truncate(e.new_value, 40)}</td><td className="muted">{e.source_type ?? "—"}</td><td className="faint" style={{ fontSize: 12 }}>{e.reason ?? "—"} · {e.job_id}</td></tr>)}
          </tbody></table>
        )}
      </Card>
    </>
  )
}
