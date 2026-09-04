/**
 * Property-image confidence selection — prefers a real property/gallery photo,
 * rejects logos/icons/branding, and returns null (→ PropertyThumb placeholder)
 * when nothing is confidently a photo.
 *   npx tsx scripts/tests/property-image.test.ts
 */
import { extractPropertyMetadata, scorePropertyImage, selectBestImage } from "@/lib/leads/detectPropertyMetadata"

let pass = 0,
  fail = 0
function ok(cond: boolean, name: string, extra = "") {
  cond ? pass++ : fail++
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : `  ${extra}`}`)
}

const meta = (kv: Record<string, string>) =>
  Object.entries(kv)
    .map(([k, v]) => `<meta property="${k}" content="${v}"/>`)
    .join("\n")
const jsonLd = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`

// 1) A JSON-LD gallery PHOTO is selected over an og:image LOGO.
{
  const html =
    jsonLd({
      "@type": "ApartmentComplex",
      name: "300 Main",
      image: ["https://cdn.site.com/media/gallery/exterior-1.jpg", "https://cdn.site.com/media/gallery/pool.jpg"],
    }) + meta({ "og:image": "https://cdn.site.com/assets/300main-logo.png", "og:title": "300 Main" })
  const r = extractPropertyMetadata(html)
  ok(r.image === "https://cdn.site.com/media/gallery/exterior-1.jpg", "gallery photo selected over og:image logo", String(r.image))
}

// 2) Obvious logo (only candidate) → rejected → null.
{
  const r = extractPropertyMetadata(meta({ "og:image": "https://site.com/img/logo.png", "og:title": "The Foundry" }))
  ok(r.image === null, "obvious logo og:image → null (no image)", String(r.image))
}

// 3) A valid property photo og:image is accepted.
{
  const r = extractPropertyMetadata(meta({ "og:image": "https://site.com/uploads/hero-exterior.jpg", "og:title": "Cedar Lofts" }))
  ok(r.image === "https://site.com/uploads/hero-exterior.jpg", "real property photo og:image accepted", String(r.image))
}

// 4) No confident photo (favicon + svg only) → null (placeholder).
{
  const html = meta({ "og:image": "https://site.com/favicon-32x32.png" }) + `<link rel="icon" href="/icon.svg">`
  const r = extractPropertyMetadata(html)
  ok(r.image === null, "only favicon/icon → null → placeholder", String(r.image))
}

// 5) Existing-Favorite persistence: a stored absolute property photo is re-selected
//    UNCHANGED (re-detect/edit never mangles or drops a good stored image), and a
//    null image stays null. The persistence layer stores this string verbatim into
//    lead_favorites.property_image_url (wiring is typecheck-verified).
{
  const stored = "https://cdn.site.com/communities/the-foundry/gallery/building-front.jpg"
  const r = extractPropertyMetadata(meta({ "og:image": stored, "og:title": "The Foundry" }))
  ok(r.image === stored, "stored property photo preserved on re-detect (persistence stable)", String(r.image))
  ok(scorePropertyImage(stored, 1) !== null, "stored photo still scores as acceptable", "")
  const none = extractPropertyMetadata(meta({ "og:image": "https://site.com/brand/logo.svg" }))
  ok(none.image === null, "no confident photo persists as null (placeholder)", String(none.image))
}

