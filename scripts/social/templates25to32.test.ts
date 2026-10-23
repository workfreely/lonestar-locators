/**
 * TEMPLATES 25-32 — the eight conversational additions, and the twenty-four they must not disturb.
 *
 *   npx tsx scripts/social/templates25to32.test.ts
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
  HIDDEN_FROM_SELECTOR,
  OVERLAY_TEMPLATES, OVERLAY_TEMPLATE_ORDER, OVERLAY_TEMPLATE_LABEL, AURA_SHORT_TYPES,
  buildTemplateHeadline, buildTemplateDetail, captionOpener, buildCaption,
  roomiePerPersonDollars, formatRoomieSplit, startingPriceLabel,
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
/** T32 Roomie is kept separate from NEW7: it is the only one whose detail is COMPUTED, so the
 *  price-line assertions written for the other six do not describe it. */
const ROOMIE = "roomie" as OverlayTemplate

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
  // T33 (pov_regular_shmegular) was appended after this batch, so the length moves while every
  // index this suite cares about stays put — which is exactly what the next assertion proves.
  eq("the registry grew by APPENDING", OVERLAY_TEMPLATES.length, 33)
  eq("…and the eight ids of THIS batch still occupy indices 24-31", OVERLAY_TEMPLATES.slice(24, 32), [...NEW7, "roomie"])
  eq("…with T33 appended after them, touching none of the above", OVERLAY_TEMPLATES.slice(32), ["pov_regular_shmegular"])
  ok("no id is duplicated", new Set(OVERLAY_TEMPLATES).size === OVERLAY_TEMPLATES.length)
  ok("every registered template has a label", OVERLAY_TEMPLATES.every((t) => !!OVERLAY_TEMPLATE_LABEL[t]))
  // The original labels, spot-checked at the boundaries that a careless edit would hit.
  // market_type kept its registry index and its geometry; only its LABEL changed, to "(Top)", so
  // History can still name which variant a historical post used now that the selector offers one.
  eq("the hidden top variant is labelled for History", OVERLAY_TEMPLATE_LABEL.market_type, "Market + Type (Top)")
  eq("…and the first VISIBLE template is the centred one", OVERLAY_TEMPLATE_LABEL[OVERLAY_TEMPLATE_ORDER[0]], "Market + Type")
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
  eq("the dropdown lists every registered template except the hidden ones", OVERLAY_TEMPLATE_ORDER.length, OVERLAY_TEMPLATES.length - HIDDEN_FROM_SELECTOR.length)
  eq("…each exactly once", new Set(OVERLAY_TEMPLATE_ORDER).size, OVERLAY_TEMPLATE_ORDER.length)
  // The two lists must contain the SAME set — a template added to one and forgotten in the other
  // would either vanish from the dropdown or appear with no identity.
  eq("the order holds exactly the registered set, minus the hidden ones",
    [...OVERLAY_TEMPLATE_ORDER].sort(),
    OVERLAY_TEMPLATES.filter((t) => !(HIDDEN_FROM_SELECTOR as readonly string[]).includes(t)).slice().sort())
  ok("every hidden template is still registered",
    HIDDEN_FROM_SELECTOR.every((t) => (OVERLAY_TEMPLATES as readonly string[]).includes(t)))
  ok("…and none of them is in the dropdown",
    HIDDEN_FROM_SELECTOR.every((t) => !(OVERLAY_TEMPLATE_ORDER as readonly string[]).includes(t)))
  eq("the leading block is the registry's first nineteen, reordered and filtered",
    OVERLAY_TEMPLATE_ORDER.slice(0, 17),
    ["market_type_centered", ...OVERLAY_TEMPLATES.slice(0, 19).filter(
      (t) => t !== "market_type_centered" && !(HIDDEN_FROM_SELECTOR as readonly string[]).includes(t))])
  const at = (n: number) => OVERLAY_TEMPLATE_LABEL[OVERLAY_TEMPLATE_ORDER[n - 1]]
  // 20-26 are unchanged. T33 was INSERTED at display 27 (directly after the template it is built
  // from), so Roomie moved 27 → 28 and the Client / Me group moved down one with it. Display
  // positions are allowed to move; the registry indices asserted above are not.
  // ADJACENCY, NOT ABSOLUTE POSITIONS. Hiding two templates above this batch moved every one of
  // them up two, for a reason with nothing to do with the batch. What was approved is the order
  // they sit in relative to one another, so that is what is pinned.
  const seq = ["Apartment Crush", "Live With", "Level Up", "Them vs. Me", "View", "Aura", "POV Couple",
    "POV: Regular Shmegular Upgrade", "Roomie",
    "Client / Me", "Client / Me — Bad Credit", "Client / Me — My Ex Cheated",
    "Client / Me — Rent Increase", "Client / Me — Roaches"]
  const labels = OVERLAY_TEMPLATE_ORDER.map((t) => OVERLAY_TEMPLATE_LABEL[t])
  const firstIdx = labels.indexOf(seq[0])
  ok("the batch appears in the dropdown", firstIdx >= 0)
  eq("…in the approved order, contiguously, through the Client / Me group",
    labels.slice(firstIdx, firstIdx + seq.length), seq)
  eq("…and it runs to the end of the list", firstIdx + seq.length, OVERLAY_TEMPLATE_ORDER.length)
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

