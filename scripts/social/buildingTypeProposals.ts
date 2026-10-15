// BUILDING TYPE PROPOSALS — read-only. Prints what it would classify, and the evidence for each.
//
// This is NOT the keyword classifier that was rejected. That one scored loose words across the
// whole record and called Tricon Viridian's 46 detached houses "Mixed" because the text contained
// "bedroom" near "townhome". This one fires only on EXPLICIT, VERIFIED statements and quotes the
// sentence it fired on, so every proposal can be checked by eye before anything is written.
//
// Anything that does not match a rule outright comes back blank. Blank is the correct answer for a
// property whose classification nobody has verified.

import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import type { BuildingType } from "@/lib/social/buildingTypes"

type Rec = { property_name: string; place_id: string; stable: Record<string, unknown> }
export type Proposal = {
  property: string; placeId: string
  buildingType: BuildingType | null
  rule: string
  evidence: string
}

const WORD_NUM: Record<string, number> = {
  four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, "twenty-one": 21, "twenty-two": 22, "twenty-three": 23, "twenty-five": 25,
  "twenty-eight": 28, "thirty-two": 32, "thirty-three": 33, "forty": 40, "forty-one": 41,
  "forty-five": 45, "fifty-one": 51,
}

/** A VERIFIED storey count, or null. Prefers the dedicated key; falls back to an explicit
 *  "N storeys/floors" statement in the research prose, digits or spelled out. */
function storeys(s: Record<string, unknown>): { n: number; from: string } | null {
  if (typeof s.stories === "number" && s.stories > 0) return { n: s.stories, from: `stories: ${s.stories}` }
  const text = [s.architecture, s.layouts].flatMap((v) => (Array.isArray(v) ? v : [])).map(String)
  for (const line of text) {
    const d = line.match(/\b(\d{1,2})[-\s](?:storey|story|stories|storeys|floors?)\b/i)
    if (d) return { n: Number(d[1]), from: line }
    // BOTH joiners. "FIVE-STOREY apartment building" is hyphenated and singular; requiring a space
    // and a plural missed it, and Alexan Junction Heights came back as an unclassified apartment
    // community when its own research states the height on the same line.
    const w = line.match(/\b([a-z]+(?:-[a-z]+)?)[-\s](?:storey|story|storeys|stories|floors?)\b/i)
    if (w && WORD_NUM[w[1].toLowerCase()]) return { n: WORD_NUM[w[1].toLowerCase()], from: line }
  }
  return null
}

const lines = (s: Record<string, unknown>) =>
  [s.layouts, s.architecture].flatMap((v) => (Array.isArray(v) ? v : [])).map(String)

