/**
 * MAP EXPLORER — the property preview stops flickering between closely spaced pins.
 *
 * 9268088 (2026-10-08) added four protections and they are all still here: a guarded
 * mouseleave, an ~80ms deferred clear, enter-cancels-the-pending-clear, and clicked
 * selection outranking hover. They were correct. They were also fed the wrong input, and
 * two separate defects were measured in a browser harness running the real Maps API with
 * real PinElement / AdvancedMarkerElement nodes:
 *
 *   1. DEAD BAND. The listeners were bound to `pin.element` (<gmp-pin>), which Google
 *      renders `pointer-events: none` — so only events bubbling up from the painted
 *      teardrop SVG ever reached them. The marker's own wrapper <gmp-advanced-marker> IS
 *      `pointer-events: auto` over its whole 26x38 box and paints ABOVE its neighbour, so
 *      between two pins 14px apart there was a band — 1px at the heads, 13px at the tips —
 *      where NEITHER pin was hovered. `mouseleave` A and `mouseenter` B were therefore not
 *      adjacent, and crossing the band took longer than 80ms at any speed below ~150px/s.
 *      The card closed and reopened: the flicker. Binding to the marker makes each hover
 *      area the full box; adjacent boxes restore the direct handoff.
 *
 *   2. THE CARD STEALS THE HOVER. The preview is pointer-events-auto at a fixed bottom-left
 *      position, so a pin underneath it loses the pointer to the card the moment the card
 *      opens. Measured with ONE pin and a stationary pointer: 13 open/close cycles in
 *      1200ms. Treating the card as part of the hover region ends it.
 *
 * The geometry below is MEASURED, not invented — getBoundingClientRect and
 * document.elementFromPoint against real markers, two pins 14px apart at zoom 16.
 *
 * Run: npx tsx scripts/tests/mapHoverFlicker.test.ts
 */
import { readFileSync } from "node:fs"