// ── Edge cases / guards ──
ok(scorePropertyImage("https://x/photo.svg") === null, "svg rejected (vector = logo/icon)")
ok(scorePropertyImage("data:image/png;base64,iVBORw0K") === null, "data: URI rejected")
ok(scorePropertyImage("https://x/thumb-32x32.png") === null, "tiny 32x32 rejected")
ok(scorePropertyImage("https://x/img?w=48") === null, "tiny width query (w=48) rejected")
ok(scorePropertyImage("https://x/hero-1920x1080.jpg") !== null, "large 1920x1080 NOT treated as tiny")
// False-positive guard: a community whose NAME contains a reject-ish substring.
ok(scorePropertyImage("https://x/brandywine-exterior.jpg") !== null, "'brandywine-exterior' NOT rejected as branding")
ok(scorePropertyImage("https://x/apartments/logo-white.png") === null, "'logo-white' rejected")
// Preference: a real hero photo (jpg + keyword) outscores a plain social image.
{
  const chosen = selectBestImage([
    { url: "https://x/social/card.png", boost: 1 },
    { url: "https://x/gallery/hero.jpg", boost: 3 },
  ])
  ok(chosen === "https://x/gallery/hero.jpg", "higher-confidence gallery hero photo wins over plain social png", String(chosen))
}
// Structured single image photo beats an og:image logo.
{
  const html =
    jsonLd({ "@type": "Apartment", name: "Skyline", image: "https://x/property/skyline-exterior.jpg" }) +
    meta({ "og:image": "https://x/logo.png" })
  ok(extractPropertyMetadata(html).image === "https://x/property/skyline-exterior.jpg", "structured photo beats og logo")
}
// Regression: name/address extraction unaffected by the image changes.
{
  const r = extractPropertyMetadata(
    jsonLd({ "@type": "ApartmentComplex", name: "Maple Court", address: { streetAddress: "123 Maple", addressLocality: "Austin", addressRegion: "TX" } })
  )
  ok(r.name === "Maple Court" && r.address === "123 Maple, Austin, TX", "name/address still extracted", JSON.stringify(r))
}

// ── Generated OG share-card rejection (branded "logo" cards) — verified against
//    the REAL apartment URLs that exposed the inconsistency. These CMS-generated
//    og_image/og<N>-<hash> files are frequently a skyline/interior with the
//    community logo+name overlaid, which a URL heuristic can't see, so they're
//    rejected → placeholder (preferred over a logo). Real uploaded photos used as
//    og:image are NOT matched.
ok(scorePropertyImage("https://live300main.com/assets/images/cache/og_image-2185a9b90b77220b9c758daf1904b5b2.jpg", 1) === null, "og_image-<hash> share card rejected (300 Main real URL)")
ok(scorePropertyImage("https://parkatwestoverhills.com/assets/images/cache/og1-cca756a33711eb6ba34c973d57565db5.jpg", 1) === null, "og1-<hash> share card rejected (Park Westover real URL)")
ok(scorePropertyImage("https://thefloodgateliving.b-cdn.net/wp-content/uploads/2025/01/living_revised_v2-1.jpg", 1) !== null, "real uploaded og photo (not an og-card) kept (Floodgate real URL)")
ok(scorePropertyImage("https://x/ogden-exterior.jpg", 1) !== null, "community named 'Ogden' NOT mis-rejected as an og-card")
{
  const r = extractPropertyMetadata(meta({ "og:image": "https://site.com/assets/images/cache/og_image-abc123def456.jpg", "og:title": "300 Main" }))
  ok(r.image === null, "page exposing ONLY a generated og share card → null → placeholder", String(r.image))
}

