/**
 * MAP PROPERTY EDITOR — the editor, the route contract, and the gift-card model.
 *
 *   npx tsx scripts/leads/mapPropertyEditor.test.ts
 *
 * Live unit coverage of the two pure modules this feature introduced (the move-in special round
 * trip and the attribute owner-override decision), plus source assertions on the route and panel
 * with comments stripped once before matching, so nothing passes on the strength of a comment
 * that merely mentions the thing.
 *
 * The property the tests keep returning to: an edit made from the map must be able to change ONE
 * field without disturbing the other forty, and must never turn "nobody checked" into a claim.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  MOVE_IN_SPECIAL_OPTIONS, specialToSelection, selectionToSpecial,
  NO_SPECIAL_TEXT, DETAIL_SEPARATOR,
} from "@/lib/propertyIntel/moveInSpecials"
import { decideAttributeWrite, OWNER_CORRECTABLE_ATTRIBUTE_KEYS } from "@/lib/propertyEnrichment/attributes"
import { OWNER_CORRECTABLE_FIELDS, OWNER_COMMISSION_FIELDS, PUBLIC_SOURCE_TYPES } from "@/lib/propertyEnrichment/policy"

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"))

const ROUTE = read("app/api/admin/owner/property-pricing/route.ts")
const PANEL = read("components/crm/MapPropertyEditor.tsx")
const EXPLORER = read("components/crm/explorer/BeastPropertyExplorer.tsx")
const ATTRS = read("lib/propertyEnrichment/attributes.ts")
const MIGRATION = readFileSync(join(process.cwd(), "supabase/migrations/20261106000000_property_gift_card.sql"), "utf8")

console.log("the stripper works:")
ok("a comment mentioning a call is not a call", !strip("// giftCardStatus in body").includes("giftCardStatus"))

// ── 1. MOVE-IN SPECIAL: THE ROUND TRIP ────────────────────────────────────────────────────────
// The rule: opening the editor and saving something ELSE must never rewrite current_special.
console.log("\nmove-in special — a stored value round-trips to itself, or stays Custom:")
for (const opt of MOVE_IN_SPECIAL_OPTIONS) {
  if (!opt.phrase) continue
  const sel = specialToSelection(opt.phrase)
  ok(`"${opt.label}" round-trips exactly`,
    sel.choice === opt.value && selectionToSpecial(sel.choice, sel.details) === opt.phrase,
    `${sel.choice} → ${selectionToSpecial(sel.choice, sel.details)}`)
}
{
  // The dangerous case: text that LOOKS like an option but is a weaker claim.
  const stored = "8 Weeks Free"
  const sel = specialToSelection(stored)
  ok('"8 Weeks Free" (no qualifier) is NOT mapped to the 8-weeks option', sel.choice === "custom")
  ok("…it is carried verbatim as Custom", sel.details === stored)
  ok("…and re-saving it reproduces it unchanged", selectionToSpecial(sel.choice, sel.details) === stored,
    String(selectionToSpecial(sel.choice, sel.details)))
}
{
  // Every value we might meet in the wild must survive an untouched open→save.
  const samples = [
    "Up to 8 Weeks Free on Select Homes",
    "8 Weeks Free",
    "$500 off first month, call for details",
    "1 Month Free + waived admin",
    "None",
    "N/A",
    NO_SPECIAL_TEXT,
    "Up to 4 Weeks Free on Select Homes — waived app + admin fees",
  ]
  let drift = 0
  for (const s of samples) {
    const sel = specialToSelection(s)
    // The third argument is the stored text, exactly as the panel passes it. Without it the
    // helper returns the CURRENT template wording, which is the deliberate-change path.
    const back = selectionToSpecial(sel.choice, sel.details, sel.original)
    if (back !== s) { drift++; console.log(`      "${s}" → "${back}"`) }
  }
  ok(`all ${samples.length} stored specials survive an untouched open→save`, drift === 0, `${drift} drifted`)
}
console.log("\nthe older 'on Select Homes' wording is read, and never rewritten:")
{
  const LEGACY = "Up to 8 Weeks Free on Select Homes"
  const sel = specialToSelection(LEGACY)
  ok("it resolves to the 8-weeks option, not Custom", sel.choice === "8_weeks", sel.choice)
  ok("…carrying the stored text as `original`", sel.original === LEGACY)
  ok("…and an untouched save emits it VERBATIM", selectionToSpecial(sel.choice, sel.details, sel.original) === LEGACY)
  ok("…so nothing in the database is restated", selectionToSpecial("8_weeks", "", LEGACY) === LEGACY)
  // Changing the selection IS the deliberate act that adopts the new wording.
  ok("choosing a DIFFERENT option writes the short form",
    selectionToSpecial("4_weeks", "", LEGACY) === "Up to 4 Weeks Free")
  ok("…and editing the details does too",
    selectionToSpecial("8_weeks", "waived admin", LEGACY) === "Up to 8 Weeks Free — waived admin")
  // Legacy wording with details attached still splits correctly.
  const withDetails = specialToSelection("Up to 4 Weeks Free on Select Homes — waived app fees")
  ok("legacy + details splits into option and details",
    withDetails.choice === "4_weeks" && withDetails.details === "waived app fees")
  ok("…and round-trips verbatim",
    selectionToSpecial(withDetails.choice, withDetails.details, withDetails.original) === "Up to 4 Weeks Free on Select Homes — waived app fees")
  // A brand-new selection uses the short wording.
  ok("a fresh pick writes the short form", selectionToSpecial("10_weeks", "") === "Up to 10 Weeks Free")
  ok("the panel passes the stored text through",
    /selectionToSpecial\(specialChoice, specialDetails, loaded\.currentSpecial\)/.test(PANEL))
}

console.log("\n…and unknown is not 'No Special':")
ok("a null special selects the UNKNOWN option, not No Special", specialToSelection(null).choice === "")
ok("…and writes nothing at all", selectionToSpecial("", "") === null)
ok("an empty string behaves the same", specialToSelection("").choice === "")
ok("'No Special' is a DELIBERATE, separate choice", specialToSelection(NO_SPECIAL_TEXT).choice === "none")
ok("…stored as text the shared NO_SPECIAL pattern recognises", /^(none|no special|n\/a)$/i.test(NO_SPECIAL_TEXT))
ok("an empty Custom writes nothing rather than erasing", selectionToSpecial("custom", "   ") === null)

console.log("\nadditional details are preserved alongside the dropdown:")
{
  const text = selectionToSpecial("8_weeks", "waived app + admin fees")
  ok("the phrase and the details are both present",
    !!text && text.includes("8 Weeks Free") && text.includes("waived app + admin fees"))
  const sel = specialToSelection(text!)
  ok("…and they come back apart", sel.choice === "8_weeks" && sel.details === "waived app + admin fees")
  ok("…joined by the one documented separator", text!.includes(DETAIL_SEPARATOR))
}
ok("the dropdown offers every option asked for",
  ["", "none", "2_weeks", "4_weeks", "6_weeks", "8_weeks", "10_weeks", "12_weeks", "1_month", "2_months", "custom"]
    .every((v) => MOVE_IN_SPECIAL_OPTIONS.some((o) => o.value === v)))
ok("every generated phrase still carries the cautious 'Up to'",
  MOVE_IN_SPECIAL_OPTIONS.filter((o) => o.phrase && o.value !== "none")
    .every((o) => /^Up to .+ Free$/.test(o.phrase!)))
ok("…and none still appends 'on Select Homes'",
  MOVE_IN_SPECIAL_OPTIONS.every((o) => !/on Select Homes/.test(o.phrase ?? "")))

// ── 2. GIFT CARD: THREE STATES, AND NOT THE BONUS ─────────────────────────────────────────────
console.log("\ngift card — three states, stored apart from the agent bonus:")
ok("the migration adds a STATUS column, not just an amount", /add column if not exists gift_card_status/.test(MIGRATION))
ok("…plus the amount and a checked-at stamp",
  /gift_card_amount/.test(MIGRATION) && /gift_card_checked_at/.test(MIGRATION))
ok("the status vocabulary is constrained to yes/no", /check \(gift_card_status is null or gift_card_status in \('yes', 'no'\)\)/.test(MIGRATION))
ok("…and NULL stays legal, which is how 'not researched' survives", /gift_card_status is null/.test(MIGRATION))
// The constraint is now a BICONDITIONAL: yes ⟺ a positive amount, anything else ⟺ no amount.
ok("'yes' requires a positive amount, in the database",
  /when gift_card_status = 'yes' then gift_card_amount is not null and gift_card_amount > 0/.test(MIGRATION))
ok("…and every other state forbids an amount", /else gift_card_amount is null/.test(MIGRATION))
ok("the migration is ADDITIVE — no drop, no rename, no update of existing rows",
  !/\bdrop\s+(column|table|constraint)\b/i.test(MIGRATION) && !/\brename\b/i.test(MIGRATION) && !/^\s*update\s/im.test(MIGRATION))
// bonus_flat IS named in the migration — in a `--` note and inside the COMMENT ON text that
// tells the next reader these are different things. Neither modifies it. The assertion that
// matters is that no DDL or DML statement targets it, so strip comments AND the quoted strings
// that COMMENT ON carries before looking.
{
  const executable = MIGRATION.replace(/--[^\n]*/g, "").replace(/'(?:[^']|'')*'/g, "''")
  // bonus_flat IS named in executable SQL now — the catalog RPC is re-created verbatim and has
  // always RETURNED it. Reading a column is not modifying it, and dropping it from the function
  // would break every caller. The assertion that matters is the DDL/DML one below.
  ok("bonus_flat is only ever READ, never written",
    !/\binsert\b[^;]*bonus_flat|\bset\b\s+bonus_flat/i.test(executable))
  ok("…and no statement alters, updates or drops it",
    !/\b(alter|update|drop)\b[^;]*bonus_flat/i.test(executable))
  ok("current_special is likewise never modified", !/\b(alter|update|drop)\b[^;]*current_special/i.test(executable))
}
ok("the three columns are owner-correctable",
  ["gift_card_status", "gift_card_amount", "gift_card_checked_at"].every((f) => OWNER_CORRECTABLE_FIELDS.has(f)))
