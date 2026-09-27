// Control Center — Property Intelligence metrics (READ-ONLY, server-side).
//
// Every figure here is computed live from the canonical Supabase sources established by the
// reconciliation audit — nothing is hard-coded or estimated:
//   • Features        → property_attributes (distinct place_id)
//   • Floor plans     → property_floor_plans (distinct place_id)
//   • Classification  → property_catalog signals (inventory_type | structural_scale | property_grade |
//                       classification_tags). The property_attributes dictionary no longer carries
//                       building_style / residential_type keys, so it is NOT used for classification.
//   • Keywords        → amenity_keywords / location_keywords JSONB arrays, counted only when NON-EMPTY
//   • Images          → property_image_url / property_image_url_backup + image_selection_state /
//                       image_backup_state + property_image_status
//   • Specials        → property_specials (structured, one row per property); current_special shown as detail
// Reads use the server-only service-role client AFTER the platform-admin page gate; PI tables are
// service-role-only under RLS. Results are cached briefly (unstable_cache) because the distinct counts
// paginate large child tables. No writes, ever.
import { unstable_cache } from "next/cache"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { pctOf } from "./format"

export type Category = {
  key: string
  label: string
  count: number | null      // null = source unavailable / errored
  pct: number               // 0..100
  note: string              // short status column (what/where)
  source: string            // canonical source, for the title attribute
  na?: boolean              // Commission: firewalled, not a completeness metric
}

export type PiMetrics = {
  generatedAt: string
  total: number
  populated: number
  missing: number
  fallback: number
  changeRequestedPrimary: number
  changeRequestedBackup: number
  v11Writes: number
  v10Writes: number
  imageStatus: { valid: number; no_image: number; unreachable: number }
  markets: { Dallas: number; Austin: number; Houston: number; "San Antonio": number; none: number }
  categories: Category[]
  featuresRows: number | null
  floorPlanRows: number | null
  specialsRows: number | null
  currentSpecialActive: number
  approvalPolicyRows: number | null
  distinctErrors: string[]
}

const T = () => supabaseAdmin.from("property_catalog")

async function count(q: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const r = await q
  if (r.error) throw new Error(r.error.message)
  return r.count ?? 0
}
const head = { count: "exact" as const, head: true }
const nonEmpty = (col: string) => count(T().select("*", head).not(col, "is", null).neq(col, ""))
const notNull = (col: string) => count(T().select("*", head).not(col, "is", null))
const jsonbNonEmpty = (col: string) => count(T().select("*", head).not(col, "eq", "[]"))

/** Distinct place_id count for a child table, paginated (PostgREST has no COUNT(DISTINCT)). */
async function distinctPlaceIds(table: string): Promise<{ distinct: number | null; rows: number | null; error?: string }> {
  try {
    const rows = await count(supabaseAdmin.from(table).select("*", head))
    const set = new Set<string>()
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseAdmin.from(table).select("place_id").order("place_id").range(from, from + 999)
      if (error) return { distinct: null, rows, error: error.message }
      if (!data?.length) break
      for (const r of data as { place_id: string }[]) set.add(r.place_id)
      if (data.length < 1000) break
    }
    return { distinct: set.size, rows }
  } catch (e) { return { distinct: null, rows: null, error: (e as Error).message } }
}

async function safeCount(fn: () => Promise<number>): Promise<number | null> {
  try { return await fn() } catch { return null }
}

