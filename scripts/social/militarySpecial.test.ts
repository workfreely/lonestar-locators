// Social Beast — T34 MILITARY SPECIAL, and the USA comment keyword.
//
// Two things ship together here and the tests keep them apart: a TEMPLATE whose caption's paragraph
// shape is the deliverable, and a KEYWORD added to an automation that already serves fourteen
// others and must not notice.
//
// Run: npx tsx scripts/social/militarySpecial.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"
import {
  OVERLAY_TEMPLATES, OVERLAY_TEMPLATE_ORDER, OVERLAY_TEMPLATE_LABEL,
  buildCaption, buildTemplateHeadline, buildTemplateDetail, commentCta, commentCtaKeyword,
  militarySpecialCaption, MILITARY_SPECIAL_CAPTION, MILITARY_KEYWORD,
  preparePost, composeFinalCaption, buildTikTokCaptionPayload, isGeneratedHashtags,
  type OverlayTemplate, type SourceMeta,
} from "@/lib/social/composePost"
import { templateFamily, OVERLAY_TEXT_OVERRIDES, computeOverlayLayout } from "@/lib/social/overlaySpec"
import {
  templateHashtags, hashtagsForPost, marketHashtagSlug, buildHashtags,
  MILITARY_SPECIAL_FIXED_HASHTAGS, MAX_HASHTAGS,
} from "@/lib/social/hashtags"
import { SOCIAL_MARKETS } from "@/lib/social/markets"
import {
  COMMENT_KEYWORDS, matchComment, matchingKeywords, dmBodyForKeyword,
  APPROVED_DM_BODY, KEYWORD_DM_BODY,
} from "@/lib/social/commentKeywords"