export function propose(r: Rec): Proposal {
  const s = r.stable ?? {}
  const L = lines(s)
  const blob = L.join(" | ")
  const hit = (re: RegExp) => L.find((l) => re.test(l)) ?? ""

  // A VERIFIED TOWER IS A TOWER, whatever its units are called. Parkside Residences has "SIXTEEN
  // TWO-STOREY TOWNHOME-STYLE UNITS ON FLOORS 15 THROUGH 34" — townhome-style homes inside a
  // 34-storey building. Letting unit form win there produced "Townhome Community" for a high-rise.
  const tall = storeys(s)
  if (tall && tall.n >= 12) {
    return { property: r.property_name, placeId: r.place_id, buildingType: "High-Rise",
      rule: `verified ${tall.n} storeys (>= 12) — height outranks unit form`, evidence: tall.from }
  }

  // UNIT FORM NEXT. A 46-house rental community is a Rental Home Community whether or not anyone
  // recorded its height. The apartment signal requires the WORD "apartment" — "bedroom" is not
  // one, which is precisely what broke the rejected classifier.
  // PLURALS COUNT. /\b(townhome|townhouse)\b/ does not match "TOWNHOMES" — the word boundary
  // falls before the s — so every community that wrote the plural read as having no townhomes at
  // all. Iron Rock Ranch ("84 townhomes + 216 apartments") came back "Apartment Community" and
  // Greenway Village ("DETACHED HOMES AND TOWNHOMES") came back "Rental Home Community".
  const detached = /\b(single-family|single family|detached|build-to-rent|build to rent|casitas?)\b/i
  const townhome = /\btownhomes?\b|\btownhouses?\b/i
  const apartment = /\bapartments?\b/i
  // "duplex" describes ATTACHED homes, which is what a townhome is. It was in the detached list
  // and sent "DUPLEX-STYLE TOWNHOMES" to Rental Home Community.
  const duplex = /\bduplex\b/i

  // NEGATIONS ARE NOT SIGNALS. "a gated community of TOWNHOME-STYLE HOMES, not a traditional
  // apartment community" contains the word apartment while saying the opposite; counting it made
  // Enclave at Mason Creek "Mixed".
  const asserted = (re: RegExp) =>
    L.some((l) => re.test(l) && !/\bnot a\b|\bnot an\b|\brather than a\b|\bNOT\s+(?:a|an)\b/i.test(l))
  // NOR IS MY OWN INFERENCE. Lines that reason ABOUT the stored value are this record's commentary,
  // not a source, and Oasis Stone Oak was classified from one of them.
  const sourced = (re: RegExp) =>
    L.some((l) => re.test(l) && !/\bthe pattern of\b|\bsupports the stored\b|\bconfirms the stored\b|\bstrongly suggest\b/i.test(l))

  const hasDetached = asserted(detached) && sourced(detached)
  const hasTown = (asserted(townhome) && sourced(townhome)) || duplex.test(blob)
  const hasApt = asserted(apartment) && sourced(apartment)

  if (hasTown && (hasApt || hasDetached)) {
    return { property: r.property_name, placeId: r.place_id, buildingType: "Mixed Community",
      rule: "explicit mix of townhomes and another home type", evidence: hit(townhome) }
  }
  if (hasDetached && !hasTown && !hasApt) {
    return { property: r.property_name, placeId: r.place_id, buildingType: "Rental Home Community",
      rule: "explicit detached / single-family / build-to-rent", evidence: hit(detached) }
  }
  if (hasTown && !hasApt && !hasDetached) {
    return { property: r.property_name, placeId: r.place_id, buildingType: "Townhome Community",
      rule: "explicit townhomes, no other home type named", evidence: hit(townhome) }
  }

  // HEIGHT SECOND, and only from a verified count.
  const st = storeys(s)
  if (st && st.n >= 12) {
    return { property: r.property_name, placeId: r.place_id, buildingType: "High-Rise",
      rule: `verified ${st.n} storeys (>= 12)`, evidence: st.from }
  }
  if (st && st.n >= 4) {
    return { property: r.property_name, placeId: r.place_id, buildingType: "Mid-Rise",
      rule: `verified ${st.n} storeys (4-11)`, evidence: st.from }
  }
  if (/\bmid-rise\b/i.test(blob)) {
    return { property: r.property_name, placeId: r.place_id, buildingType: "Mid-Rise",
      rule: "described as mid-rise in its own research", evidence: hit(/\bmid-rise\b/i) }
  }
  // An apartment community with NO height at all is still an apartment community, but only when the
  // word itself is recorded — never inferred from bedroom counts.
  if (hasApt && !hasTown && !hasDetached) {
    return { property: r.property_name, placeId: r.place_id, buildingType: "Apartment Community",
      rule: "explicitly described as apartments, no other home type named", evidence: hit(apartment) }
  }
  return { property: r.property_name, placeId: r.place_id, buildingType: null,
    rule: "no explicit unit form and no verified height", evidence: blob.slice(0, 120) }
}

export async function loadResearch() {
  const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]))
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL as string, env.SUPABASE_SERVICE_ROLE_KEY as string)
  const { data, error } = await sb.from("social_property_research").select("property_name, place_id, stable")
  if (error) throw error
  return { sb, records: (data ?? []) as Rec[] }
}

async function main() {
  const { records } = await loadResearch()
  const proposals = records.map(propose)
  const by = new Map<string, Proposal[]>()
  for (const p of proposals) {
    const k = p.buildingType ?? "(blank — flagged)"
    if (!by.has(k)) by.set(k, [])
    by.get(k)!.push(p)
  }
  for (const [k, list] of [...by.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n### ${k} — ${list.length}`)
    for (const p of list) console.log(`  ${p.property.padEnd(42).slice(0, 42)} │ ${p.rule.padEnd(50).slice(0, 50)} │ ${p.evidence.slice(0, 80)}`)
  }
  console.log(`\nTOTAL ${proposals.length} · would write ${proposals.filter((p) => p.buildingType).length} · blank ${proposals.filter((p) => !p.buildingType).length}`)
}

if (process.argv[1]?.endsWith("buildingTypeProposals.ts")) void main().catch((e) => { console.error(e); process.exit(1) })
