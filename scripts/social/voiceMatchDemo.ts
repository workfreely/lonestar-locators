/**
 * MATCHING DEMONSTRATION — real properties, real clips, every decision shown.
 *
 *   npx tsx scripts/social/voiceMatchDemo.ts [--limit 10]
 *
 * READ-ONLY. It reads property_catalog, classifies the 58 recordings from their filenames, runs
 * the real selector, and prints what it chose, why, and what it refused. Nothing is written and
 * no video is rendered.
 *
 * It exists because "the matcher works" is not a claim anyone should take on faith. The rejections
 * are printed alongside the selections for the same reason: a system that always finds a match is
 * not matching, it is guessing.
 */
import { promises as fs } from "node:fs"
import path from "node:path"
import os from "node:os"
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"

/** Load .env.local the way `next dev` would. These scripts run outside Next, so nothing else does it. */
function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line)
      if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "")
    }
  } catch { /* CI supplies them directly */ }
}
loadEnv()
import {
  parseVoiceClip, selectVoiceClips, isClipCompatible, MARKET_LABEL,
  type VoiceClipMeta, type PropertyFacts, type VoiceMarket,
} from "@/lib/social/voiceLibrary"

const LIB = path.join(os.homedir(), "Downloads", "Locator Beast Audio")
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] ?? null : null }

/** property_catalog.market → the market code the clips use. Anything else is unknown, not a guess. */
function toMarket(market: string | null): VoiceMarket | null {
  switch ((market ?? "").trim()) {
    case "San Antonio": return "SATX"
    case "Dallas": return "DAL"
    case "Houston": return "HOU"
    default: return null       // Austin is not a market we have recordings for
  }
}

/**
 * The property's type, from the two places the catalog actually records it.
 *
 * `property_type` is null on all 4,204 rows, so it cannot be used. `inventory_type` carries a
 * value on 710 of them, and the per-type starting rents are a second, independent signal: a
 * non-null penthouse_starting_rent means the property HAS penthouses.
 *
 * `townhome_loft` is deliberately left unresolved — it names two different CTA keywords (TOWN and
 * LOFT) and the catalog does not say which. Guessing would put the wrong word in a video.
 */
function toPropertyType(r: Record<string, unknown>): { type: string | null; note: string | null } {
  const inv = String(r.inventory_type ?? "")
  if (inv === "high-rise" || inv === "rental_tower") return { type: "High-Rise", note: null }
  if (inv === "rental_home") return { type: "Rental Home", note: null }
  if (inv === "townhome_loft") return { type: null, note: "'townhome_loft' names two CTA keywords — the editor asks; social_content.property_type usually answers" }
  if (r.penthouse_starting_rent != null) return { type: "Penthouse", note: "from penthouse_starting_rent" }
  if (r.loft_starting_rent != null) return { type: "Loft", note: "from loft_starting_rent" }
  if (r.townhome_starting_rent != null) return { type: "Townhome", note: "from townhome_starting_rent" }
  if (r.onebr_starting_rent != null || r.twobr_starting_rent != null) return { type: "Apartment", note: "from bedroom starting rents" }
  return { type: null, note: "no type recorded" }
}

/** The lowest verified rent — what "starting at" means, and what a price claim is checked against. */
function startingRent(r: Record<string, unknown>): { rent: number | null; from: string | null } {
  const cols = ["studio_starting_rent", "onebr_starting_rent", "twobr_starting_rent", "threebr_starting_rent",
    "fourbr_starting_rent", "townhome_starting_rent", "loft_starting_rent", "penthouse_starting_rent"]
  let best: { rent: number; from: string } | null = null
  for (const c of cols) {
    const v = Number(r[c])
    if (Number.isFinite(v) && v > 0 && (!best || v < best.rent)) best = { rent: v, from: c }
  }
  return best ? { rent: best.rent, from: best.from } : { rent: null, from: null }
}

async function loadClips(): Promise<VoiceClipMeta[]> {
  const out: VoiceClipMeta[] = []
  for (const d of (await fs.readdir(LIB, { withFileTypes: true })).filter((x) => x.isDirectory())) {
    for (const f of await fs.readdir(path.join(LIB, d.name))) {
      if (f.toLowerCase().endsWith(".m4a")) out.push(parseVoiceClip(d.name, f))
    }
  }
  return out
}