let pass = 0
let fail = 0
const ok = (what: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ✓ ${what}`) } else { fail++; console.log(`  ✗ ${what}`) }
}
const eq = (what: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log(`  ✓ ${what}`) }
  else { fail++; console.log(`  ✗ ${what}\n      got  ${g}\n      want ${w}`) }
}
const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8")
const strip = (src: string) =>
  src.split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*")).join("\n")

const src = (over: Partial<SourceMeta> = {}): SourceMeta =>
  ({ market: "San Antonio", propertyType: "Apartment", ...over }) as SourceMeta

console.log("POSITION 27, AND NOTHING ELSE MOVES:")
{
  eq("the dropdown now lists 32", OVERLAY_TEMPLATE_ORDER.length, 32)
  eq("the registry grew to 34 by APPENDING", OVERLAY_TEMPLATES.length, 34)
  eq("…and the new id is LAST in the registry, so no saved post is re-pointed",
    OVERLAY_TEMPLATES[OVERLAY_TEMPLATES.length - 1], "military_special")
  eq("Military Special is at DISPLAY position 27",
    OVERLAY_TEMPLATE_ORDER.indexOf("military_special") + 1, 27)
  eq("…and the Client / Me group shifted to 28-32", OVERLAY_TEMPLATE_ORDER.slice(27), [
    "client_me", "client_me_bad_credit", "client_me_ex_cheated",
    "client_me_rent_increase", "client_me_roaches",
  ])
  eq("Roaches is last, at 32", OVERLAY_TEMPLATE_ORDER[31], "client_me_roaches")
  eq("the label reads as the operator expects", OVERLAY_TEMPLATE_LABEL.military_special, "Military Special")
  ok("every registered template still has a label",
    OVERLAY_TEMPLATES.every((t) => (OVERLAY_TEMPLATE_LABEL[t] ?? "").trim() !== ""))
  ok("no id is duplicated", new Set(OVERLAY_TEMPLATES).size === OVERLAY_TEMPLATES.length)
  ok("…and no display entry is duplicated",
    new Set(OVERLAY_TEMPLATE_ORDER).size === OVERLAY_TEMPLATE_ORDER.length)
  // The positions BEFORE 27 are what existing operator muscle memory depends on.
  eq("positions 1-26 are untouched", OVERLAY_TEMPLATE_ORDER.slice(0, 26), [
    "market_type_centered", "your_sign", "special_feature", "next_property", "upgrade",
    "apartment_standards", "pov_upgrade", "affordable_luxury", "pov_price", "hits_different",
    "trade_up", "wanted_luxury", "real_living", "what_mo_gets_you", "property_tour",
    "would_you_live_here", "imagine_coming_home", "apartment_crush", "engagement", "level_up",
    "them_vs_me", "view", "aura", "pov_couple", "pov_regular_shmegular", "roomie",
  ])
  // No UI change was needed, and this is why.
  ok("the dropdown still numbers itself from POSITION, not from a stored number",
    /OVERLAY_TEMPLATE_ORDER\.map\(\(t, i\) => <option key=\{t\} value=\{t\}>\{i \+ 1\}\./
      .test(read("components/crm/social/PostEditor.tsx")))
}

console.log("\nTHE OVERLAY — EXISTING LAYOUT, NOT A NEW ONE:")
{
  eq("headline", buildTemplateHeadline("military_special", src()), "MILITARY SPECIAL")
  eq("detail", buildTemplateDetail("military_special", src()),
    "$0 Deposit - $0 App/Admin Fees - 8 Weeks Free")
  // The default in templateFamily is `hero`, so this assertion is the one that catches an
  // omission there — the overlay would otherwise render top-anchored in hero typography.
  eq("it joins the shared centred headline+detail family",
    templateFamily("military_special"), "center_hook_detail")
  eq("…the SAME family Roomie and POV Couple use, so geometry is inherited, not copied",
    templateFamily("military_special"), templateFamily("roomie"))
  // Fixed copy: no property metadata reaches the overlay, so nothing can degrade or go stale.
  for (const over of [{}, { market: null }, { propertyType: null }, { budgetRange: null }, { market: "Austin", propertyType: "Loft" }]) {
    ok(`the overlay is identical whatever the metadata says (${JSON.stringify(over)})`,
      buildTemplateHeadline("military_special", src(over as Partial<SourceMeta>)) === "MILITARY SPECIAL"
      && buildTemplateDetail("military_special", src(over as Partial<SourceMeta>)) === "$0 Deposit - $0 App/Admin Fees - 8 Weeks Free")
  }
  ok("no overlay styling was added for it — it carries no text-style override",
    !Object.keys(OVERLAY_TEXT_OVERRIDES).includes("military_special"))
  // The frozen snapshot now carries this template's two Instagram entries. That file records what
  // the layout IS; this asserts it is the family's shared geometry rather than anything new —
  // same headline size, side margins and line spacing as Roomie, which is the point of joining a
  // family instead of adding a layout.
  {
    const mil = computeOverlayLayout("military_special", "MILITARY SPECIAL", "$0 Deposit - $0 App/Admin Fees - 8 Weeks Free", "instagram")
    const roo = computeOverlayLayout("roomie", "2 bed apartment…", "Only $600/month per roomie", "instagram")
    eq("headline size is the family's", mil.headline.fontPx, roo.headline.fontPx)
    eq("side margins are the family's", mil.headline.sideMarginPx, roo.headline.sideMarginPx)
    eq("line spacing is the family's", mil.headline.lineSpacing, roo.headline.lineSpacing)
    ok("it is vertically centred, not top-anchored", mil.headline.topPx > 800 && mil.headline.topPx < 1000)
    ok("…and nowhere near Instagram's 427 top anchor", mil.headline.topPx !== 427)
    ok("the detail sits just below the headline", (mil.detail?.topPx ?? 0) - mil.headline.topPx === (roo.detail?.topPx ?? 0) - roo.headline.topPx)
    ok("both lines render on one line each",
      mil.headline.lines.length === 1 && (mil.detail?.lines.length ?? 0) === 1)
  }
}

console.log("\nTHE CAPTION — THE PARAGRAPH SHAPE IS THE DELIVERABLE:")
{
  const cap = buildCaption(src({ propertyName: "Preston Peak" } as Partial<SourceMeta>), "seed", "military_special")

  // The exact string, newlines and all. If this passes, the spacing requirement is met.
  eq("the caption is byte-exact, with real newline characters", cap,
    "Deploying to San Antonio? I got you 🇺🇸\n\n"
    + "✅ $0 Security Deposit\n✅ $0 App and Admin Fees\n✅ 8 WEEKS FREE RENT! 🔥\n\n"
    + "My apartment locating service is completely FREE!\n\n"
    + "✅ Comment \"USA\" and I’ll send you the best options within your budget.")

  const blocks = cap.split("\n\n")
  eq("four paragraphs", blocks.length, 4)
  eq("blank line after the opening sentence", blocks[0], "Deploying to San Antonio? I got you 🇺🇸")
  eq("the three specials are on CONSECUTIVE lines, single-spaced", blocks[1].split("\n"), [
    "✅ $0 Security Deposit", "✅ $0 App and Admin Fees", "✅ 8 WEEKS FREE RENT! 🔥",
  ])
  eq("blank line after the specials, then the free-service sentence",
    blocks[2], "My apartment locating service is completely FREE!")
  eq("the CTA is its own final paragraph",
    blocks[3], "✅ Comment \"USA\" and I’ll send you the best options within your budget.")
  ok("nothing collapsed into one paragraph", cap.includes("\n\n") && blocks.length === 4)
  ok("the specials block is NOT separated by blank lines", !blocks[1].includes("\n\n"))
  eq("exactly three blank-line breaks", cap.split("\n\n").length - 1, 3)
  // 2 (after the opener) + 2 inside the specials block + 2 + 2 = 8.
  eq("exactly eight newline characters in all", (cap.match(/\n/g) ?? []).length, 8)
  ok("no literal backslash-n leaked into the text", !cap.includes("\\n"))

  // The service line is the FIXED family's uppercase one, not the composed captions' lowercase.
  ok("the uppercase FREE! service line is used", cap.includes("completely FREE!"))
  ok("…and not the lowercase composed one", !cap.includes("completely free!"))
}

console.log("\nTHE CITY REFLECTS THE SELECTED MARKET:")
{
  for (const market of ["San Antonio", "Austin", "Dallas", "DFW", "Houston"]) {
    eq(`${market}`, buildCaption(src({ market }), "s", "military_special").split("\n")[0],
      `Deploying to ${market}? I got you 🇺🇸`)
  }
  // Never a market the post is not for, and never an invented one.
  for (const blank of [null, undefined, "", "   "]) {
    eq(`a blank market (${JSON.stringify(blank)}) degrades to the cityless opening`,
      buildCaption(src({ market: blank as string }), "s", "military_special").split("\n")[0],
      "Deploying? I got you 🇺🇸")
  }
  ok("the cityless form is exported for the generated-vs-manual check",
    MILITARY_SPECIAL_CAPTION.startsWith("Deploying? I got you"))
  ok("no market name is hardcoded in the caption builder",
    !/San Antonio|Austin|Dallas|Houston|DFW/.test(
      strip(read("lib/social/composePost.ts")).split("const militaryLines")[1]?.slice(0, 400) ?? ""))
}

console.log("\nTHE PROPERTY NAME CAN NEVER APPEAR:")
{
  const names = ["Preston Peak", "Abacus Alamo Ranch", "Stoneleigh"]
  for (const propertyName of names) {
    const cap = buildCaption(
      src({ propertyName, special: "Look & Lease $500 off", amenities: "Pool, Gym" } as Partial<SourceMeta>),
      "s", "military_special",
    )
    ok(`"${propertyName}" is absent from the caption`, !cap.includes(propertyName))
    // The whole point of returning fixed copy: no special, no amenity block, no price line.
    ok(`…and so is the property's unrelated special`, !cap.includes("Look & Lease"))
    ok(`…and its amenities`, !cap.includes("Pool") && !cap.includes("Gym"))
    ok(`…and any price`, !/\$\d/.test(cap.replace(/\$0/g, "")))
  }
  ok("the overlay carries no property name either",
    !buildTemplateHeadline("military_special", src({ propertyName: "Preston Peak" } as Partial<SourceMeta>)).includes("Preston")
    && !buildTemplateDetail("military_special", src({ propertyName: "Preston Peak" } as Partial<SourceMeta>)).includes("Preston"))
}

