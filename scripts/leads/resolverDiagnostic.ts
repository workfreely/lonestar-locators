/**
 * DESTINATION RESOLVER DIAGNOSTIC — read-only, resolver behaviour UNCHANGED.
 *
 * Answers one question: when a client gives us a REAL, resolvable location, does
 * the resolver handle it?
 *
 * Two independent calls per input:
 *   1. resolveDestination() — the real verdict, exactly as the consumer gets it.
 *   2. a raw Places searchText with the SAME request shape, purely to show what
 *      candidates Google returned, so an "ambiguous" verdict can be judged as
 *      appropriately cautious or overly restrictive.
 *
 * The raw call never feeds the verdict; it only makes the verdict explicable.
 *
 * NOTE ON TEST INPUTS: every entry must be a real, verifiable location. A
 * placeholder like "123 Main St" fails to resolve because it does not exist,
 * which says nothing about whether real client-supplied addresses work — that
 * mistake produced a wrong conclusion once already.
 *
 * Run: node --env-file=.env.local --import tsx scripts/leads/resolverDiagnostic.ts
 */
import { resolveDestination } from "@/lib/criteria/resolveDestination"

const CASES: Array<{ category: string; input: string }> = [
  { category: "full street address", input: "100 Auditorium Circle, San Antonio, TX 78205" },
  { category: "landmark", input: "The Pearl San Antonio" },
  { category: "landmark", input: "SeaWorld San Antonio" },
  { category: "military base", input: "Lackland AFB" },
  { category: "military base", input: "Fort Sam Houston" },
  { category: "specific hospital", input: "Metropolitan Methodist Hospital San Antonio" },
  { category: "specific hospital", input: "Brooke Army Medical Center" },
  { category: "business + location", input: "Dave's Hot Chicken on Potranco" },
  { category: "road", input: "Potranco Road" },
  { category: "cross streets", input: "Potranco Rd & Loop 1604" },
  { category: "cross streets", input: "Culebra Rd & Loop 1604" },
  { category: "ZIP as anchor", input: "78245" },
  // Deliberately expected to stay ambiguous under the 1 km V1 rule.
  { category: "business cluster", input: "Bandera and 1604" },
  { category: "vague hospital", input: "Methodist" },
  { category: "business, no context", input: "Dave's Hot Chicken" },
]

/** The resolver's exact request shape, for diagnostics only. */
const BIAS = { rectangle: { low: { latitude: 29.1, longitude: -98.9 }, high: { latitude: 29.8, longitude: -98.2 } } }

async function rawCandidates(textQuery: string) {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) return []
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress" },
    body: JSON.stringify({ textQuery, maxResultCount: 5, locationBias: BIAS }),
  })
  if (!res.ok) return []
  const j = (await res.json()) as { places?: Array<{ id?: string; displayName?: { text?: string }; formattedAddress?: string }> }
  return (j.places ?? []).map((p) => ({ id: String(p.id ?? ""), name: String(p.displayName?.text ?? ""), address: String(p.formattedAddress ?? "") }))
}

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n))

async function main() {
  console.log(`\nDESTINATION RESOLVER DIAGNOSTIC — ${CASES.length} real locations, resolver UNCHANGED\n`)
  const results = await Promise.all(
    CASES.map(async (c) => ({ ...c, verdict: await resolveDestination(c.input), candidates: await rawCandidates(c.input) })),
  )

  const W = [22, 34, 12, 12, 26]
  console.log(["Category", "Input", "Status", "Selection", "Canonical label"].map((h, i) => pad(h, W[i])).join("│ "))
  console.log(W.map((w) => "─".repeat(w)).join("┼─"))
  for (const r of results) {
    const label = r.verdict.status === "resolved" ? r.verdict.destination.label : "—"
    const sel = r.verdict.status === "resolved" ? (r.verdict.destination.selection ?? "—") : "—"
    const pid = r.verdict.status === "resolved" ? r.verdict.destination.placeId : "—"
    console.log([r.category, r.input, r.verdict.status, sel, label].map((c, i) => pad(String(c), W[i])).join("│ "))
    void pid
  }

  console.log("\nRETURNED LOCATION (top Places match) + AMBIGUITY DETAIL")
  for (const r of results) {
    const top = r.candidates[0]
    console.log(`\n  ${r.input}`)
    console.log(`    status: ${r.verdict.status}`)
    if (top) console.log(`    top match: ${top.name} — ${top.address}`)
    if (r.verdict.status === "resolved") {
      console.log(`    canonical: ${r.verdict.destination.label}  |  ${r.verdict.destination.placeId}`)
    } else if (r.verdict.status === "ambiguous") {
      console.log(`    REJECTED because these are genuinely different places:`)
      for (const c of r.candidates) console.log(`      · ${c.name} — ${c.address}`)
    } else if (r.verdict.status === "unavailable") {
      console.log(`    reason: ${r.verdict.reason}`)
    } else if (r.verdict.status === "not_found") {
      console.log(`    Places returned ${r.candidates.length} candidate(s)`)
      for (const c of r.candidates) console.log(`      · ${c.name} — ${c.address}`)
    }
  }
}
main()
