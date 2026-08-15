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

console.log(`\n${fail === 0 ? "ALL PASS ✅" : "FAILURES ❌"}  (${pass} passed, ${fail} failed)`)
if (fail > 0) process.exit(1)