console.log("\nTHE CTA KEYWORD IS PINNED, NOT DERIVED FROM PROPERTY TYPE:")
{
  eq("the exported keyword", MILITARY_KEYWORD, "USA")
  // The trap this guards: an apartment derives LIST, so a derived keyword would be wrong here.
  eq("an apartment would otherwise derive LIST", commentCtaKeyword("Apartment"), "LIST")
  for (const propertyType of ["Apartment", "Townhome", "Loft", "High-Rise", "Rental Home", "Penthouse", null]) {
    ok(`the caption still says USA for ${propertyType ?? "no type"}`,
      buildCaption(src({ propertyType: propertyType as string }), "s", "military_special")
        .includes('Comment "USA"'))
  }
  // ONE sentence, shared: the override changes the keyword and nothing else about the wording.
  eq("the override only swaps the keyword", commentCta(null, "USA"),
    commentCta(null).replace('"LIST"', '"USA"'))
  eq("an empty override falls back to the derived keyword", commentCta("Townhome", ""), commentCta("Townhome"))
  eq("an absent override is the existing behaviour, unchanged", commentCta("Loft", undefined), commentCta("Loft"))
  eq("…and every existing template's CTA is untouched", commentCta("Penthouse"),
    '✅ Comment "KEY" and I’ll send you the best options within your budget.')
}

