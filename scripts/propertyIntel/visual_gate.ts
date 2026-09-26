// VISUAL property-photo quality gate. Final check before a Primary/Fallback is accepted:
// classify the candidate as PREDOMINANTLY a real property photograph vs a branding/marketing/
// non-photo asset. Uses Claude Haiku 4.5 vision. Cheap deterministic metadata filters run in the
// job BEFORE this; only survivors reach the model. Read-only (no DB writes).
//
// Returns { verdict: "accept"|"reject"|"error", category, confidence, reason }.
// The job treats "error" as needs_manual_review (never an auto-accept on uncertainty).
import sharp from "sharp"

export type GateResult = { verdict: "accept" | "reject" | "error"; category: string; confidence: number; reason: string }

const MODEL = "claude-haiku-4-5-20251001"
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36"

const SYSTEM = `You are a strict image classifier for an apartment-community MARKETING system.
Decide whether the image is PREDOMINANTLY a real PHOTOGRAPH of the actual property/community
(building exterior, pool, kitchen, unit interior, living/model, clubhouse/lounge, courtyard,
rooftop, fitness, aerial of the property, etc.) — verdict "accept" — OR predominantly a
non-photographic / branding / marketing asset — verdict "reject".

REJECT (not a property photo): logos, wordmarks, brand/title cards, monograms, emblems/seals,
badges, icons, promotional graphics, "$ off / months free / special" advertisements, text-heavy
marketing cards, floorplans, site maps, maps, placeholders, and generic STOCK/LIFESTYLE images
where posed people / food / pets / a city skyline stock shot are the PRIMARY subject rather than
the community itself.

CRITICAL — TITLE / HERO CARDS: If a LARGE superimposed community NAME or marketing TITLE is
overlaid across the image (e.g. big centered text like "BRIDGE AT SOCO CROSSING", "THE X
APARTMENTS", a tagline, or a call-to-action) — even when a dimmed building/pool photo sits behind
it — that is a BRANDED TITLE CARD: verdict "reject", category "brand_card". The superimposed
marketing title makes it unsuitable as a clean property photo. This is DIFFERENT from incidental
signage.

ACCEPT a genuine property photograph even if it contains INCIDENTAL text or people: small building
signage that is physically part of the actual building, a small sign by the pool, appliance
branding in a real kitchen, a small corner watermark, or residents incidentally enjoying the real
pool/clubhouse. Incidental text is small and part of the real scene; a title card has large text
deliberately overlaid on top. The deciding question is ALWAYS: would this read as a clean marketing
photograph of the property, or as a logo / title card / advertisement?

Respond with ONLY a compact JSON object, no prose:
{"verdict":"accept"|"reject","category":"building_exterior|pool|kitchen|interior|living|amenity|rooftop|aerial|other_property_photo|logo|wordmark|brand_card|monogram|emblem|promo_graphic|text_ad|floorplan|map|placeholder|icon|stock_lifestyle|unrelated|unknown","confidence":0.0-1.0,"reason":"short"}`

export async function classifyPropertyImage(url: string): Promise<GateResult> {
  let b64: string, media: "image/jpeg"
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 12000)
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "image/*", "Range": "bytes=0-3145727" }, signal: ac.signal }).finally(() => clearTimeout(t))
    if (r.status >= 400) return { verdict: "error", category: "fetch", confidence: 0, reason: `http_${r.status}` }
    const buf = Buffer.from(await r.arrayBuffer())
    // Normalize to a small JPEG (keeps vision tokens/cost low, strips webp/png variance).
    const jpeg = await sharp(buf).resize(640, 640, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 80 }).toBuffer()
    b64 = jpeg.toString("base64"); media = "image/jpeg"
  } catch (e) { return { verdict: "error", category: "decode", confidence: 0, reason: (e as Error).name } }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await anthropic.messages.create({
      model: MODEL, max_tokens: 200, temperature: 0, system: SYSTEM,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: media, data: b64 } },
        { type: "text", text: "Classify this image. JSON only." },
      ] }],
    })
    const text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim()
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return { verdict: "error", category: "parse", confidence: 0, reason: text.slice(0, 60) }
    const j = JSON.parse(m[0]) as Partial<GateResult>
    const verdict = j.verdict === "accept" ? "accept" : "reject"
    return { verdict, category: String(j.category ?? "unknown"), confidence: Number(j.confidence ?? 0), reason: String(j.reason ?? "") }
  } catch (e) { return { verdict: "error", category: "api", confidence: 0, reason: (e as Error).message.slice(0, 80) } }
}