ok("bonus_flat remains a COMMISSION field, behind the commission firewall",
  OWNER_COMMISSION_FIELDS.has("bonus_flat") && !OWNER_CORRECTABLE_FIELDS.has("bonus_flat"))
ok("…so the gift card carries no commission authority", !OWNER_COMMISSION_FIELDS.has("gift_card_amount"))

console.log("\nthe three states are validated, not merely stored:")
ok("a non-positive amount is rejected — 'yes, $0' is a confirmed absence, not an offer",
  /n <= 0 \|\| n > 100_000\) rejected\.push\("giftCardAmount"\)/.test(ROUTE))
ok("setting 'yes' without an amount is rejected by name",
  /=== "yes"\) \{[\s\S]{0,400}?!Number\.isFinite\(amt\) \|\| amt <= 0[\s\S]{0,120}?rejected\.push\("giftCardAmount"\)/.test(ROUTE))
ok("…only when the request is SETTING yes, so unrelated saves need not restate the amount",
  /"giftCardStatus" in body|body\.giftCardStatus/.test(ROUTE))
ok("the panel blocks the invalid pair before a round trip",
  /giftCardInvalid =\s*\n?\s*giftStatus === "yes" && \(!giftAmount\.trim\(\)/.test(PANEL))
ok("…and says so next to the field", /A confirmed gift card needs an amount above \$0/.test(PANEL))
ok("a 'yes' always travels with its amount", /if \(giftAmount\.trim\(\) !== amountToInput\(loaded\.giftCardAmount\) \|\| "giftCardStatus" in out\)/.test(PANEL))

console.log("\nthe route maps the three states onto its existing contract:")
ok("an absent key is untouched", /if \(!\("giftCardStatus" in body\)\)|"giftCardStatus" in body/.test(ROUTE))
{
  // Structural rather than distance-based: isolate the null branch, then assert BOTH columns are
  // cleared inside it. A distance window silently depends on how the code is formatted.
  const i = ROUTE.indexOf("raw === null")
  const branch = i >= 0 ? ROUTE.slice(i, ROUTE.indexOf("} else {", i)) : ""
  ok("an explicit null clears BOTH status and amount back to unknown",
    branch.includes("gift_card_status") && branch.includes("gift_card_amount") && branch.includes("ownerClear: true"),
    branch ? "branch found but a piece is missing" : "null branch not found")
  ok("…and clears them, rather than writing a value", /value: null/.test(branch))
}
ok("choosing 'no' clears any stored amount in the same save",
  /v === "no"[\s\S]{0,300}?gift_card_amount[\s\S]{0,160}?ownerClear: true/.test(ROUTE))
ok("an amount sent alongside 'no' is REJECTED, not quietly stored",
  /giftCardStatus[\s\S]{0,120}?=== "no"\) rejected\.push\("giftCardAmount"\)/.test(ROUTE))