console.log("\nTHE USA KEYWORD — MATCHING:")
{
  eq("the keyword set grew by exactly one", COMMENT_KEYWORDS.length, 15)
  ok("USA is registered", COMMENT_KEYWORDS.some((k) => k.keyword === "USA"))
  eq("…as an apartment lead",
    COMMENT_KEYWORDS.find((k) => k.keyword === "USA")?.propertyType, "Apartment")

  for (const t of ["USA", "usa", "UsA", "USA!", "usa?", "USA 🇺🇸", "🇺🇸 USA", "Moving to USA soon",
                   "usa — please send", "(USA)"]) {
    eq(`matches ${JSON.stringify(t)}`, matchComment(t)?.keyword, "USA")
  }
  // The failure this feature must never produce is an unsolicited DM, so the negatives matter most.
  // "U.S.A." is three tokens and a flag-only comment is none, so neither reaches the keyword —
  // asserted rather than assumed, because the caption asks people to type "USA".
  for (const t of ["causa", "usability", "I listen to this", "unusual", "Susan", "usahh",
                   "U.S.A.", "🇺🇸", "", "   ", "beautiful"]) {
    eq(`does NOT match ${JSON.stringify(t)}`, matchComment(t)?.keyword ?? null, null)
  }
  ok("no whole-token false positive in ordinary praise",
    ["this is fire", "love this", "gorgeous place", "sending this to my husband"]
      .every((t) => matchComment(t) === null))
  // Documented precedence, asserted so a future reorder cannot change it silently.
  eq("a comment with BOTH resolves to LIST, by length", matchComment("USA send the list")?.keyword, "LIST")
  ok("…and USA is still reported as present", matchingKeywords("USA send the list").some((k) => k.keyword === "USA"))
}

console.log("\nTHE MILITARY DM — AND THE FOURTEEN THAT MUST NOT NOTICE:")
{
  ok("USA has its own message", dmBodyForKeyword("USA") !== APPROVED_DM_BODY)
  ok("…naming the offer the commenter responded to",
    /military/i.test(dmBodyForKeyword("USA")) && /San Antonio/.test(dmBodyForKeyword("USA")))
  ok("…and thanking them for their service", /service/i.test(dmBodyForKeyword("USA")))
  eq("case does not matter for the lookup", dmBodyForKeyword("usa"), dmBodyForKeyword("USA"))
  // THE regression that matters: every pre-existing keyword still gets the general body.
  for (const k of COMMENT_KEYWORDS.filter((x) => x.keyword !== "USA")) {
    eq(`${k.keyword} still gets the general approved body`, dmBodyForKeyword(k.keyword), APPROVED_DM_BODY)
  }
  eq("an unknown keyword falls back", dmBodyForKeyword("WHATEVER"), APPROVED_DM_BODY)
  eq("so do null and blank", [dmBodyForKeyword(null), dmBodyForKeyword("")], [APPROVED_DM_BODY, APPROVED_DM_BODY])
  eq("the override map holds exactly one entry", Object.keys(KEYWORD_DM_BODY), ["USA"])
  // The link stays a separate paragraph — never spliced into the sentence.
  const runner = strip(read("lib/social/commentRunner.ts"))
  ok("the runner appends the link as its own paragraph",
    /dmBodyForKeyword\(keyword\.keyword\)\}\\n\\n\$\{link\}/.test(runner))
  ok("…and no message text is built anywhere else in the runner",
    !/I got you!|Thank you for your service/.test(runner))
}

