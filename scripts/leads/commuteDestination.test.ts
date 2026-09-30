// Commute / Destination — ONE canonical client field across every surface.
//
// These assertions exist because every gate on this path fails SILENTLY. Leads are
// passed as `any` throughout and there is no generated database type, so a column
// missing from one of the four allowlists produces no error at all — just a field
// that quietly never persists. Each gate below is one of those.
//
// Run: npx tsx scripts/leads/commuteDestination.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const LABEL = "commute_anchor_label"
const PLACE = "commute_anchor_place_id"

const modal = strip(read("components/LeadFormModal.tsx"))
const fields = strip(read("components/LeadFields.tsx"))
const route = strip(read("app/api/leads/submit/route.ts"))
const panel = strip(read("components/crm/LeadPanel.tsx"))
const ctrl = strip(read("components/crm/CommuteDestinationField.tsx"))
const dto = strip(read("lib/companion/leadToDto.ts"))
const contract = strip(read("packages/companion-shared/src/leads/contract.ts"))
const cpanel = strip(read("apps/beast-companion/src/sidepanel/lead/LeadPanelView.tsx"))

/** The body of a named `const X = [ … ] as const` array literal. */
function arrayBlock(src: string, name: string): string {
  const i = src.indexOf(`const ${name} = [`)
  if (i < 0) return ""
  return src.slice(i, src.indexOf("] as const", i))
}

console.log("ONE canonical field — no per-surface duplicates:")
for (const [name, src] of [["LeadFields", fields], ["LeadPanel", panel], ["the field itself", ctrl], ["leadToDto", dto]] as const) {
  ok(`${name} invents no alternative destination column`,
    !/commute_(?!anchor_label|anchor_place_id|minutes|computed_at|destination\b)/.test(src) &&
    !/\b(destination_address|work_address|commute_address|anchor_address)\b/.test(src))
}

console.log("\nGATE 1 — Edit Client (governs BOTH the seed and the patch):")
{
  const block = arrayBlock(modal, "EDITABLE_COLUMNS")
  ok("EDITABLE_COLUMNS carries the label", block.includes(`"${LABEL}"`))
  ok("EDITABLE_COLUMNS carries the place id", block.includes(`"${PLACE}"`))
  // The same list is spread into the form seed, so one entry serves read and write.
  ok("the edit seed is driven by that same list",
    /Object\.fromEntries\(EDITABLE_COLUMNS\.map/.test(modal))
  ok("the patch is built from that same list",
    /buildEditPatch\(form as Record<string, unknown>, EDITABLE_COLUMNS\)/.test(modal))
}

console.log("\nGATE 2 — Add Lead server allowlist:")
{
  const block = arrayBlock(route, "STRING_FIELDS")
  ok("STRING_FIELDS carries the label", block.includes(`"${LABEL}"`))
  ok("STRING_FIELDS carries the place id", block.includes(`"${PLACE}"`))
}

console.log("\nGATE 3 — controlled inputs on the create path:")
{
  const seed = modal.slice(modal.indexOf("useState({"), modal.indexOf("// defaults"))
  ok("initial form state declares both", seed.includes(`${LABEL}: ""`) && seed.includes(`${PLACE}: ""`))
  const reset = modal.slice(modal.indexOf("function resetForm()"))
  ok("resetForm clears both", reset.includes(`${LABEL}: ""`) && reset.includes(`${PLACE}: ""`))
}

console.log("\nGATE 4 — a public resubmission must NOT overwrite a locator's anchor:")
{
  const scalar = route.slice(route.indexOf("SCALAR_LABELS"), route.indexOf("SCALAR_LABELS") + 2000)
  ok("neither column is in SCALAR_LABELS (same protection as source/referred_by)",
    !scalar.includes(LABEL) && !scalar.includes(PLACE))
}

console.log("\nPLACEMENT — directly under Preferred Locations, consistently labelled:")
{
  // The JSX usage, not the import at the top of the file.
  const iPref = fields.indexOf("<LocationPicker")
  const iCommute = fields.indexOf("<CommuteDestinationField")
  const iProps = fields.indexOf(">Property Preferences<")
  ok("it sits after the Preferred Locations picker", iPref > 0 && iCommute > iPref)
  ok("and before Property Preferences", iProps > 0 && iCommute < iProps)
  ok("the CRM label is exactly 'Commute / Destination'", /Commute \/ Destination/.test(fields))
  ok("the workspace Search Criteria row uses the SAME label",
    /label="Commute \/ Destination"/.test(panel))
  ok("the Companion panel uses the SAME label",
    /label: "Commute \/ Destination"/.test(cpanel))
  // Preferred Locations only renders once a city with a neighborhood catalog is
  // chosen; the anchor must not inherit that gate.
  // That block is an IIFE returning null until a city with a neighborhood catalog is
  // chosen. The anchor must be its SIBLING, i.e. after the IIFE has closed.
  const iClose = fields.indexOf("})()}", iPref)
  ok("it is NOT nested inside the city-gated Preferred Locations block",
    iClose > iPref && iClose < iCommute)
}

console.log("\nNO NEW CARD / SECTION was introduced:")
ok("it reuses the existing LeadFields section rhythm (sectionLabelCls)",
  /sectionLabelCls}>Commute \/ Destination/.test(fields))