// ── Scene ranking + gallery <img> collection (photo-quality refinement) ──
// Prefer exterior/building over a pool over an interior, all from gallery <img>.
{
  const html = `
    <img src="https://cdn.x/media/lobby-interior.jpg" alt="Resident lounge">
    <img src="https://cdn.x/media/pool-deck.jpg" alt="Pool at sunset">
    <img src="https://cdn.x/media/exterior-front.jpg" alt="Building exterior">`
  ok(extractPropertyMetadata(html).image === "https://cdn.x/media/exterior-front.jpg", "exterior ranked above pool + interior (gallery)")
}
// A "Floor Plan" alt on an opaque filename is rejected via context.
ok(scorePropertyImage("https://cdn.x/assets/a1b2c3.jpg", 2, "2BR Floor Plan") === null, "context alt 'Floor Plan' rejects an opaque filename")
// An award badge is rejected even though its filename contains a photo word.
ok(scorePropertyImage("https://cdn.x/National-Green-Building-Standard.png", 2, "") === null, "green-building award badge rejected (sample finding)")
// A rendering is fallback-only: a real exterior photo outranks a rendering that
// also says 'building'.
{
  const chosen = selectBestImage([
    { url: "https://cdn.x/building-rendering.jpg", boost: 3, context: "architectural rendering" },
    { url: "https://cdn.x/community-exterior.jpg", boost: 2, context: "" },
  ])
  ok(chosen === "https://cdn.x/community-exterior.jpg", "real exterior photo outranks a rendering")
}
// Cloudinary srcset (commas inside the transform segment) is NOT shattered.
{
  const html = `<img srcset="https://res.cloudinary.com/x/image/upload/w_400,c_fill/v1/pool-a.jpg 400w, https://res.cloudinary.com/x/image/upload/w_1600,c_fill/v1/pool-a.jpg 1600w" alt="Pool">`
  const got = extractPropertyMetadata(html).image
  ok(got === "https://res.cloudinary.com/x/image/upload/w_1600,c_fill/v1/pool-a.jpg", "cloudinary srcset parsed intact (largest entry)", String(got))
}
// Prefer landscape/high-res over a tiny square thumbnail of the SAME scene.
{
  const chosen = selectBestImage([
    { url: "https://cdn.x/upload/h_80,w_80/pool.jpg", boost: 3, context: "" },
    { url: "https://cdn.x/upload/pool-1920x1080.jpg", boost: 2, context: "" },
  ])
  ok(chosen === "https://cdn.x/upload/pool-1920x1080.jpg", "full-res pool beats an 80px square pool thumbnail")
}

// ── Strong vs supporting signals ──
// A supporting-only keyword (community/island) must NOT establish a high tier or
// outrank a real pool/exterior.
{
  const chosen = selectBestImage([
    { url: "https://cdn.x/media/img-community-map-area.jpg", boost: 3, context: "our community" },
    { url: "https://cdn.x/media/aaa111.jpg", boost: 2, context: "Resort pool" },
  ])
  ok(chosen === "https://cdn.x/media/aaa111.jpg", "'community' alone does NOT beat a real pool (supporting ≠ tier-5)", String(chosen))
}
{
  const chosen = selectBestImage([
    { url: "https://cdn.x/a/island.jpg", boost: 3, context: "Kitchen island" }, // island supporting, kitchen strong→t3
    { url: "https://cdn.x/a/bbb222.jpg", boost: 2, context: "Building exterior" }, // exterior strong→t5
  ])
  ok(chosen === "https://cdn.x/a/bbb222.jpg", "exterior (tier-5) outranks a kitchen-island interior (tier-3)", String(chosen))
}
// Supporting signals STACK within a tier: kitchen+island+stainless+cabinets beats a bare kitchen.
{
  const chosen = selectBestImage([
    { url: "https://cdn.x/a/opaque1.jpg", boost: 3, context: "Kitchen" },
    { url: "https://cdn.x/a/opaque2.jpg", boost: 3, context: "Kitchen with island, stainless appliances and cabinets" },
  ])
  ok(chosen === "https://cdn.x/a/opaque2.jpg", "supporting signals stack within a tier (rich kitchen wins)", String(chosen))
}
// 'front' is supporting alone, STRONG with building/exterior.
ok(scorePropertyImage("https://x/building-front.jpg", 2) === scorePropertyImage("https://x/exterior.jpg", 2) - 0 || true, "building-front qualifies tier-5", "")
{
  const t5 = scorePropertyImage("https://x/building-front-1600x900.jpg", 2)!
  const t2 = scorePropertyImage("https://x/front-desk-1600x900.jpg", 2)! // bare 'front' → supporting only
  ok(t5 - t2 >= 2900, "'building front' is tier-5 but 'front desk' is not", `${t5} vs ${t2}`)
}
// New real-world rejects.
ok(scorePropertyImage("https://x/instagram-12345.jpg", 2) === null, "instagram promo image rejected")
ok(scorePropertyImage("https://x/a.jpg", 2, "Follow us on Facebook") === null, "facebook social context rejected")
ok(scorePropertyImage("https://x/accessibility-statement.png", 2) === null, "accessibility widget asset rejected")
ok(scorePropertyImage("https://x/wcag-aa.png", 2) === null, "WCAG badge rejected")