console.log("\nTHE FIVE HASHTAGS:")
{
  // The five the office researched, market by market — the exact strings, in the exact order.
  const EXPECTED: Record<string, string> = {
    "San Antonio": "#militarylife #relocation #militaryhousing #movingtosanantonio #sanantonioapartments",
    "Dallas": "#militarylife #relocation #militaryhousing #movingtodallas #dallasapartments",
    "Austin": "#militarylife #relocation #militaryhousing #movingtoaustin #austinapartments",
    "Houston": "#militarylife #relocation #militaryhousing #movingtohouston #houstonapartments",
    "Fort Worth": "#militarylife #relocation #militaryhousing #movingtofortworth #fortworthapartments",
    "DFW": "#militarylife #relocation #militaryhousing #movingtodallas #dallasapartments",
  }
  for (const [market, want] of Object.entries(EXPECTED)) {
    eq(`${market}`, (templateHashtags("military_special", market) ?? []).join(" "), want)
  }
  // Every market the product actually supports produces five, whether or not it was in the brief.
  for (const market of SOCIAL_MARKETS) {
    const t = templateHashtags("military_special", market) ?? []
    eq(`${market} produces exactly five`, t.length, 5)
    eq(`…with the three fixed ones first, unchanged`, t.slice(0, 3), [...MILITARY_SPECIAL_FIXED_HASHTAGS])
    eq(`…then the two city tags`, t.slice(3), [`#movingto${marketHashtagSlug(market)}`, `#${marketHashtagSlug(market)}apartments`])
  }
  // The spaces rule, stated as examples rather than trusted.
  eq("multiword cities lose their spaces", marketHashtagSlug("San Antonio"), "sanantonio")
  eq("…and their case", marketHashtagSlug("Fort Worth"), "fortworth")
  eq("…and any punctuation", marketHashtagSlug(" St. Louis "), "stlouis")
  // DFW is a metroplex, not a city: it maps to Dallas rather than inventing a DFW-specific pair.
  eq("DFW maps to the Dallas city tags", marketHashtagSlug("DFW"), "dallas")
  eq("…case-insensitively", marketHashtagSlug("dfw"), "dallas")
  eq("…and it is the ONLY override", (templateHashtags("military_special", "DFW") ?? []).join(" "),
    (templateHashtags("military_special", "Dallas") ?? []).join(" "))
  ok("no #movingtodfw or #dfwapartments is ever produced",
    SOCIAL_MARKETS.every((m) => !(templateHashtags("military_special", m) ?? []).some((t) => /dfw/i.test(t))))

  // CHANGING THE MARKET changes ONLY the last two.
  const a = templateHashtags("military_special", "San Antonio") ?? []
  const b = templateHashtags("military_special", "Houston") ?? []
  eq("a market change leaves the three fixed tags identical", a.slice(0, 3), b.slice(0, 3))
  ok("…and changes both city tags", a[3] !== b[3] && a[4] !== b[4])

  // A blank market never invents a city, and never emits a half tag.
  for (const blank of [null, undefined, "", "  "]) {
    const t = templateHashtags("military_special", blank as string) ?? []
    eq(`a blank market (${JSON.stringify(blank)}) yields the three fixed only`, t, [...MILITARY_SPECIAL_FIXED_HASHTAGS])
    ok("…with no empty city tag", !t.some((x) => x === "#movingto" || x === "#apartments"))
  }

  // NO OTHER TEMPLATE IS AFFECTED — structurally, by returning null.
  for (const t of OVERLAY_TEMPLATES.filter((x) => x !== "military_special")) {
    eq(`${t} dictates no hashtags`, templateHashtags(t, "San Antonio"), null)
    eq(`…so it still gets the ranked market bank`, hashtagsForPost(t, "San Antonio", "Apartment"),
      buildHashtags("San Antonio", MAX_HASHTAGS, "Apartment"))
  }
  eq("no template at all gets the bank too", hashtagsForPost(null, "Austin", "Loft"),
    buildHashtags("Austin", MAX_HASHTAGS, "Loft"))

  // The five-tag limit is the existing one, not a new one.
  eq("the limit is still 5", MAX_HASHTAGS, 5)
  ok("and the template can never exceed it",
    SOCIAL_MARKETS.every((m) => hashtagsForPost("military_special", m, "Apartment").length <= MAX_HASHTAGS))

  // The suggestion system must not be able to overwrite them: ONE resolver answers for both.
  eq("Instagram's generated set is the template's five",
    preparePost(src({ market: "Dallas" }), "seed", "military_special").hashtags.join(" "),
    EXPECTED["Dallas"])
  const editor = strip(read("components/crm/social/PostEditor.tsx"))
  ok("the editor generates hashtags ONLY through the shared resolver",
    !/buildHashtags\(/.test(editor) && /hashtagsForPost\(/.test(editor))
  ok("…including the Suggest button, so it cannot overwrite them",
    /suggestTags = \(\) => \{ setHashtags\(hashtagsForPost\(overlayTemplate/.test(editor))
  ok("…and the metadata sync uses the template being applied, not stale state",
    /if \(!hashtagsDirty\) setHashtags\(hashtagsForPost\(tpl,/.test(editor))

  // A market change must RE-SYNC, which means the stored five must read as generator-owned.
  ok("the five are generator-owned for any market, so a market change re-resolves them",
    [...SOCIAL_MARKETS, ""].every((stored) =>
      SOCIAL_MARKETS.every((now) =>
        isGeneratedHashtags(templateHashtags("military_special", stored) ?? [], src({ market: now }), "military_special"))))
  ok("…while a locator's own tags are still treated as manual and preserved",
    !isGeneratedHashtags(["#mytag", "#custom"], src(), "military_special"))
}

console.log("\nSELECTING THE TEMPLATE POPULATES THE VISIBLE HASHTAG FIELD:")
{
  // THE DEFECT THIS RELEASE FIXES. changeTemplate used to inline the headline and caption updates
  // and say nothing about hashtags, so picking Military Special in the dropdown changed the
  // caption and left the hashtag field showing the market bank's five. The editor and the
  // published caption disagreed, and the editor was the one that was wrong.
  const editor = strip(read("components/crm/social/PostEditor.tsx"))
  const body = (editor.split("const changeTemplate")[1] ?? "").split("\n  }")[0]
  ok("changeTemplate resolves every generated field through syncGenerated",
    /syncGenerated\(metaOf\(\), tpl\)/.test(body))
  ok("…and no longer sets the headline or caption itself",
    !/setHeadline\(/.test(body) && !/setCaption\(/.test(body))
  ok("…so there is exactly ONE place a generated field is resolved",
    (editor.match(/if \(!hashtagsDirty\) setHashtags\(/g) ?? []).length === 1
    && (editor.match(/if \(!captionDirty\) setCaption\(/g) ?? []).length === 1)
  ok("syncGenerated still resolves all three",
    /if \(!headlineDirty\) setHeadline\(/.test(editor)
    && /if \(!captionDirty\) setCaption\(/.test(editor)
    && /if \(!hashtagsDirty\) setHashtags\(hashtagsForPost\(tpl,/.test(editor))
  // The dropdown is the only way a locator changes the template, and it goes through it.
  ok("the dropdown calls changeTemplate",
    /onChange=\{\(e\) => changeTemplate\(e\.target\.value as OverlayTemplate\)\}/.test(editor))
  // A locator's own tags are still theirs: the dirty guard is inside syncGenerated, unchanged.
  ok("a manually edited set is still protected by the dirty guard",
    /setHashtagsDirty\(true\) \/\/ manual edit/.test(editor)
    && /if \(!hashtagsDirty\)/.test(editor))
}

console.log("\nBOTH PLATFORMS GET THE SAME FIVE, AND THE SPACING SURVIVES:")
{
  const market = "San Antonio"
  const want = "#militarylife #relocation #militaryhousing #movingtosanantonio #sanantonioapartments"
  const body = buildCaption(src({ market }), "seed", "military_special")

  // Instagram: real blank lines, hashtags appended as their own final paragraph.
  const ig = composeFinalCaption(body, hashtagsForPost("military_special", market, "Apartment"))
  ok("Instagram keeps the caption body byte-identical", ig.startsWith(body))
  ok("…with a blank line before the hashtags", ig.includes("budget.\n\n#militarylife"))
  eq("…and the five at the end", ig.slice(ig.indexOf("#militarylife")).trim(), want)
  ok("…nothing inserted mid-caption",
    ig.indexOf("#militarylife") > ig.indexOf('Comment "USA"'))
  eq("…and the four body paragraphs are intact", ig.split("\n\n").slice(0, 4).length, 4)

  // TikTok: the same five, through TikTok's own payload builder.
  const tk = buildTikTokCaptionPayload({
    caption: null, socialSpecial: null, sourceContentId: "seed",
    overlayTemplate: "military_special",
    source: { market, property_type: "Apartment", special: null, budget_range: null, amenities: null },
  })
  eq("TikTok sends the SAME five", tk.slice(tk.indexOf("#militarylife")).trim(), want)
  ok("TikTok keeps all four body paragraphs separated",
    ["Deploying to San Antonio? I got you 🇺🇸", "✅ $0 Security Deposit",
     "My apartment locating service is completely FREE!", 'Comment "USA"']
      .every((line) => tk.includes(line)))
  ok("…and the three specials are still consecutive, single-spaced",
    tk.includes("✅ $0 Security Deposit\n✅ $0 App and Admin Fees\n✅ 8 WEEKS FREE RENT! 🔥"))
  // TikTok's blank lines are the braille-blank the existing padder inserts — that is the shipped
  // format for TikTok, not a regression, and it is asserted so a change to it is visible here.
  ok("TikTok's section breaks use the existing padding mechanism", tk.includes("\n⠀\n"))
  ok("the hashtags are the LAST thing on both platforms",
    ig.trim().endsWith("#sanantonioapartments") && tk.trim().endsWith("#sanantonioapartments"))
}

console.log("\nWHAT THIS RELEASE DID NOT TOUCH:")
{
  const BASELINE = "bf0070f"
  const has = (() => {
    try { execSync(`git cat-file -e ${BASELINE}^{commit}`, { stdio: "ignore" }); return true } catch { return false }
  })()
  if (!has) {
    console.log(`  – skipped: ${BASELINE} is not in this clone`)
  } else {
    const lines = (cmd: string) =>
      execSync(cmd, { encoding: "utf8" }).trim().split("\n").map((l) => l.trim()).filter(Boolean)
    const changed = [...new Set([
      ...lines(`git diff --name-only ${BASELINE} -- . ':!next-env.d.ts'`),
      ...lines("git ls-files --others --exclude-standard"),
    ])].sort()
    const APPROVED = [
      "lib/social/composePost.ts",                  // registry, order, label, caption, overlay copy
      "lib/social/overlaySpec.ts",                  // the layout family
      "lib/social/commentKeywords.ts",              // USA + the per-keyword DM map
      "lib/social/commentRunner.ts",                // one line: the DM lookup
      "scripts/social/militarySpecial.test.ts",     // this file
      // SIX existing suites carry PER-RELEASE enumerations — registry counts, the approved keyword
      // set, display-adjacency runs, and the fixed-caption exclusion list. A 34th template and a
      // 15th keyword are exactly what they are built to notice, and every one of them did. Each
      // was restated to include the new entry with its ORIGINAL CLAIM intact:
      //   · composer / templates18to20 / presenterMode — counts 33→34 and 31→32.
      //   · commentKeywords — "no extras" still means exactly the approved list, now fifteen.
      //   · templates25to32 — its batch still owns indices 24-31; later releases only append.
      //   · povRegularShmegular — re-pinned to T33's OWN append position instead of "last", and
      //     to the Client / Me group being contiguous and LAST rather than directly after Roomie.
      //   · captionOpeners — military_special joins FIXED_CAPTION_TEMPLATES, which is the
      //     exclusion that suite exists to make explicit rather than assume.
      // Nothing was loosened to make any of them pass.
      "scripts/social/composer.test.ts",
      "scripts/social/templates25to32.test.ts",
      "scripts/social/commentKeywords.test.ts",
      "scripts/social/templates18to20.test.ts",
      "scripts/social/presenterMode.test.ts",
      "scripts/social/povRegularShmegular.test.ts",
      "scripts/social/captionOpeners.test.ts",
      // The frozen Instagram layout snapshot is keyed by template × surface and asserts it covers
      // EVERY template, so a new one must be recorded. The existing 66 entries are untouched —
      // Instagram stays byte-for-byte frozen — and the two new ones are asserted above to be the
      // family's shared geometry, not new values.
      "scripts/social/tiktokOverlayPosition.frozen.json",
      // The five researched hashtags. templateHashtags/hashtagsForPost live in the existing
      // hashtag module (no second system); loadedCopy and PostEditor thread the TEMPLATE into the
      // generated-vs-manual judgement, without which the five would read as a manual override and
      // a market change would never re-resolve the two city tags.
      "lib/social/hashtags.ts",
      "lib/social/loadedCopy.ts",
      "components/crm/social/PostEditor.tsx",
      // A seventh per-release guard. It asserted the editor still calls buildHashtags by name;
      // the editor now generates through hashtagsForPost, which calls buildHashtags itself. The
      // claim — generation is present, and the per-platform DISPLAY cap is not what sizes it —
      // is unchanged, and it gained an assertion that the resolver caps at MAX_HASHTAGS.
      "scripts/social/hashtagLimits.test.ts",
    ].sort()
    eq(`exactly the ${APPROVED.length} approved files changed`, changed, APPROVED)
    ok("no migration is part of this release", !changed.some((f) => f.startsWith("supabase/")))

    for (const [label, re] of [
      ["the archived pricing-299 WIP's social files",
        /SocialAutopilotClient|QueueClient|PropertySearchField|propertySuggestions|displayName|property-catalog-search/],
      ["Quick Match", /lib\/quickMatch\//],
      ["the CRM workspace", /components\/crm\/(?!social\/)/],
      ["Unleash Beast and the map", /unleash|propertyExplorer|mapExplorer/i],
      ["the client-facing pages", /app\/r\/|app\/share|app\/\(site\)/],
      ["publishing, rendering and scheduling", /autoPosting|autopilotPlan|renderVideo|generateRecurrence/],
      ["the comment send policy, safety gates and rate limits",
        /commentSafety|commentSendPolicy|commentRateLimit|commentScope|commentSender\.ts|commentStore/],
      ["the Instagram webhook and the poller", /webhooks\/instagram|social-comment-poll/],
    ] as const) {
      ok(`${label} is untouched`, !changed.some((f) => re.test(f)))
    }

    // composePost and commentKeywords are shared with every other template and keyword, so the
    // diff must ADD. The only removals allowed are the lines this release deliberately replaced:
    // commentCta's signature and body, the registry's closing line, and the runner's DM line.
    // Each allowance is a count of lines this release REPLACES, named so the number is reviewable
    // rather than a ratchet. composePost's nine: the hashtags import (widened), commentCta's doc
    // line + signature + body (the keyword override), preparePost's hashtag line, the registry's
    // closing line (the append), isGeneratedHashtags' signature (the template parameter), and the
    // TikTok hashtag comment + line. The structural checks below are what actually prove nothing
    // was DELETED.
    for (const [f, allowed] of [
      ["lib/social/composePost.ts", 9],
      ["lib/social/commentKeywords.ts", 1],
      ["lib/social/commentRunner.ts", 2],
      ["lib/social/overlaySpec.ts", 1],
      ["lib/social/hashtags.ts", 1],       // the doc line above normalizeHashtag
      ["lib/social/loadedCopy.ts", 1],     // the hashtagsDirty line, now template-aware
      // Seven: the hashtags import and the three generate sites, plus the three lines
      // changeTemplate duplicated from syncGenerated — which were the defect itself.
      ["components/crm/social/PostEditor.tsx", 7],
    ] as const) {
      const removed = lines(`git diff --unified=0 ${BASELINE} -- ${f}`)
        .filter((l) => l.startsWith("-") && !l.startsWith("---"))
      ok(`${f} removes at most the ${allowed} line(s) it replaces`, removed.length <= allowed)
    }

    // Stronger than reading the diff: take every id and keyword the BASELINE declared and assert
    // it is still declared now. A replaced closing line cannot hide a deletion from this.
    // Comment lines inside the block quote ids too (explaining why one was appended), so they are
    // stripped first — otherwise a mentioned id counts twice.
    const codeOnly = (src: string) => src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
    const baselineIds = codeOnly((execSync(`git show ${BASELINE}:lib/social/composePost.ts`, { encoding: "utf8" })
      .split("export const OVERLAY_TEMPLATES = [")[1] ?? "").split("] as const")[0])
    const ids = [...baselineIds.matchAll(/"([a-z_0-9]+)"/g)].map((m) => m[1])
    eq("the baseline declared 33 template ids", ids.length, 33)
    ok("…and every one of them is still registered, at the same index",
      ids.every((id, i) => OVERLAY_TEMPLATES[i] === id))

    const baselineKw = codeOnly((execSync(`git show ${BASELINE}:lib/social/commentKeywords.ts`, { encoding: "utf8" })
      .split("export const COMMENT_KEYWORDS")[1] ?? "").split("] as const")[0])
    const kws = [...baselineKw.matchAll(/keyword: "([A-Z ]+)"/g)].map((m) => m[1])
    eq("the baseline declared 14 keywords", kws.length, 14)
    ok("…and every one of them is still declared, with its property type",
      kws.every((k) => COMMENT_KEYWORDS.some((x) => x.keyword === k)))
  }
}

console.log(`\nMilitary Special: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
