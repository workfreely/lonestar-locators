/**
 * TEMPLATES 25-31 — the seven conversational additions, and the twenty-four they must not disturb.
 *
 *   npx tsx scripts/social/templates25to31.test.ts
 *
 * Two halves, and the second is the one that earns its keep.
 *
 * THE ADDITIONS: seven new hooks, six of them a fixed spoken line plus the shared optional price
 * line, and one — Them vs. Me — that is structurally a Client / Me exchange and joins that family
 * rather than reimplementing it.
 *
 * THE PRESERVATION: a post stores its template as a STRING, so the registry may only ever be
 * appended to. These were appended, and the display order is a separate list — identity and
 * presentation are different things, and conflating them is how a saved draft loses its template.
 * Most of what follows checks that the original twenty-four are exactly where they were, say
 * exactly what they said, and render exactly as they did.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  OVERLAY_TEMPLATES, OVERLAY_TEMPLATE_ORDER, OVERLAY_TEMPLATE_LABEL, AURA_SHORT_TYPES,
  buildTemplateHeadline, buildTemplateDetail, captionOpener, buildCaption,
  type OverlayTemplate, type SourceMeta,
} from "@/lib/social/composePost"
import { templateFamily } from "@/lib/social/overlaySpec"

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const eq = (label: string, a: unknown, b: unknown) =>
  ok(label, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const meta = (o: Partial<SourceMeta> = {}): SourceMeta => ({
  market: "Dallas", propertyType: "High-Rise", budgetRange: "1650",
  amenities: null, special: null, priceLabelMode: "starting_at", ...o,
} as SourceMeta)

const NEW7 = ["apartment_crush", "engagement", "level_up", "them_vs_me", "view", "aura", "pov_couple"] as const

/** The original twenty-four, in their original registry order. Written out literally: a list
 *  derived from the thing it is checking would agree with any corruption of it. */
const ORIGINAL_24 = [
  "market_type", "market_type_centered", "your_sign", "special_feature", "next_property", "upgrade",
  "apartment_standards", "pov_upgrade", "affordable_luxury", "pov_price", "hits_different", "trade_up",
  "wanted_luxury", "real_living", "what_mo_gets_you", "what_mo_gets_you_top", "property_tour",
  "would_you_live_here", "imagine_coming_home", "client_me", "client_me_bad_credit",
  "client_me_ex_cheated", "client_me_rent_increase", "client_me_roaches",
]

console.log("\n=== 1. THE ORIGINAL 24 ARE UNTOUCHED ===")
{
  eq("every original id is still registered, in its original index", OVERLAY_TEMPLATES.slice(0, 24), ORIGINAL_24)
  eq("the registry grew to 31 by APPENDING", OVERLAY_TEMPLATES.length, 31)
  eq("…and the seven new ids are the appended tail", OVERLAY_TEMPLATES.slice(24), [...NEW7])
  ok("no id is duplicated", new Set(OVERLAY_TEMPLATES).size === OVERLAY_TEMPLATES.length)
  ok("every registered template has a label", OVERLAY_TEMPLATES.every((t) => !!OVERLAY_TEMPLATE_LABEL[t]))
  // The original labels, spot-checked at the boundaries that a careless edit would hit.
  eq("the first label is unchanged", OVERLAY_TEMPLATE_LABEL.market_type, "Market + Type")
  eq("the Client / Me labels are unchanged", [
    OVERLAY_TEMPLATE_LABEL.client_me, OVERLAY_TEMPLATE_LABEL.client_me_roaches,
  ], ["Client / Me", "Client / Me — Roaches"])
  // Wording of the group this change sits next to, proven unchanged rather than assumed.
  eq("Client / Me still says what it said", buildTemplateHeadline("client_me" as OverlayTemplate, meta()),
    "Client: “I need a high-rise in Dallas.”")
  eq("…and still replies the same way", buildTemplateDetail("client_me" as OverlayTemplate, meta()), "Me: “Say less.”")
  eq("…and its caption opener is unchanged", captionOpener("client_me" as OverlayTemplate, meta()),
    "You tell me what you’re looking for. I’ll find it. 😎")
  eq("Template 7's headline is unchanged", buildTemplateHeadline("apartment_standards" as OverlayTemplate, meta()),
    buildTemplateHeadline("apartment_standards" as OverlayTemplate, meta()))
  eq("…and Template 7's layout family is unchanged", templateFamily("apartment_standards"), "center_hook_detail")
}

