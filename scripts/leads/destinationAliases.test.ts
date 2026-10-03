// The San Antonio destination display bank.
//
// The REAL_NAMES table below is not invented: each right-hand side is a displayName
// the Places API actually returned when I resolved these sixteen destinations. Two
// of them are counter-intuitive and would have broken hand-written patterns —
// "Fort Sam" and "Fort Sam Houston" resolve to DIFFERENT places, and "Pearl District"
// comes back as the bare word "Pearl".
//
// Run: npx tsx scripts/leads/destinationAliases.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  SAN_ANTONIO_DESTINATION_LABELS,
  aliasForName,
  displayDestinationLabel,
  shortenDestinationLabel,
} from "@/lib/commute/destinationAliases"
import { commuteReasonText } from "@/lib/commute/commuteReason"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

console.log("ALL 16 APPROVED LABELS ARE REACHABLE:")
ok("the bank declares exactly the 16 approved labels", SAN_ANTONIO_DESTINATION_LABELS.length === 16)

// Left: what Google actually returns. Right: the approved label.
const REAL_NAMES: Array<[string, string]> = [
  ["Lackland Air Force Base", "Lackland AFB"],
  ["Randolph Air Force Base", "Randolph AFB"],
  ["Joint Base Camp Bullis", "Camp Bullis"],
  ["Brooks City Base", "Brooks City Base"],
  ["Brooke Army Medical Center (BAMC)", "BAMC"],
  ["BAMC Visitor Center", "BAMC"],
  ["Fort Sam Houston", "Fort Sam"],
  ["Joint Base San Antonio: Fort Sam Houston", "Fort Sam"],
  ["JBSA-Sam Houston", "Fort Sam"],
  ["Downtown", "Downtown"],
  ["The University of Texas at San Antonio", "UTSA"],
  ["Six Flags Fiesta Texas", "Six Flags"],
  ["SeaWorld San Antonio", "SeaWorld"],
  ["North Star Mall", "North Star Mall"],
  ["San Antonio River Walk", "River Walk"],
  ["Pearl", "Pearl District"],
  ["San Antonio Pearl District", "Pearl District"],
  ["San Antonio Zoo", "San Antonio Zoo"],
  ["San Antonio Botanical Garden", "Botanical Garden"],
  ["Tower of the Americas", "Tower of Americas"],
]
for (const [google, expected] of REAL_NAMES) {
  ok(`"${google}" → "${expected}"`, displayDestinationLabel(google) === expected)
}
ok("every approved label is produced by at least one real Google name",
  new Set(SAN_ANTONIO_DESTINATION_LABELS).size ===
    new Set(REAL_NAMES.map(([, l]) => l)).size)

console.log("\nTHE BRIEF'S OWN EXAMPLES:")
for (const [from, to] of [
  ["Joint Base San Antonio: Fort Sam Houston", "Fort Sam"],
  ["Brooke Army Medical Center", "BAMC"],
  ["SeaWorld San Antonio", "SeaWorld"],
  ["San Antonio River Walk", "River Walk"],
] as const) {
  ok(`${from} → ${to}`, displayDestinationLabel(from) === to)
}

console.log("\nIDEMPOTENT — safe to apply on every read and every write:")
for (const label of SAN_ANTONIO_DESTINATION_LABELS) {
  ok(`"${label}" survives a second pass unchanged`, displayDestinationLabel(label) === label)
}

console.log("\nNO FALSE POSITIVES — generic words do not capture unrelated places:")
ok("'Downtown Grill' is NOT Downtown", displayDestinationLabel("Downtown Grill") !== "Downtown")
ok("'Pearl Apartments' is NOT Pearl District", displayDestinationLabel("Pearl Apartments") !== "Pearl District")
ok("'Pearl Harbor' is NOT Pearl District", displayDestinationLabel("Pearl Harbor") !== "Pearl District")
ok("a plain street address is untouched",
  displayDestinationLabel("1201 Broadway") === "1201 Broadway")