ok("the workspace row reuses the existing Field + SectionCard",
  /<Field label="Commute \/ Destination"/.test(panel) && !/SectionCard title="Commute/.test(panel))
ok("LeadFields is still the single shared criteria form",
  (read("components/LeadFormModal.tsx").match(/<LeadFields/g) ?? []).length === 1)

console.log("\nINPUT BEHAVIOUR — Places autocomplete, unrestricted destination types:")
ok("it searches Google Places (New) via the shared loader",
  /loadGoogleMaps/.test(ctrl) && /Place\.searchByText/.test(ctrl))
// PropertySearchField appends " apartments" to bias toward communities. Reusing that
// here would make "Fort Sam" return an apartment complex instead of the base.
ok("it does NOT apply the apartment-biasing query transform",
  !/nameSearchTextQuery/.test(ctrl) && /textQuery,/.test(ctrl))
ok("no includedType restricts it to street addresses or one place kind",
  !/includedType|types:\s*\[/.test(ctrl))
ok("it asks for the place id", /"id"/.test(ctrl))
ok("it degrades to plain text when Maps is unavailable", /catch\s*\{/.test(ctrl))

console.log("\nCANONICAL id + EDITABLE label:")
// The label is now seeded through the San Antonio display bank; the place id is
// still stored verbatim, which is the part that matters for routing identity.
ok("selecting a place stores the place id as canonical",
  /onChange\(\{ label: displayDestinationLabel\(c\.name\), placeId: c\.placeId \}\)/.test(ctrl))
ok("the display bank never alters the place id",
  /placeId: c\.placeId/.test(ctrl) && !/displayDestinationLabel\([^)]*placeId/.test(ctrl))
ok("the label stays editable WITHOUT moving the destination",
  /onChange\(\{ label: e\.target\.value, placeId \}\)/.test(ctrl))
ok("clearing empties both together", /onChange\(\{ label: "", placeId: "" \}\)/.test(ctrl))
ok("the form writes both columns as a pair",
  new RegExp(`updateField\\("${LABEL}"[\\s\\S]{0,120}updateField\\("${PLACE}"`).test(fields))

console.log("\nCROSS-SURFACE: one field, one pair of columns:")
ok("Add Lead and Edit Client are literally the same form component",
  /mode = "create"/.test(modal) && (read("components/LeadFormModal.tsx").match(/<LeadFields/g) ?? []).length === 1)
ok("the workspace reads the same column the form writes",
  new RegExp(`lead\\.${LABEL}`).test(panel))
ok("the Companion DTO maps the same column", new RegExp(`lead\\.${LABEL}`).test(dto))
ok("the Companion contract declares the destination", /commuteDestination/.test(contract))
ok("the Companion is shown the LABEL only, never the place id",
  /commuteDestination: displayDestinationLabel\(lead\.commute_anchor_label\)/.test(dto) &&
  !new RegExp(PLACE).test(cpanel))

console.log("\nSCOPE — no drive-time work in this pass, and the outreach text is intact:")
ok("no Routes API call was added", !/routes\.googleapis|computeRoutes|Distance ?Matrix/i.test(ctrl + fields + panel))
ok("the field is optional everywhere (never required)",
  !/required[\s\S]{0,60}commute/i.test(fields) && !new RegExp(`${LABEL}[\\s\\S]{0,80}required`).test(fields))
{
  // The second outreach text must still ask the question this field answers.
  const outreach = read("packages/companion-shared/src/format/followUpTemplates.ts")
  ok("the 'specific address or side of town?' outreach text is untouched",
    /Are you trying to stay near a specific address or side of town\?/.test(outreach))
  ok("it is still the SECOND outreach (new_lead_text2)",
    /new_lead_text2: "Are you trying to stay near a specific address or side of town\?"/.test(outreach))
}

console.log(`\nCommute / Destination: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
