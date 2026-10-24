/**
 * PROMOTIONAL BADGES — the shared resolver, and the one-row rule on every surface.
 *
 *   npx tsx scripts/leads/promoBadges.test.ts
 *
 * Four surfaces render these pills. The point of the resolver is that none of them decides what
 * to show, so the assertions below are mostly about things that must be IMPOSSIBLE: a stale
 * offer reaching a client, a gift card appearing twice, an agent bonus appearing at all, and a
 * second row of badges on a narrow screen.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { resolvePromoBadges, truncateBadgeLabel, normalizeShortSpecial } from "@bc/companion-shared"

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"))

const fresh = new Date(Date.now() - 3 * 86_400_000).toISOString()
const stale = new Date(Date.now() - 90 * 86_400_000).toISOString()
const SPECIAL = "Up to 8 Weeks Free on Select Homes"

// ── 1. THE TWO INCENTIVES, AND THEIR TWO CLOCKS ───────────────────────────────────────────────
console.log("both incentives show, special first:")
{
  const b = resolvePromoBadges({ currentSpecial: SPECIAL, specialCheckedAt: fresh, giftCardStatus: "yes", giftCardAmount: 500, giftCardCheckedAt: fresh })
  ok("two badges", b.length === 2, JSON.stringify(b))
  ok("…special first", b[0].kind === "special" && /8 Weeks Free/.test(b[0].text))
  ok("…gift card second", b[1].kind === "gift_card" && b[1].text === "$500 Gift Card")
}
console.log("\neach is judged by its OWN verification date:")
// NOTHING EXPIRES ON A TIMER. Both incentives show until an agent changes them.
ok("an ancient special still shows", resolvePromoBadges({ currentSpecial: SPECIAL }).length === 1)
ok("an ancient gift card still shows too",
  resolvePromoBadges({ giftCardStatus: "yes", giftCardAmount: 500 }).length === 1)
ok("the resolver accepts no date at all", (() => {
  const src = read("packages/companion-shared/src/specials.ts")
  const t = src.slice(src.indexOf("export type PromoBadgeInput"), src.indexOf("export function resolvePromoBadges"))
  return !/CheckedAt|verifiedAt|maxAgeDays|Freshness/.test(t)
})())
ok("the special falls back to the record's verified_at (master-import rows)",
  resolvePromoBadges({ currentSpecial: SPECIAL, specialCheckedAt: null, verifiedAt: fresh }).length === 1)

console.log("\nunknown and confirmed-absent both render nothing:")
for (const [label, status] of [["unknown (null)", null], ["confirmed none", "no"]] as const) {
  ok(`gift card ${label} → no badge`,
    resolvePromoBadges({ giftCardStatus: status, giftCardAmount: 500, giftCardCheckedAt: fresh })
      .every((x) => x.kind !== "gift_card"))
}
ok("a 'yes' with no amount renders nothing", resolvePromoBadges({ giftCardStatus: "yes", giftCardAmount: null, giftCardCheckedAt: fresh }).length === 0)
ok("a 'yes' with $0 renders nothing", resolvePromoBadges({ giftCardStatus: "yes", giftCardAmount: 0, giftCardCheckedAt: fresh }).length === 0)
ok("nothing at all → no badges", resolvePromoBadges({}).length === 0)
ok("only a special → exactly one badge", resolvePromoBadges({ currentSpecial: SPECIAL, specialCheckedAt: fresh }).length === 1)
ok("only a gift card → exactly one badge",
  resolvePromoBadges({ giftCardStatus: "yes", giftCardAmount: 250, giftCardCheckedAt: fresh }).length === 1)

// ── 2. DE-DUPLICATION ─────────────────────────────────────────────────────────────────────────
// normalizeShortSpecial extracts "$500 Gift Card" from free text, which is the whole reason this
// can go wrong.
console.log("\na gift card in the special TEXT never doubles up:")
ok("the extraction really happens (otherwise this section proves nothing)",
  /gift card/i.test(String(normalizeShortSpecial("$500 gift card at signing"))))
{
  const b = resolvePromoBadges({ currentSpecial: "$500 gift card at signing", specialCheckedAt: fresh, giftCardStatus: "yes", giftCardAmount: 500, giftCardCheckedAt: fresh })
  ok("text + structured → ONE badge", b.length === 1, JSON.stringify(b))
  ok("…and it is the structured one", b[0].kind === "gift_card" && b[0].text === "$500 Gift Card")
}
{
  const b = resolvePromoBadges({ currentSpecial: "$750 gift card at signing", specialCheckedAt: fresh })
  ok("text alone still shows, as a GIFT CARD badge", b.length === 1 && b[0].kind === "gift_card")
  ok("…with the gift icon's kind, not the special's", b[0].kind !== "special")
}
{
  const b = resolvePromoBadges({ currentSpecial: SPECIAL, specialCheckedAt: fresh, giftCardStatus: "yes", giftCardAmount: 500, giftCardCheckedAt: fresh })
  ok("a CONCESSION and a gift card are never treated as duplicates", b.length === 2)
}

// ── 3. THE AGENT BONUS IS NOT AN INPUT ────────────────────────────────────────────────────────
console.log("\nthe agent bonus cannot reach a card through this:")
{
  const SRC = read("packages/companion-shared/src/specials.ts")
  const fn = SRC.slice(SRC.indexOf("export function resolvePromoBadges"))
  ok("resolvePromoBadges never reads a bonus", !/bonus/i.test(fn.slice(0, 2500)))
  ok("…and its input type has no field for one",
    !/bonus/i.test(SRC.slice(SRC.indexOf("export type PromoBadgeInput"), SRC.indexOf("export type PromoBadgeInput") + 900)))
  // Passing one anyway must be inert.
  const b = resolvePromoBadges({ bonusFlat: "300", giftCardStatus: null, currentSpecial: null } as never)
  ok("passing a bonus through produces nothing", b.length === 0)
}

// ── 4. LONG LABELS AND LARGE AMOUNTS ──────────────────────────────────────────────────────────
console.log("\nlong specials and large amounts stay on one row:")
ok("a large amount is comma-formatted",
  resolvePromoBadges({ giftCardStatus: "yes", giftCardAmount: 1500, giftCardCheckedAt: fresh })[0].text === "$1,500 Gift Card")
ok("a very large amount too",
  resolvePromoBadges({ giftCardStatus: "yes", giftCardAmount: 12500, giftCardCheckedAt: fresh })[0].text === "$12,500 Gift Card")
{
  // Two badges at once, each capped — the pair must stay shorter than one uncapped label.
  const b = resolvePromoBadges({ currentSpecial: "Up to 12 Weeks Free on Select Homes", specialCheckedAt: fresh, giftCardStatus: "yes", giftCardAmount: 12500, giftCardCheckedAt: fresh })
  const capped = b.map((x) => truncateBadgeLabel(x.text, 16))
  ok(`both labels fit a 16-char cap (${capped.join(" | ")})`, capped.every((t) => t.length <= 16))
  ok("…and neither is empty", capped.every((t) => t.replace("…", "").trim().length > 0))
}
console.log("\ntruncation never strengthens a claim:")
ok("'Up to' survives truncation", truncateBadgeLabel("Up to 12 Weeks Free", 12).startsWith("Up to"))
ok("…so a ceiling never becomes a guarantee", !/^12 Weeks Free/.test(truncateBadgeLabel("Up to 12 Weeks Free", 12)))
ok("a short label is returned untouched", truncateBadgeLabel("8 Weeks Free", 22) === "8 Weeks Free")
ok("truncation only ever shortens", truncateBadgeLabel("Up to 12 Weeks Free on Select Homes", 16).length <= 16)
ok("an exact-length label is not truncated", truncateBadgeLabel("123456", 6) === "123456")

// ── 5. ONE ROW, ON EVERY SURFACE ──────────────────────────────────────────────────────────────
console.log("\nevery surface renders ONE row that cannot wrap:")
{
  const BADGES = read("components/crm/PromoBadges.tsx")
  ok("the shared component is flex-nowrap", /flex flex-nowrap/.test(BADGES))
  ok("…each pill can shrink (min-w-0)", /inline-flex min-w-0/.test(BADGES))
  ok("…the label truncates rather than widening the row", /className="truncate"/.test(BADGES))
  ok("…and the icon never shrinks", /flex-none/.test(BADGES))
  // Fitting is CSS, not a character count — the cap is only a backstop for an absurd string.
  // A fixed per-count cap truncated labels on wide cards where they fit comfortably.
  ok("the pills shrink to the container rather than to a guessed character count",
    /shrink items-center/.test(BADGES) && /const cap = maxChars \?\? 28/.test(BADGES))
  ok("…and the row still cannot wrap while they shrink", /flex flex-nowrap/.test(BADGES))
  ok("the special tone is green", /special: "border-\[#8fcaa6\] bg-\[#e4f4ea\] text-\[#16633a\]"/.test(BADGES))
  ok("the gift card keeps the familiar blue", /gift_card: "border-\[#8fb6ea\] bg-\[#e8f0fe\] text-\[#1c3f75\]"/.test(BADGES))
}
{
  const MAP = read("components/crm/explorer/BeastPropertyExplorer.tsx")
  ok("map: badges render through the shared component", /<PromoBadges/.test(MAP))
  ok("map: the row is bounded left AND right, so it cannot leave the photo",
    /absolute bottom-2 left-2 right-2/.test(MAP))
  ok("map: the old single-pill markup is gone", !/\{shortSpecial\}\s*<\/span>/.test(MAP))
  ok("map: passes no dates — nothing expires on a timer", !/specialCheckedAt=|giftCardCheckedAt=/.test(MAP))
  ok("map: the old gated shortSpecial derivation is gone", !/isSpecialCurrent/.test(MAP))
  ok("map: the ✕ corner is untouched (badges are bottom-left)", !/top-2 left-2 z-\[1\][\s\S]{0,80}PromoBadges/.test(MAP))
}
for (const [name, file, row] of [
  ["Recommended", "components/crm/BestMatches.tsx", "promo"],
  ["Favorites", "components/crm/LeadFavorites.tsx", "favPromo"],
] as const) {
  const SRC = read(file)
  ok(`${name}: renders through the shared component`, /<PromoBadges/.test(SRC))
  ok(`${name}: the row guard uses the RESOLVER's output, not a stale derived flag`,
    new RegExp(`${row}\\.length > 0`).test(SRC))
  ok(`${name}: …so a gift-card-only property does not render an empty row`,
    new RegExp(`const ${row} = resolvePromoBadges\\(`).test(SRC))
  ok(`${name}: the old blue single pill is gone`, !/bg-\[#e8f0fe\] px-1 py-\[1px\] text-\[9px\]/.test(SRC))
}
{
  const CLIENT = read("app/locator-beast/r/[token]/RecommendationList.tsx")
  const MIG_ALL = readFileSync(join(process.cwd(), "supabase/migrations/20261106000000_property_gift_card.sql"), "utf8")
  const MIG_CLIENT = MIG_ALL.slice(MIG_ALL.indexOf("lb_resolve_client_recommendations"))
  const CSS = read("app/locator-beast/r/[token]/page.tsx")
  ok("client page: uses the SAME resolver as the internal cards", /resolvePromoBadges\(\{/.test(CLIENT))
  // NO manufactured date, and no age rule.
  ok("client page: reads no special date at all", !/currentSpecialCheckedAt/.test(CLIENT))
  ok("client page: and none is sent by the resolver", !/'currentSpecialCheckedAt'/.test(MIG_CLIENT))
  ok("client page: the gift card needs no date to render", !/giftCardCheckedAt/.test(CLIENT))
  ok("client page: one row, no wrap", /\.lbr-promo\{[^}]*flex-wrap:nowrap/.test(CSS))
  ok("client page: the row is bounded left and right", /\.lbr-promo\{[^}]*left:12px;right:12px/.test(CSS))
  ok("client page: labels ellipsis rather than wrap", /\.lbr-pill-label\{[^}]*text-overflow:ellipsis/.test(CSS))
  ok("client page: the special pill is green", /\.lbr-pill-special\{[^}]*#e4f4ea/.test(CSS))
  ok("client page: never receives the agent bonus", !/bonus/i.test(CLIENT))
}

// ── 6. THE READ PATH CARRIES THE NEW FIELDS ───────────────────────────────────────────────────
console.log("\nthe data actually reaches the cards:")
{
  const MIG = readFileSync(join(process.cwd(), "supabase/migrations/20261106000000_property_gift_card.sql"), "utf8")
  const MIG_CLIENT = MIG.slice(MIG.indexOf("lb_resolve_client_recommendations"))
  ok("the catalog RPC returns the three columns",
    /gift_card_status           text/.test(MIG) && /c\.gift_card_status, c\.gift_card_amount, c\.gift_card_checked_at/.test(MIG))
  ok("…and keeps every column it already returned", /c\.pricing_last_verified, c\.current_special_checked_at/.test(MIG))
  ok("the client resolver carries the gift card", /'giftCardStatus', pc\.gift_card_status/.test(MIG))
  // NO DATE IS INVENTED. A share's created_at is when the LIST was built and verified_at is when
  // the ROW was touched; neither is anyone confirming the offer.
  ok("the resolver invents no date for a snapshot special", !/'currentSpecialCheckedAt'/.test(MIG))
  ok("…and never reads the share's created_at as a verification", !/then i\.created_at\b/.test(MIG))
  ok("…and never reads least() over unrelated timestamps", !/least\(i\.created_at/.test(MIG))
  ok("the 45-day window is gone from the client resolver too",
    !/45 days/.test(MIG.replace(/--[^\n]*/g, "")))
  // Comments stripped first: this file's own note SAYS "bonus_flat is not exposed here", and a
  // raw scan reads that sentence as an exposure.
  {
    const executable = MIG.replace(/--[^\n]*/g, "")
    const clientFn = executable.slice(executable.indexOf("lb_resolve_client_recommendations"))
    ok("the client resolver never exposes bonus_flat", !/bonus/i.test(clientFn),
      clientFn.split("\n").filter((l) => /bonus/i.test(l)).join(" | "))
    ok("…and the stripper works (the comment really does mention it)", /bonus_flat/.test(MIG))
  }
  const CAT = read("lib/propertyExplorer/catalog.ts")
  ok("the catalog reader maps them", /giftCardStatus: s\(r\.gift_card_status\)/.test(CAT))
  ok("…and enrichProperties carries them to the map card", /giftCardStatus: c\.giftCardStatus/.test(CAT))
  ok("…and attachCatalogRatings to the CRM rows", /gift_card_status: rec\?\.giftCardStatus/.test(CAT))
}

console.log(`\nPromotional badges: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