/** Uncached compute (exported for verification scripts; pages use the cached getPiMetrics). */
export async function computePiMetrics(): Promise<PiMetrics> {
  const total = await count(T().select("*", head))
  const [
    populated, missing, fallback, crP, crB, v11Writes, v10Writes,
    stValid, stNoImage, stUnreachable,
    mDallas, mAustin, mHouston, mSA, mNone,
    identityWebsite, identityPhone, identityRating,
    pets, yearBuilt, management, classification, amenityKw, locationKw, currentSpecialActive, landmark1,
  ] = await Promise.all([
    nonEmpty("property_image_url"),
    count(T().select("*", head).or("property_image_url.is.null,property_image_url.eq.")),
    nonEmpty("property_image_url_backup"),
    count(T().select("*", head).eq("image_selection_state", "change_requested")),
    count(T().select("*", head).eq("image_backup_state", "change_requested")),
    count(T().select("*", head).ilike("property_image_source_detail", "%property-image-intelligence-v1.1%")),
    count(T().select("*", head).ilike("property_image_source_detail", "%property-image-intelligence-v1.0%")),
    count(T().select("*", head).eq("property_image_status", "valid")),
    count(T().select("*", head).eq("property_image_status", "no_image")),
    count(T().select("*", head).eq("property_image_status", "unreachable")),
    count(T().select("*", head).eq("market", "Dallas")),
    count(T().select("*", head).eq("market", "Austin")),
    count(T().select("*", head).eq("market", "Houston")),
    count(T().select("*", head).eq("market", "San Antonio")),
    count(T().select("*", head).is("market", null)),
    nonEmpty("website_url"), nonEmpty("phone"), notNull("google_rating"),
    nonEmpty("pets_allowed"), notNull("year_built"), nonEmpty("management_company"),
    count(T().select("*", head).or("inventory_type.not.is.null,structural_scale.not.is.null,property_grade.not.is.null,classification_tags.not.is.null")),
    jsonbNonEmpty("amenity_keywords"), jsonbNonEmpty("location_keywords"),
    nonEmpty("current_special"), nonEmpty("nearby_landmark_1"),
  ])
  const [features, floorPlans] = await Promise.all([distinctPlaceIds("property_attributes"), distinctPlaceIds("property_floor_plans")])
  const specialsRows = await safeCount(() => count(supabaseAdmin.from("property_specials").select("*", head)))
  const approvalPolicyRows = await safeCount(() => count(supabaseAdmin.from("property_approval_policy").select("*", head)))
  const landmarkMetrics = await safeCount(() => count(supabaseAdmin.from("property_landmark_metrics").select("*", head)))

  const cat = (key: string, label: string, c: number | null, note: string, source: string): Category =>
    ({ key, label, count: c, pct: c === null ? 0 : pctOf(c, total), note, source })

  const categories: Category[] = [
    cat("identity", "Identity", identityWebsite, `website · phone ${identityPhone.toLocaleString()} · rating ${identityRating.toLocaleString()}`, "property_catalog.website_url (phone / google_rating shown alongside)"),
    cat("images", "Images", populated, "Primary populated", "property_catalog.property_image_url"),
    cat("pets", "Pets", pets, "approval domain, partial", "property_catalog.pets_allowed"),
    cat("year_built", "Year built", yearBuilt, "partial", "property_catalog.year_built"),
    cat("management", "Management", management, "partial", "property_catalog.management_company"),
    cat("features", "Features", features.distinct, features.distinct === null ? "source unavailable" : `${(features.rows ?? 0).toLocaleString()} attribute rows · property_attributes`, "property_attributes — distinct place_id (138-term dictionary)"),
    cat("classification", "Classification", classification, "catalog columns · ⚠ see note", "property_catalog: inventory_type | structural_scale | property_grade | classification_tags (any present)"),
    cat("floor_plans", "Floor plans", floorPlans.distinct, floorPlans.distinct === null ? "source unavailable" : `${(floorPlans.rows ?? 0).toLocaleString()} plans · property_floor_plans`, "property_floor_plans — distinct place_id"),
    cat("amenity_keywords", "Amenity keywords", amenityKw, "curated ≤3 · ranking layer", "property_catalog.amenity_keywords (JSONB, non-empty array)"),
    cat("location_keywords", "Location keywords", locationKw, "curated ≤3 · ranking layer", "property_catalog.location_keywords (JSONB, non-empty array)"),
    cat("specials", "Specials", specialsRows, specialsRows === null ? "source unavailable" : `structured rows · ${currentSpecialActive} active current_special`, "property_specials (one row per property); current_special = active badge"),
    cat("location_detail", "Location detail", landmark1, landmarkMetrics ? `${landmarkMetrics.toLocaleString()} landmark metrics cached` : "landmarks pending resolver", "property_catalog.nearby_landmark_1 (+ property_landmark_metrics)"),
    { key: "commission", label: "Commission", count: null, pct: 0, note: "firewalled · never enrichment-writable", source: "send_commission / escort_commission / bonus_flat — not a completeness metric", na: true },
  ]

  return {
    generatedAt: new Date().toISOString(),
    total, populated, missing, fallback,
    changeRequestedPrimary: crP, changeRequestedBackup: crB,
    v11Writes, v10Writes,
    imageStatus: { valid: stValid, no_image: stNoImage, unreachable: stUnreachable },
    markets: { Dallas: mDallas, Austin: mAustin, Houston: mHouston, "San Antonio": mSA, none: mNone },
    categories,
    featuresRows: features.rows, floorPlanRows: floorPlans.rows, specialsRows, currentSpecialActive, approvalPolicyRows,
    distinctErrors: [features.error, floorPlans.error].filter(Boolean) as string[],
  }
}

export const getPiMetrics = unstable_cache(computePiMetrics, ["cc-pi-metrics-v1"], { revalidate: 300, tags: ["cc-pi-metrics"] })