async function main() {
  const limit = Number(arg("limit") ?? 10)
  const clips = await loadClips()
  console.log(`${clips.length} recordings classified from filenames\n`)

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const cols = "place_id, property_name, city, market, inventory_type, studio_starting_rent, onebr_starting_rent, " +
    "twobr_starting_rent, threebr_starting_rent, fourbr_starting_rent, townhome_starting_rent, loft_starting_rent, " +
    "penthouse_starting_rent, amenity_keywords"

  // A spread worth demonstrating: each market, each inventory type, and the awkward cases —
  // a property with no rent, and one in a market we have no recordings for.
  const picks: Record<string, unknown>[] = []
  const seen = new Set<string>()
  const add = (rows: Record<string, unknown>[] | null) => {
    for (const r of rows ?? []) { const k = String(r.place_id); if (!seen.has(k) && picks.length < limit) { seen.add(k); picks.push(r) } }
  }
  for (const m of ["San Antonio", "Dallas", "Houston"]) {
    add((await sb.from("property_catalog").select(cols).eq("market", m).not("onebr_starting_rent", "is", null).limit(2)).data)
  }
  for (const t of ["high-rise", "rental_home", "townhome_loft"]) {
    add((await sb.from("property_catalog").select(cols).eq("inventory_type", t).limit(1)).data)
  }
  add((await sb.from("property_catalog").select(cols).not("penthouse_starting_rent", "is", null).limit(1)).data)
  add((await sb.from("property_catalog").select(cols).eq("market", "Austin").limit(1)).data)   // no recordings exist
  add((await sb.from("property_catalog").select(cols).is("onebr_starting_rent", null).is("market", null).limit(1)).data)
  add((await sb.from("property_catalog").select(cols).limit(limit)).data)

  let matched = 0, review = 0
  for (const [i, r] of picks.slice(0, limit).entries()) {
    const market = toMarket(r.market as string | null)
    const { type, note } = toPropertyType(r)
    const { rent, from } = startingRent(r)
    const facts: PropertyFacts = { market, startingRent: rent, propertyType: type }

    console.log("─".repeat(96))
    console.log(`${i + 1}. ${r.property_name}`)
    console.log(`   city ${r.city ?? "—"} · market ${r.market ?? "—"}${market ? ` → ${market}` : " → NO RECORDINGS FOR THIS MARKET"}`)
    console.log(`   type ${type ?? "—"}${note ? `  (${note})` : ""}   inventory_type ${r.inventory_type ?? "—"}`)
    console.log(`   starting rent ${rent ? `$${rent.toLocaleString()}` : "NOT VERIFIED"}${from ? `  (${from})` : ""}`)

    const sel = selectVoiceClips(facts, clips)
    if (sel.needsReview) { review++; console.log(`\n   → NO HOOK SELECTED — needs review, no voice is added`) }
    else matched++

    if (sel.hook) {
      console.log(`\n   HOOK  ${sel.hook.clip.originalFilename}`)
      console.log(`         "${sel.hook.clip.displayName}"   [filename-derived; exact wording needs a transcript]`)
      for (const w of sel.hook.why) console.log(`         · ${w}`)
    }
    if (sel.cta) {
      console.log(`\n   CTA   ${sel.cta.clip.originalFilename}`)
      console.log(`         "${sel.cta.clip.displayName}"   [filename-derived; exact wording needs a transcript]`)
      for (const w of sel.cta.why) console.log(`         · ${w}`)
    } else {
      console.log(`\n   CTA   none eligible`)
    }

    // A representative slice of the refusals, grouped by reason so the pattern is visible.
    const byReason = new Map<string, string[]>()
    for (const x of sel.rejected) {
      const key = x.reasons[0].replace(/\$[\d,]+/g, "$X")
      byReason.set(key, [...(byReason.get(key) ?? []), x.clip.originalFilename])
    }
    console.log(`\n   REJECTED ${sel.rejected.length} of ${clips.length}:`)
    for (const [reason, files] of [...byReason.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 4)) {
      console.log(`         ${files.length.toString().padStart(2)} × ${reason}`)
      console.log(`              e.g. ${files.slice(0, 2).join(", ")}`)
    }
    console.log()
  }
  console.log("─".repeat(96))
  console.log(`\n${matched} matched, ${review} sent to review (no voice added rather than a wrong one)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