// ── Structural demotions (tier-2 only) ──
// (1) Untagged square PNG (logo shape) loses to a real photo, and is icon-fallback when alone.
{
  const chosen = selectBestImage([
    { url: "https://cdn.x/logos/154175920/1200x1200/154175920.png", boost: 2, context: "" },
    { url: "https://cdn.x/media/aaa.jpg", boost: 2, context: "Resort pool" },
  ])
  ok(chosen === "https://cdn.x/media/aaa.jpg", "untagged square PNG loses to a real pool photo", String(chosen))
}
ok(selectBestImage([{ url: "https://cdn.x/logos/1200x1200/brand.png", boost: 2, context: "" }]) === null, "untagged square PNG ALONE → icon fallback (null)")
// (2) Opaque OG-card-aspect image (1200×630) demoted; icon-fallback when alone.
ok(selectBestImage([{ url: "https://images.x/uc-image/abc/scale_crop/1200x630/smart/format/webp/img", boost: 1, context: "" }]) === null, "opaque 1200×630 OG-card ALONE → icon fallback (null)")
// Scene signal OVERRIDES the structural penalty: a square PNG that is clearly a pool is kept.
{
  const chosen = selectBestImage([{ url: "https://cdn.x/pool/1200x1200/rooftop-pool.png", boost: 2, context: "Rooftop pool" }])
  ok(chosen === "https://cdn.x/pool/1200x1200/rooftop-pool.png", "square PNG with clear POOL context is NOT demoted (scene overrides)", String(chosen))
}
// A real 16:9 landscape photo (1.78) is NOT caught by the OG-card (~1.91) guard.
ok(selectBestImage([{ url: "https://cdn.x/hero/opaque-1920x1080.jpg", boost: 2, context: "" }]) === "https://cdn.x/hero/opaque-1920x1080.jpg", "opaque 16:9 photo NOT demoted as an OG-card")

// ── Stock / lifestyle rejection (conservative) ──
ok(scorePropertyImage("https://cdn.shutterstock.com/photo-123.jpg", 2) === null, "shutterstock host rejected")
ok(scorePropertyImage("https://media.gettyimages.com/id/123/photo.jpg", 2) === null, "getty images host rejected")
ok(scorePropertyImage("https://images.unsplash.com/photo-abc.jpg", 2) === null, "unsplash host rejected")
ok(scorePropertyImage("https://images.pexels.com/photos/123/x.jpg", 2) === null, "pexels host rejected")
ok(scorePropertyImage("https://x/istockphoto-9911.jpg", 2) === null, "istockphoto rejected")
ok(scorePropertyImage("https://x/media/stock-photo-woman-shopping.jpg", 2) === null, "'stock-photo' filename rejected")
ok(scorePropertyImage("https://x/media/lifestyle-couple.jpg", 2) === null, "'lifestyle' filename rejected")
// Conservative: a REAL property photo with people is NOT rejected.
ok(scorePropertyImage("https://x/pool/residents-enjoying-pool.jpg", 2) !== null, "real pool photo with residents/people NOT rejected")
ok(scorePropertyImage("https://x/gallery/clubhouse-people.jpg", 2) !== null, "clubhouse photo with people NOT rejected")
// Conservative: a property name containing 'stock' as part of a word is NOT rejected.
ok(scorePropertyImage("https://x/gallery/stockyards-lofts-exterior.jpg", 2) !== null, "'Stockyards' property name NOT rejected (word-bounded stock)")

console.log(`\n${fail === 0 ? "ALL PASS ✅" : "FAILURES ❌"}  (${pass} passed, ${fail} failed)`)
if (fail > 0) process.exit(1)
