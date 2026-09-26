// PROPERTY IMAGE INTELLIGENCE — canonical selection engine (v1.0).
// Single source of truth for scene classification, property-type-aware ranking, metadata hard
// rejects, and the algorithm version. Both the static and rendered recovery jobs import THIS engine
// — do not fork a parallel image-selection implementation. Ranking is FROZEN for v1.0; improve only
// via an explicit v1.1/v2.0. Pure/deterministic (no I/O); the visual gate + HTTP validation live
// alongside it in the jobs.

export const ALGO_VERSION = "property-image-intelligence-v1.0"

// ── Scene families (also used for Primary/Fallback diversity) ──
export type SceneFamily =
  | "exterior" | "rooftop_view" | "pool" | "kitchen" | "living"
  | "amenity_strong" | "amenity_weak" | "unknown"

export type Scene = { fam: SceneFamily; label: string }

// Classify a candidate from its combined semantic text (alt + title + url/path). ORDER MATTERS and
// encodes the v1.0 fixes:
//   • gym/fitness is checked FIRST so a gym is NEVER mislabeled Pool (or anything else);
//   • "pool table" / "billiards" do NOT count as a Pool;
//   • when BOTH living-area words and "kitchen" appear (open-concept), classify LIVING — a living
//     room is only Kitchen when the kitchen is genuinely the sole/dominant subject.
export function classifyScene(text: string): Scene {
  const t = (text || "").toLowerCase()
  if (/\bfitness\b|\bgym\b|weight room|exercise room|\bcardio\b|workout/.test(t)) return { fam: "amenity_weak", label: "Amenity (fitness/secondary)" }
  if (/\bexterior\b|\bfacade\b|\bentrance\b|\baerial\b|\bdrone\b|two.?story home|home exterior|\bhigh.?rise\b|\btower\b|\bbuilding\b/.test(t)) return { fam: "exterior", label: "Building/Exterior" }
  if ((/\bpool\b|poolside|swimming pool|infinity pool|resort.?pool|rooftop pool|lap pool/.test(t)) && !/pool\s*(table|hall|room)|billiard/.test(t)) return { fam: "pool", label: "Pool" }
  if (/rooftop|skyline|cityscape|\bsky\s?lounge\b/.test(t)) return { fam: "rooftop_view", label: "Rooftop/Skyline/View" }
  const hasKitchen = /\bkitchen\b/.test(t)
  const hasLiving = /living|\bdining\b|family room|great room|\bbedroom\b|\blounge\b|\bmodel\b|\binterior\b|open.?concept|\blobby\b/.test(t)
  if (hasKitchen && !hasLiving) return { fam: "kitchen", label: "Kitchen" }
  if (hasLiving) return { fam: "living", label: "Living/Interior/Model" }
  if (hasKitchen) return { fam: "kitchen", label: "Kitchen" }
  if (/clubhouse|club house|courtyard|cabana|resident lounge/.test(t)) return { fam: "amenity_strong", label: "Amenity (clubhouse/lounge)" }
  return { fam: "unknown", label: "Property photo" }
}

// ── Property-type-aware Primary priority over scene families (v1.0, FROZEN) ──
// Weak amenities (gym/mailroom/etc.) always rank LAST so they never beat a strong exterior/pool/
// kitchen/interior for Primary. Property type is a ranking boost, not a rigid rule.
export type PropertyType = "High-Rise/Mid-Rise" | "Garden/Conventional" | "BTR/Rental Homes"
export const PROPERTY_TYPE_PRIORITY: Record<PropertyType, SceneFamily[]> = {
  "High-Rise/Mid-Rise": ["exterior", "rooftop_view", "pool", "kitchen", "living", "amenity_strong", "amenity_weak", "unknown"],
  "Garden/Conventional": ["pool", "exterior", "kitchen", "living", "amenity_strong", "rooftop_view", "amenity_weak", "unknown"],
  "BTR/Rental Homes": ["exterior", "kitchen", "living", "pool", "amenity_strong", "rooftop_view", "amenity_weak", "unknown"],
}
export function inferPropertyType(name: string, hints: string): PropertyType {
  const b = `${name} ${hints}`.toLowerCase()
  if (/homes for rent|two.?story home|home exterior|attached.*garage|fenced (front )?yard|rental home|build.to.rent|townhome/.test(b)) return "BTR/Rental Homes"
  if (/\btower\b|high.?rise|floor.?to.?ceiling|rooftop|uptown|downtown|skyline/.test(b)) return "High-Rise/Mid-Rise"
  return "Garden/Conventional"
}
export function familyRank(type: PropertyType, fam: SceneFamily): number {
  const i = PROPERTY_TYPE_PRIORITY[type].indexOf(fam)
  return i < 0 ? 99 : i
}

// ── Cheap metadata hard rejects (run BEFORE technical/visual validation) ──
// Provider branding signals + logo/title-card/floorplan/map/social filename signals + svg.
// Entrata /MLv3/9/36/ = branding category (validated across the prototype); keep validating.
export const ENTRATA_BRANDING_PATH = /\/MLv3\/9\/36\//i
const TITLECARD_FILE = /screen_title|%5Bscreen_title%5D|site_title|separator/i
const LOGO_FILE = /logo|wordmark|brandmark|\bbadge\b|\bseal\b|favicon|\bicon\b|\bemblem\b|monogram|\bbco\b|-special\b|\bpromo\b|coming-?soon|placeholder/i
const FLOORPLAN_FILE = /floor\s?plan|\bfloorplan\b|site\s?plan|\bsiteplan\b/i
const MAP_FILE = /static.?map|\bmap[-_.]|maps\.google/i
const SOCIAL_FILE = /\bshare\b|og[-_]?image|twitter[-_]?card|instagram|facebook/i
export function metadataReject(url: string, alt: string): string | null {
  const u = (url || "").toLowerCase(), a = (alt || "").toLowerCase()
  if (/\.svg(\?|#|$)/.test(u)) return "svg"
  if (ENTRATA_BRANDING_PATH.test(url)) return "entrata_branding_path"
  if (TITLECARD_FILE.test(url)) return "titlecard_filename"
  if (FLOORPLAN_FILE.test(u) || /floor\s?plan/.test(a)) return "floorplan"
  if (MAP_FILE.test(u)) return "map"
  if (SOCIAL_FILE.test(u)) return "social_share"
  if (LOGO_FILE.test(u)) return "logo_filename"
  if (/\blogo\b|wordmark|\bbadge\b/.test(a)) return "logo_alt"
  return null
}

// Collapse CDN size/crop variants of one underlying asset so Primary and Fallback are different photos.
export function assetIdentity(url: string): string {
  try {
    const x = new URL(url)
    const seg = (x.pathname.split("/").pop() || x.pathname).toLowerCase().replace(/[-_]?\d{2,5}x\d{2,5}/g, "").replace(/\.(jpe?g|png|webp)$/, "").replace(/-scaled$/, "")
    return `${x.host}${x.pathname.replace(/[^/]+$/, "")}${seg}`
  } catch { return url }
}