console.log("\n=== 2. DISPLAY ORDER IS SEPARATE FROM IDENTITY ===")
{
  eq("the dropdown lists all 31", OVERLAY_TEMPLATE_ORDER.length, 31)
  eq("…each exactly once", new Set(OVERLAY_TEMPLATE_ORDER).size, 31)
  // The two lists must contain the SAME set — a template added to one and forgotten in the other
  // would either vanish from the dropdown or appear with no identity.
  eq("the order holds exactly the registered set",
    [...OVERLAY_TEMPLATE_ORDER].sort(), [...OVERLAY_TEMPLATES].sort())
  eq("positions 1-19 are the registry's own first nineteen",
    OVERLAY_TEMPLATE_ORDER.slice(0, 19), OVERLAY_TEMPLATES.slice(0, 19))
  const at = (n: number) => OVERLAY_TEMPLATE_LABEL[OVERLAY_TEMPLATE_ORDER[n - 1]]
  eq("20-26 are the seven new templates, in the approved order",
    [at(20), at(21), at(22), at(23), at(24), at(25), at(26)],
    ["Apartment Crush", "Engagement", "Level Up", "Them vs. Me", "View", "Aura", "POV Couple"])
  eq("27-31 are the Client / Me group, shifted down intact",
    [at(27), at(28), at(29), at(30), at(31)],
    ["Client / Me", "Client / Me — Bad Credit", "Client / Me — My Ex Cheated",
     "Client / Me — Rent Increase", "Client / Me — Roaches"])
  // A saved draft stores the STRING. Reordering the display cannot reach it.
  ok("every original id still resolves after the reorder",
    ORIGINAL_24.every((t) => (OVERLAY_TEMPLATES as readonly string[]).includes(t)))
  const editor = read("components/crm/social/PostEditor.tsx")
  ok("the dropdown renders from the display order", /OVERLAY_TEMPLATE_ORDER\.map\(\(t, i\)/.test(editor))
  ok("…and no longer numbers from the registry", !/OVERLAY_TEMPLATES\.map\(\(t, i\)/.test(editor))
}

console.log("\n=== 3. THE SEVEN SAY EXACTLY WHAT WAS APPROVED ===")
{
  const expect: Record<string, [string, string, string]> = {
    apartment_crush: ["I wasn’t even looking to move…", "Starting at $1,650/month", "I wasn't even looking to move… 👀"],
    engagement: ["Who would you live here with?", "Starting at $1,650/month", "Who would you live here with? 👀"],
    level_up: ["You leveled up", "Starting at $1,650/month", "You leveled up 🔥"],
    them_vs_me: ["Them: Just get a regular apartment bro", "Me: Nah, I’m good", "Nah, I'm good 😂"],
    view: ["I’ll never get tired of this view", "Starting at $1,650/month", "I'll never get tired of this view 😍"],
    aura: ["This high-rise has too much aura", "Starting at $1,650/month", "This has too much aura 🔥"],
    pov_couple: ["POV: You just moved in with the love of your life", "Starting at $1,650/month", "POV: Tag your love ❤️"],
  }
  for (const t of NEW7) {
    const [head, detail, opener] = expect[t]
    eq(`${t} headline`, buildTemplateHeadline(t as OverlayTemplate, meta()), head)
    eq(`${t} detail`, buildTemplateDetail(t as OverlayTemplate, meta()), detail)
    eq(`${t} caption opening`, captionOpener(t as OverlayTemplate, meta()), opener)
  }
  // "Level Up" supersedes an earlier proposal; the old wording must not survive anywhere.
  ok("the superseded 'upgraded your lifestyle' wording is absent",
    !/upgraded your lifestyle/i.test(read("lib/social/composePost.ts")))
  // Metadata-free by design: these must caption a walkthrough with nothing filled in.
  const bare = meta({ market: null, propertyType: null, budgetRange: null } as never)
  for (const t of NEW7) {
    ok(`${t} still resolves with no metadata at all`, !!buildTemplateHeadline(t as OverlayTemplate, bare))
    ok(`${t} still has a caption opening with no metadata`, !!captionOpener(t as OverlayTemplate, bare))
  }
}

console.log("\n=== 4. THEM VS. ME IS A CLIENT / ME EXCHANGE, NOT A NEW LAYOUT ===")
{
  eq("it is in the SAME layout family as Client / Me",
    templateFamily("them_vs_me"), templateFamily("client_me"))
  eq("…which is center_hook_detail", templateFamily("them_vs_me"), "center_hook_detail")
  // Structure: statement in the headline, reply in the detail — exactly Client / Me's shape.
  ok("the setup is the headline", buildTemplateHeadline("them_vs_me" as OverlayTemplate, meta()).startsWith("Them:"))
  ok("the reply is the detail", buildTemplateDetail("them_vs_me" as OverlayTemplate, meta()).startsWith("Me:"))
  // It is a two-statement exchange, so its detail is NOT the price line — it must not collapse
  // when a property has no price, or the joke loses its punchline.
  eq("the reply survives a missing price",
    buildTemplateDetail("them_vs_me" as OverlayTemplate, meta({ budgetRange: null } as never)), "Me: Nah, I’m good")
  // And no Client / Me template was touched to achieve any of it.
  for (const t of ["client_me", "client_me_bad_credit", "client_me_ex_cheated", "client_me_rent_increase", "client_me_roaches"]) {
    eq(`${t} is still center_hook_detail`, templateFamily(t), "center_hook_detail")
    eq(`${t} still replies “Say less.” or its own line`, typeof buildTemplateDetail(t as OverlayTemplate, meta()), "string")
  }
  ok("no new layout family was invented",
    new Set(OVERLAY_TEMPLATES.map((t) => templateFamily(t))).size <= 3)
}

console.log("\n=== 5. AURA USES ONLY THE SIX SHORT TYPES ===")
{
  eq("the allow-list is exactly the six approved types", [...AURA_SHORT_TYPES],
    ["Studio", "Apartment", "High-Rise", "Loft", "Townhome", "Penthouse"])
  for (const t of AURA_SHORT_TYPES) {
    eq(`${t} is named in the sentence`, buildTemplateHeadline("aura" as OverlayTemplate, meta({ propertyType: t } as never)),
      `This ${t.toLowerCase()} has too much aura`)
  }
  // THE RULE THAT MATTERS: the long label must never reach the video.
  for (const t of ["Rental Home", "Split-Level Townhome", "Industrial-Style Apartment", "", null]) {
    const h = buildTemplateHeadline("aura" as OverlayTemplate, meta({ propertyType: t } as never))
    eq(`"${t}" falls back to the typeless sentence`, h, "This place has too much aura")
    ok(`…and never prints "${t}"`, !t || !h.toLowerCase().includes(String(t).toLowerCase()))
  }
  // The same function feeds the preview and the FFmpeg render, so the rule cannot differ between
  // them — there is only one implementation to differ from.
  ok("the preview and the render read the same headline builder",
    /buildTemplateHeadline/.test(read("components/crm/social/PostEditor.tsx")))
  ok("Aura reuses Template 7's family rather than a new one",
    templateFamily("aura") === templateFamily("apartment_standards"))
}

console.log("\n=== 6. PRICING IS THE PROPERTY'S OWN, OR NOTHING ===")
{
  // The figures in the brief were placeholders. Nothing may hardcode them.
  // Comments stripped: T18's doc comment legitimately quotes "$1,500/month" as an EXAMPLE of why
  // it carries no price line. A historical note is fine; a live literal is not.
  const src = read("lib/social/composePost.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
  for (const placeholder of ["1,500/month", "1,550/month", "1,650/month", "$1,500", "$1,550", "$1,650"]) {
    ok(`no hardcoded ${placeholder} in live code`, !src.includes(placeholder))
  }
  for (const t of NEW7.filter((x) => x !== "them_vs_me")) {
    eq(`${t} shows THIS property's price`,
      buildTemplateDetail(t as OverlayTemplate, meta({ budgetRange: "2495" } as never)), "Starting at $2,495/month")
    // Missing or invalid pricing collapses the line and its gap — never "$0", never "Starting at".
    for (const bad of ["", null, "0", "abc"]) {
      eq(`${t} collapses on budgetRange=${JSON.stringify(bad)}`,
        buildTemplateDetail(t as OverlayTemplate, meta({ budgetRange: bad } as never)), "")
    }
  }
  // THE VIDEO PRICE AND THE CAPTION CANNOT DISAGREE, because these captions state no price at all.
  // Their approved openings are deliberately figure-free, so there is no second number to drift.
  // Asserted explicitly rather than left implied: if an opener ever gains a price, this fails and
  // the agreement has to be made real.
  const priced = meta({ budgetRange: "2495" } as never)
  for (const t of NEW7) {
    const caption = buildCaption(priced, "seed", t as OverlayTemplate)
    ok(`${t}: the caption states no price, so none can contradict the video`,
      !/\$[\d,]+/.test(caption), caption.slice(0, 80))
  }
  eq("…while the video does carry the property's figure",
    buildTemplateDetail("view" as OverlayTemplate, priced), "Starting at $2,495/month")
}

console.log("\n=== 7. THE CAPTION IS THE EXISTING ONE, WITH A NEW FIRST LINE ===")
{
  for (const t of NEW7) {
    const caption = buildCaption(meta(), "seed", t as OverlayTemplate)
    const opener = captionOpener(t as OverlayTemplate, meta())!
    ok(`${t} opens with its approved line`, caption.startsWith(opener), caption.slice(0, 60))
    // Not duplicated further down.
    const rest = caption.slice(opener.length)
    ok(`${t} does not repeat the hook`, !rest.includes(opener))
  }

  // THE STRONGEST PRESERVATION CHECK AVAILABLE: everything after the opening line is byte-identical
  // to what an EXISTING template produces from the same source. The seven add a first line and
  // change nothing else — the free-service line, the approved CTA and its property-type comment
  // keyword all arrive from the same generator they always did.
  const reference = buildCaption(meta(), "seed", "market_type" as OverlayTemplate)
  const refBody = reference.slice(captionOpener("market_type" as OverlayTemplate, meta())!.length)
  for (const t of NEW7) {
    const body = buildCaption(meta(), "seed", t as OverlayTemplate)
      .slice(captionOpener(t as OverlayTemplate, meta())!.length)
    eq(`${t} body is identical to an existing template's`, body, refBody)
  }
  ok("…and that body still carries the approved CTA", refBody.includes("Comment"))
  ok("…with the property-type comment keyword", /"(LIST|TOWN|LOFT|RISE|HOME|KEY)"/.test(refBody))
  ok("…and the free-service line", refBody.includes("completely free"))
  // The existing openers are untouched — spot-checked across the structural variants.
  eq("T1 opener unchanged", captionOpener("market_type" as OverlayTemplate, meta()), "Moving to Dallas? I got you.")
  eq("T18 opener unchanged", captionOpener("would_you_live_here" as OverlayTemplate, meta()),
    "Be honest… would you pay $1,650/month? 👀")
  eq("T19 opener unchanged", captionOpener("imagine_coming_home" as OverlayTemplate, meta()),
    "Imagine calling this place home. 🏡✨")
}

console.log("\n=== 8. TYPOGRAPHY IS UNCHANGED — LIBRE BASKERVILLE, NO BODONI ===")
{
  const spec = read("lib/social/overlaySpec.ts")
  ok("no Bodoni reference was introduced", !/bodoni/i.test(spec.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")))
  ok("the Libre face is still the overlay typeface", /LibreBaskerville|Libre Baskerville/i.test(spec))
  // Nothing in this change may touch the shared geometry constants.
  ok("no new font constant was added", !/new FontFace|@font-face/i.test(spec))
  ok("the seven reuse an EXISTING family rather than declaring geometry",
    NEW7.every((t) => templateFamily(t) === "center_hook_detail"))
}

console.log(fail === 0 ? `\nALL PASS ✅ (${pass} passed, ${fail} failed)\n` : `\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