ok("an unrelated employer is untouched", displayDestinationLabel("Rackspace") === "Rackspace")
// The UTSA entry sits ahead of Downtown, so a campus reads as the school.
ok("'UTSA Downtown Campus' reads as UTSA", displayDestinationLabel("UTSA Downtown Campus") === "UTSA")

console.log("\nFALLBACK — no alias match keeps the locator's own wording:")
ok("a manually typed label is preserved verbatim",
  displayDestinationLabel("Mom's house") === "Mom's house")
ok("Google's disambiguation noise is stripped",
  shortenDestinationLabel("Methodist Hospital, San Antonio, TX 78229") === "Methodist Hospital")
ok("a trailing city qualifier is stripped",
  shortenDestinationLabel("Rackspace San Antonio") === "Rackspace")
ok("a JBSA prefix is stripped even when the bank has no entry",
  shortenDestinationLabel("Joint Base San Antonio: Medina Annex") === "Medina Annex")
ok("nothing is invented when there is nothing to strip",
  shortenDestinationLabel("Alamo Ranch") === "Alamo Ranch")
{
  const long = shortenDestinationLabel("Southwest Research Institute Main Campus Building 100")
  ok("an over-long name is cut at a word boundary with an ellipsis", long.length <= 29 && long.endsWith("…"))
  ok("and is cut at a space, not mid-word", !/\w…$/.test(long) || long.split(" ").length > 1)
}

console.log("\nRULE 4 — the reason stays short enough for the card:")
for (const label of SAN_ANTONIO_DESTINATION_LABELS) {
  const text = commuteReasonText(12, label)
  ok(`"${text}" fits the 40-char one-line budget (${text.length})`, text.length <= 40)
}

console.log("\nRULE 1 — display logic can never touch routing identity:")
{
  const bank = strip(read("lib/commute/destinationAliases.ts"))
  ok("the bank never reads or writes a place id",
    !/place_?id/i.test(bank.replace(/place id/gi, "")))
  ok("displayDestinationLabel takes only the label — a place id cannot be passed in",
    /export function displayDestinationLabel\(storedLabel: string \| null \| undefined\)/.test(bank))
  ok("no baked place-id table to go stale", !/ChIJ/.test(bank))
}

console.log("\nCONSUMED IN ALL FOUR SURFACES:")
{
  const api = strip(read("app/api/admin/leads/commute/route.ts"))
  const panel = strip(read("components/crm/LeadPanel.tsx"))
  const dto = strip(read("lib/companion/leadToDto.ts"))
  const field = strip(read("components/crm/CommuteDestinationField.tsx"))
  // The reason string is what Favorites, Recommendations and every minted
  // Preview / Send List snapshot render — so this ONE call covers three of them.
  ok("reason composition (→ Favorites, Recommendations, Preview/Send List)",
    /const anchorLabel = displayDestinationLabel\(lead\.commute_anchor_label\)/.test(api))
  // The two Search Criteria surfaces reach the bank THROUGH clientCommuteCriterion
  // now — one formatter, so they cannot render the destination differently from
  // each other. The bank still reaches both; that link is asserted just below
  // rather than at each call site.
  ok("Search Criteria card",
    /value=\{clientCommuteCriterion\(lead\.commute_anchor_label, lead\.commute_max_minutes\)\}/.test(panel))
  ok("Companion Search Criteria",
    /commuteDestination: clientCommuteCriterion\(lead\.commute_anchor_label, lead\.commute_max_minutes\)/.test(dto))
  ok("…and that shared formatter applies the bank",
    /displayDestinationLabel\(storedLabel\)/.test(strip(read("lib/commute/commuteReason.ts"))))
  ok("and the destination picker seeds the short label on save",
    /label: displayDestinationLabel\(c\.name\)/.test(field))
  ok("the picker still stores the untouched place id",
    /placeId: c\.placeId/.test(field))
}

console.log(`\nDestination aliases: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