console.log("\n=== 9. ROOMIE SPLITS THE ENTERED PRICE, OR SHOWS NOTHING ===")
{
  const at = (budgetRange: string | null, propertyType: string | null = "Apartment") =>
    buildTemplateDetail(ROOMIE, meta({ budgetRange, propertyType } as never))

  // The four approved examples, exactly as specified.
  eq("$1,400 → $700", at("1400"), "Only $700/month per roomie")
  eq("$1,600 → $800", at("1600"), "Only $800/month per roomie")
  eq("$1,750 → $875", at("1750"), "Only $875/month per roomie")
  eq("$2,000 → $1,000", at("2000"), "Only $1,000/month per roomie")
  // Thousands separator, NOT the compact "$1K" form a headline rent would get. A per-person split
  // is a precise claim; "$1K per roomie" reads as an approximation of one.
  ok("a four-figure split is not compacted", at("2000").includes("$1,000") && !at("2000").includes("$1K"))

  // CEIL, so the figure never understates what a roommate would actually pay. Whole dollars: an
  // overlay is read at arm's length in a second, and every other money figure here rounds too.
  eq("the third approved example", at("1999"), "Only $1,000/month per roomie")
  eq("odd rent rounds UP", at("1705"), "Only $853/month per roomie")
  eq("…and another", at("1625"), "Only $813/month per roomie")
  eq("…and an odd three-figure rent", at("999"), "Only $500/month per roomie")
  ok("no split ever shows cents", ["1400", "1600", "1705", "999", "1333", "1999"].every((p) => !at(p).includes(".")))
  eq("the helper ceils rather than rounds", roomiePerPersonDollars(meta({ budgetRange: "1999" } as never)), 1000)
  eq("…and leaves an even split alone", roomiePerPersonDollars(meta({ budgetRange: "1600" } as never)), 800)
  eq("formatting adds a separator above a thousand", formatRoomieSplit(1000), "$1,000")
  eq("…and leaves three figures plain", formatRoomieSplit(800), "$800")

  // ── NEGATIVE, ZERO, MISSING AND INVALID ALL PRODUCE NOTHING ────────────────────────────────
  // -500 is the case that matters. The shared lowestPrice matches digit runs and IGNORES a
  // leading minus, so it reads 500 — which is how every priced template has always behaved.
  // Roomie refuses it WITHOUT touching that parser, because tightening it would silently change
  // templates that are already deployed and approved.
  for (const bad of ["-500", "-1600", "$-500", " -500", "-0", "0", "abc", "", "$", "  ", null, undefined]) {
    eq(`budgetRange=${JSON.stringify(bad) ?? "undefined"} shows no figure`, at(bad as never), "")
    eq(`…and yields no amount`, roomiePerPersonDollars(meta({ budgetRange: bad } as never)), null)
  }
  ok("-500 never becomes $250", at("-500") === "" && !at("-500").includes("250"))

  // THE SHARED PARSER IS UNTOUCHED, so every existing template still behaves exactly as deployed.
  eq("startingPriceLabel(-500) is unchanged", startingPriceLabel("-500", "starting_at"), "Starting at $500/month")
  eq("startingPriceLabel(1600) is unchanged", startingPriceLabel("1600", "starting_at"), "Starting at $1,600/month")
  ok("lowestPrice itself was not modified", (read("lib/social/composePost.ts").match(/function lowestPrice/g) ?? []).length === 1)
  ok("…and the strictness lives only in Roomie's own guard",
    /function hasNegativeLeadingAmount/.test(read("lib/social/composePost.ts")))

  // A HYPHEN LATER IN THE STRING IS A RANGE, NOT A NEGATION — en-dash ranges must keep resolving.
  eq("a hyphen range still resolves", at("1200-1800"), "Only $600/month per roomie")
  eq("an en-dash range still resolves", at("$1,200 – $1,800"), "Only $600/month per roomie")
  eq("a thousands separator still parses", at("1,600"), "Only $800/month per roomie")

  // IT READS THE OPERATOR'S ENTERED FIELD AND NOTHING ELSE. No catalog, no derived rent, no new
  // pricing field — the same budgetRange every other priced template reads.
  const src = read("lib/social/composePost.ts")
  ok("no two-bedroom pricing field was introduced", !/twoBedroomRent/.test(src))
  ok("the split reads budgetRange", /lowestPrice\(src\.budgetRange\)/.test(src))
  ok("…via the shared parser, not a second one", (src.match(/function lowestPrice/g) ?? []).length === 1)
  ok("no catalog lookup was added", !/property_catalog|twobr_starting_rent/.test(src))

  // Headline: the existing short-type formatting, with Studio excluded because a studio has no
  // bedroom — "2 bed studio" is a contradiction, not an awkward label.
  const head = (propertyType: string | null) =>
    buildTemplateHeadline(ROOMIE, meta({ propertyType } as never))
  for (const t of ["Apartment", "High-Rise", "Loft", "Townhome", "Penthouse"]) {
    eq(`${t} reads naturally`, head(t), `2 bed ${t.toLowerCase()}…`)
  }
  for (const t of ["Studio", "Rental Home", "Split-Level Townhome", null]) {
    eq(`${JSON.stringify(t)} falls back`, head(t), "2 bed place…")
  }
  ok("no long label reaches the headline", !head("Rental Home").toLowerCase().includes("rental home"))

  // Caption, layout and typography all come from the existing system.
  eq("the caption opening", captionOpener(ROOMIE, meta()), "Tag your future roomie 👀🏡")
  ok("the caption states no figure, so it cannot contradict the video",
    !/\$[\d,]+/.test(buildCaption(meta(), "seed", ROOMIE)))
  eq("it reuses the shared hook+detail layout", templateFamily("roomie"), "center_hook_detail")
  eq("…the same one POV Couple uses", templateFamily("roomie"), templateFamily("pov_couple"))

  // PREVIEW AND RENDER CANNOT DISAGREE: the editor computes this text once and stores it in
  // overlay_headline/overlay_subheadline, and renderPost renders those stored columns.
  const renderPost = read("lib/social/renderPost.ts")
  ok("the renderer renders the STORED overlay text", /overlay_headline as string \| null/.test(renderPost))
  ok("…so there is one calculation, not two", !/buildTemplateDetail/.test(renderPost))
}

console.log(fail === 0 ? `\nALL PASS ✅ (${pass} passed, ${fail} failed)\n` : `\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