let pass = 0
let fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) {
    pass++
    console.log(`  ✓ ${l}`)
  } else {
    fail++
    console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`)
  }
}

/** The comments quote the OLD bindings, so assertions must run against code. */
const strip = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n")

const PATH = "components/crm/explorer/BeastPropertyExplorer.tsx"
// NOTE: this file contains a stray NUL byte, which makes plain `grep` treat it as binary and
// silently report NO matches. readFileSync is unaffected; `grep -a` is needed at the shell.
const rawSrc = readFileSync(PATH, "utf8")
const src = strip(rawSrc)

console.log("\nMAP EXPLORER — PIN HOVER FLICKER\n")

// ── 1. Cause 1, as behaviour: the dead band ───────────────────────────────────────────────────
console.log("cause 1 — crossing between two adjacent pins")

type Hit = "A" | "B" | "map" | "CARD"

/** MEASURED hit-test, listeners on <gmp-pin> (teardrop only), y = pin tip. */
const hitOld = (x: number): Hit =>
  x >= 179 && x <= 180 ? "A" : x >= 193 && x <= 195 ? "B" : "map"
/** MEASURED hit-test, listeners on <gmp-advanced-marker> (full box). */
const hitNew = (x: number): Hit => (x >= 167 && x <= 180 ? "A" : x >= 181 && x <= 206 ? "B" : "map")

ok("the old binding left a 12px band where neither pin was hovered", (() => {
  let band = 0
  for (let x = 181; x <= 192; x++) if (hitOld(x) === "map") band++
  return band === 12
})())
ok("the new binding leaves NO gap between the two hover areas", (() => {
  for (let x = 167; x <= 206; x++) if (hitNew(x) === "map") return false
  return hitNew(180) === "A" && hitNew(181) === "B"
})())

const HOVER_CLEAR_MS = 80

/**
 * The panel's hover machinery, ported: immediate enter that cancels the pending clear, a
 * deferred clear guarded by placeId, the card as `selected ?? hovered`, and (when wired) the
 * card's own enter/leave. Driven by a virtual clock so the test is instant and deterministic.
 */
function simulate(
  hit: (x: number) => Hit,
  path: { x: number; dtMs: number }[],
  opts: { cardHoverHandlers: boolean; cardCoversPins?: boolean } = { cardHoverHandlers: false },
) {
  let now = 0
  let timer: { due: number; fn: () => void } | null = null
  let hovered: string | null = null
  const selected: string | null = null
  let lastCard: string | null = null
  let opens = 0
  let closes = 0
  let switches = 0

  const settle = () => {
    const card = selected ?? hovered
    if (card === lastCard) return
    if (lastCard === null && card !== null) opens++
    else if (card === null) closes++
    else switches++
    lastCard = card
  }
  const cancel = () => {
    timer = null
  }
  const armGuarded = (id: string) => {
    timer = {
      due: now + HOVER_CLEAR_MS,
      fn: () => {
        if (hovered === id) hovered = null
      },
    }
  }
  const armUnconditional = () => {
    timer = { due: now + HOVER_CLEAR_MS, fn: () => (hovered = null) }
  }
  const tickTo = (t: number) => {
    while (timer && timer.due <= t) {
      now = timer.due
      const f = timer.fn
      timer = null
      f()
      settle()
    }
    now = t
  }

  // What the pointer is actually over: the card, once open, covers the pins in its corner.
  const effective = (x: number): Hit =>
    opts.cardCoversPins && lastCard !== null && hit(x) !== "map" ? "CARD" : hit(x)

  let prev: Hit | null = null
  for (const step of path) {
    const target = effective(step.x)
    if (target !== prev) {
      if (prev === "A" || prev === "B") armGuarded(prev)
      else if (prev === "CARD" && opts.cardHoverHandlers) armUnconditional()
      if (target === "A" || target === "B") {
        cancel()
        hovered = target
      } else if (target === "CARD" && opts.cardHoverHandlers) cancel()
      settle()
      prev = target
    }
    tickTo(now + step.dtMs)
  }
  tickTo(now + 500)
  return { opens, closes, switches, hovered }
}

/** A straight crossing from pin A to pin B at a given pointer speed. */
const crossing = (pxPerSec: number) => {
  const out: { x: number; dtMs: number }[] = []
  for (let x = 160; x <= 215; x++) out.push({ x, dtMs: 1000 / pxPerSec })
  return out
}

for (const speed of [20, 40, 60, 100, 140]) {
  const before = simulate(hitOld, crossing(speed), { cardHoverHandlers: false })
  ok(
    `at ${speed}px/s the OLD binding tore the card down and rebuilt it`,
    before.closes >= 1 && before.opens >= 2,
    JSON.stringify(before),
  )
  const after = simulate(hitNew, crossing(speed), { cardHoverHandlers: true })
  ok(
    `at ${speed}px/s the NEW binding hands A to B with no close`,
    after.opens === 1 && after.closes === 1 && after.switches === 1,
    JSON.stringify(after),
  )
}
ok(
  "a fast crossing never broke, which is why this went unnoticed in testing",
  simulate(hitOld, crossing(300), { cardHoverHandlers: false }).switches === 1,
)

// ── 2. Cause 2, as behaviour: the card over a pin ─────────────────────────────────────────────
console.log("\ncause 2 — a pin underneath the preview card, pointer stationary")

/** The pointer does not move; only the card mounting and unmounting re-targets it. */
const stationary = Array.from({ length: 240 }, () => ({ x: 180, dtMs: 5 }))

const stuckBefore = simulate(hitNew, stationary, { cardHoverHandlers: false, cardCoversPins: true })
ok("without the card handlers the preview cycles open/closed", stuckBefore.opens > 3, JSON.stringify(stuckBefore))
const stuckAfter = simulate(hitNew, stationary, { cardHoverHandlers: true, cardCoversPins: true })
ok("with them the preview opens once and stays", stuckAfter.opens === 1 && stuckAfter.closes === 0, JSON.stringify(stuckAfter))
ok("…and it is still showing the pin that opened it", stuckAfter.hovered === "A")

console.log("\n…and it still closes when the pointer leaves BOTH the pin and the card")
const leaveBoth = [
  ...Array.from({ length: 20 }, () => ({ x: 180, dtMs: 5 })),
  ...Array.from({ length: 60 }, (_, i) => ({ x: 400 + i, dtMs: 5 })),
]
const closed = simulate(hitNew, leaveBoth, { cardHoverHandlers: true, cardCoversPins: true })
ok("the card closes", closed.closes === 1 && closed.hovered === null, JSON.stringify(closed))

// ── 3. The source carries both corrections ────────────────────────────────────────────────────
console.log("\nthe two approved changes are in the source")
ok("mouseenter is bound to the marker", /marker\.addEventListener\("mouseenter"/.test(src))
ok("mouseleave is bound to the marker", /marker\.addEventListener\("mouseleave"/.test(src))
ok(
  "NO hover listener is bound to the pin content element any more",
  !/\bel\.addEventListener\(/.test(src),
  "el.addEventListener still present",
)
ok("the card holds the hover on enter", /onMouseEnter=\{holdHoverCard\}/.test(src))
ok("the card releases it on leave", /onMouseLeave=\{releaseHoverCard\}/.test(src))
ok("holdHoverCard only cancels — it never changes which property is shown", (() => {
  const m = src.match(/const holdHoverCard = useCallback\(\(\) => \{([\s\S]*?)\}, \[\]\)/)
  return !!m && /clearTimeout/.test(m[1]) && !/setHovered/.test(m[1])
})())
ok("releaseHoverCard arms the SAME deferred clear, at HOVER_CLEAR_MS", (() => {
  const m = src.match(/const releaseHoverCard = useCallback\(\(\) => \{([\s\S]*?)\}, \[\]\)/)
  return !!m && /setTimeout\(/.test(m[1]) && /setHovered\(null\)/.test(m[1]) && /HOVER_CLEAR_MS/.test(m[1])
})())

// ── 4. The four original protections are untouched ────────────────────────────────────────────
console.log("\nthe four protections from 9268088 are intact")
ok("1. the deferred clear is still guarded by placeId", /setHovered\(\(cur\) => \(cur\?\.placeId === p\.placeId \? null : cur\)\)/.test(src))
ok("2. the delay is still 80ms", /const HOVER_CLEAR_MS = 80/.test(src))
ok("3. enter still cancels the pending clear", /mouseenter"[\s\S]{0,160}?clearTimeout\(hoverClearRef\.current\)[\s\S]{0,80}?setHovered\(p\)/.test(src))
ok("4. a clicked property still outranks hover", /const card = selected \?\? hovered/.test(src))
ok("the click handler is unchanged — selects and publishes the property", /marker\.addListener\("click", \(\) => \{\s*setSelected\(p\)\s*onSelectProperty\?\.\(p\)/.test(src))
ok("the unmount and marker-rebuild cancellations are still there", (src.match(/clearTimeout\(hoverClearRef\.current\); hoverClearRef\.current = null/g) ?? []).length >= 3)

// ── 5. Nothing cosmetic moved ─────────────────────────────────────────────────────────────────
console.log("\nno styling, appearance, z-index or layout change rode along")
ok("zIndex is still suggested=2 / plain=1", /zIndex: isSuggested \? 2 : 1/.test(src))
ok("the pin is still Google's default PinElement, built with no options", /const pin = new PinCtor\(\)/.test(src))
ok("the only style on the pin content is still the pointer cursor", /el\.style\.cursor = "pointer"/.test(src) && !/el\.style\.(?!cursor|opacity)/.test(src))
ok(
  "the card's classes are byte-for-byte the same",
  src.includes('className="pointer-events-auto absolute bottom-12 left-4 w-[330px] rounded-xl bg-white p-4 shadow-xl ring-1 ring-black/10"'),
)
ok("the opacity helpers still drive the Unleash Beast animation through marker.content", /const el = m\.content as HTMLElement \| null/.test(src))
ok("no clustering was introduced", !/Clusterer|MarkerCluster|clusterer/i.test(src))

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