ok("an out-of-range amount is rejected", /n > 100_000\) rejected\.push\("giftCardAmount"\)/.test(ROUTE))
ok("an unrecognised status is rejected rather than coerced", /rejected\.push\("giftCardStatus"\)/.test(ROUTE))
ok("the gift card has its OWN freshness stamp", /touchedGiftCard\) add\("gift_card_checked_at"/.test(ROUTE))
ok("…and does not restamp pricing_last_verified", !/touchedGiftCard[\s\S]{0,200}?pricing_last_verified/.test(ROUTE))
ok("GET returns the status verbatim, never coerced to 'no'", /giftCardStatus: s\(row\.gift_card_status\)/.test(ROUTE))

// ── 3. ATTRIBUTES: THE OWNER EXCEPTION, AND ITS THREE LOCKS ───────────────────────────────────
console.log("\nattribute owner-override — three locks, all required:")
const baseAttr = {
  attributeKey: "private_yard",
  valueKind: "tristate" as const,
  candidateFact: "yes",
  candidateFloorplanSpecific: false,
  candidateSourceType: "manual_verified" as const,
  candidateVerification: "verified" as const,
  existing: { value: "no", verificationStatus: "verified", floorplanSpecific: false } as never,
}
ok("an owner CAN correct an already-populated attribute",
  decideAttributeWrite({ ...baseAttr, ownerOverride: true }).outcome === "write")
ok("…and the reason says so", decideAttributeWrite({ ...baseAttr, ownerOverride: true }).reason === "owner_override")
ok("without ownerOverride the same edit is preserved, as before",
  decideAttributeWrite({ ...baseAttr, ownerOverride: false }).outcome === "skip")
ok("an unlisted key gets no owner exception",
  decideAttributeWrite({ ...baseAttr, attributeKey: "high_ceilings", ownerOverride: true }).outcome === "skip")
ok("a PUBLIC source cannot buy the exception, whatever flag it carries",
  decideAttributeWrite({ ...baseAttr, candidateSourceType: "public_web" as never, ownerOverride: true }).outcome === "skip")
for (const src of PUBLIC_SOURCE_TYPES) {
  ok(`…including ${src}`,
    decideAttributeWrite({ ...baseAttr, candidateSourceType: src as never, ownerOverride: true }).outcome === "skip")
}
ok("the three exposed keys are the ONLY correctable ones",
  OWNER_CORRECTABLE_ATTRIBUTE_KEYS.size === 3 &&
  ["private_yard", "attached_garage", "detached_garage"].every((k) => OWNER_CORRECTABLE_ATTRIBUTE_KEYS.has(k)))

console.log("\n…and Unknown still never overwrites a known answer:")
ok("an owner 'unknown' does NOT erase a stored yes",
  decideAttributeWrite({ ...baseAttr, candidateFact: "unknown", existing: { value: "yes", verificationStatus: "verified", floorplanSpecific: false } as never, ownerOverride: true }).outcome === "skip")
ok("…with a reason that explains why", decideAttributeWrite({ ...baseAttr, candidateFact: "unknown", existing: { value: "yes", verificationStatus: "verified", floorplanSpecific: false } as never, ownerOverride: true }).reason === "owner_unknown_is_not_a_clear")
ok("an unchanged value is still a no-op",
  decideAttributeWrite({ ...baseAttr, candidateFact: "no", ownerOverride: true }).outcome === "skip")
ok("filling an EMPTY attribute never needed the exception",
  decideAttributeWrite({ ...baseAttr, existing: null, ownerOverride: false }).outcome === "write")

console.log("\nauthority is server-decided, not body-claimed:")
ok("the decision requires BOTH the request flag and the candidate flag",
  /ownerOverride: input\.ownerAuthorized === true && cand\.ownerOverride === true/.test(ATTRS))
ok("the route sets ownerAuthorized only after requirePlatformAdmin",
  ROUTE.indexOf("requirePlatformAdmin()") < ROUTE.indexOf("ownerAuthorized: true"))
ok("the route never reads ownerAuthorized from the body", !/body\.ownerAuthorized/.test(ROUTE))
ok("the route never reads ownerOverride from the body", !/body\.ownerOverride/.test(ROUTE))

// ── 4. THE PANEL: ONE SAVE PATH, AND NO INVENTED STATE ────────────────────────────────────────
console.log("\nthe panel reuses the existing infrastructure:")
ok("it saves to the SAME owner endpoint", /const ENDPOINT = "\/api\/admin\/owner\/property-pricing"/.test(PANEL))
// THE VERB, NOT JUST THE URL. The route exports GET and PUT; a POST returns 405 and the save
// silently fails. This shipped once because the endpoint was asserted and the method was not,
// so the assertion now reads the ROUTE's exported handlers and requires the panel to match.
{
  const ROUTE_SRC = read("app/api/admin/owner/property-pricing/route.ts")
  const verbs = [...ROUTE_SRC.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\(/g)].map((m) => m[1])
  const writeVerb = verbs.find((v) => v !== "GET")
  ok(`the route exposes exactly one write verb (${writeVerb})`, !!writeVerb && verbs.filter((v) => v !== "GET").length === 1, verbs.join(","))
  const panelMethod = PANEL.match(/method: "(GET|POST|PUT|PATCH|DELETE)"/)?.[1]
  ok(`the panel uses it (${panelMethod})`, panelMethod === writeVerb, `panel=${panelMethod} route=${writeVerb}`)
  ok("…and the existing editor agrees",
    read("components/crm/PropertyPricingEditor.tsx").match(/method: "(GET|POST|PUT|PATCH|DELETE)"/)?.[1] === writeVerb)
}
ok("…and defines no endpoint of its own", (PANEL.match(/\/api\//g) ?? []).length === 1)
ok("it reuses commissionToInput rather than reimplementing unknown-vs-zero",
  /import \{ commissionToInput \} from "@\/components\/crm\/PropertyPricingEditor"/.test(PANEL))
ok("it reuses the shared washer/dryer vocabulary",
  /asCatalogWasherDryerIncluded/.test(PANEL) && /asCatalogWasherDryerConnections/.test(PANEL))
ok("it writes no Supabase query of its own", !/supabase|createClient/.test(PANEL))

console.log("\nit sends ONLY what changed:")
ok("the payload is built from a computed change set", /const payload[\s\S]{0,120}?\.\.\.changes/.test(PANEL))
ok("…and the same change set decides whether there is anything to lose",
  /const dirty = Object\.keys\(changes\)\.length > 0/.test(PANEL))
ok("a field equal to its stored value is omitted", /!== commissionToInput\(stored\)\) out\[key\]/.test(PANEL))
ok("Save is disabled when nothing changed", /disabled=\{!dirty \|\| saving \|\| !loaded \|\| giftCardInvalid\}/.test(PANEL))

console.log("\nunknown is never rendered or sent as a claim:")
ok("a null amount shows BLANK, not 0", /Number\.isFinite\(n\) \? String\(n\) : ""/.test(PANEL))
ok("commission inputs say Unknown rather than 0", /placeholder="Unknown"/.test(PANEL))
ok("gift card 'unknown' is sent as an explicit null clear", /giftStatus === "unknown" \? null : giftStatus/.test(PANEL))
ok("an absent attribute row reads as unknown", /=== "yes" \|\| v === "no" \? v : "unknown"/.test(PANEL))

console.log("\nclosing cannot silently lose work:")
ok("closing with unsaved changes asks first", /if \(dirty && !window\.confirm/.test(PANEL))
ok("Escape goes through the same guard", /e\.key === "Escape"\) requestClose\(\)/.test(PANEL))
ok("the ✕ and Cancel both go through it too", (PANEL.match(/onClick=\{requestClose\}/g) ?? []).length === 2)
ok("a refresh or tab close is guarded by the browser", /beforeunload/.test(PANEL))

console.log("\nsuccess and failure are both visible:")
ok("a conflict is explained rather than shown as a code", /conflict_retry[\s\S]{0,160}?nothing was overwritten/i.test(PANEL))
ok("a rejected field list is surfaced", /bad_value[\s\S]{0,80}?fields/.test(PANEL))
ok("a success state is rendered", /Saved\. The map card now shows these values\./.test(PANEL))
ok("the panel RE-READS after saving rather than assuming", /const fresh = await fetch\(`\$\{ENDPOINT\}\?placeId=/.test(PANEL))

console.log("\nit is a right-side panel, not a modal over the map:")
ok("pinned to the right edge, full height", /fixed right-0 top-0[\s\S]{0,120}?h-full/.test(PANEL))
ok("no backdrop intercepts the map", !/inset-0[\s\S]{0,60}?bg-black/.test(PANEL))
ok("the body scrolls while the footer stays", /flex-1 overflow-y-auto/.test(PANEL))
ok("it adapts to a narrow screen", /w-full max-w-\[420px\]/.test(PANEL))

// ── 5. THE MAP CARD ───────────────────────────────────────────────────────────────────────────
console.log("\nthe map card opens it without leaving the map:")
ok("the card renders an Edit Property control", /Edit Property/.test(EXPLORER))
ok("…only when a handler was supplied (owner-gated presentation)",
  /if \(!\(selected && onEditProperty && card\.placeId\)\) return framed/.test(EXPLORER))
ok("…and it passes the catalog place id", /onEditProperty\(card\.placeId\)/.test(EXPLORER))
ok("the click never triggers the website link or deselects the pin",
  /e\.stopPropagation\(\); e\.preventDefault\(\); onEditProperty/.test(EXPLORER))
ok("the button is a SIBLING of the website anchor, never nested inside it",
  EXPLORER.indexOf("const framed = siteHref") < EXPLORER.indexOf("onEditProperty(card.placeId)"))
ok("a save re-reads just that one property", /fetchCatalog\(\[refreshPlaceId\], supabase\)/.test(EXPLORER))
ok("…through the SAME enrichment used by search, not a second path",
  /enrichProperties\(\[target\], catalog\)/.test(EXPLORER))
ok("…leaving every other loaded property untouched",
  /prev\.map\(\(p\) => \(p\.placeId === refreshPlaceId \? fresh : p\)\)/.test(EXPLORER))
ok("a property that is not loaded is left alone", /if \(!target\) return prev/.test(EXPLORER))

console.log(`\nMap Property Editor: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
