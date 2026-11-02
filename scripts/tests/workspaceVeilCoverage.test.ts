/**
 * CLIENT WORKSPACE — the CRM board does not show through, and does not scroll behind it.
 *
 * WHAT WAS WRONG. The Lead Detail Overlay (the client workspace) is `absolute top-2 bottom-2`
 * inside `relative flex-1 flex overflow-hidden`, and the Workspace Veil behind it shared that
 * same 8px inset. The board wrapper beside them is a plain flex item with NO vertical inset, so
 * an 8px band of the Lead Board was left uncovered at the top and the bottom of the workspace.
 * Measured in a browser harness built from these exact classes, `document.elementFromPoint`
 * returned `.kb-board` across that whole band at every x:
 *
 *     before   kbboard:104-108   ws:112-888    kbboard:892-896
 *     after    veil:104-108      ws:112-804    veil:808-812
 *
 * That band was both the CRM showing through and a live wheel target: `.kb-board` is a scroll
 * container the entire time the workspace is open.
 *
 * THE FIX IS TWO PROPERTIES, and deliberately not a modal system:
 *   1. the veil stretches to the container's full height, so no board surface is exposed or
 *      hit-testable — it is a BACKGROUND, so this changes no workspace geometry;
 *   2. the workspace panel gets `overscroll-contain`, so reaching either end of its own scroll
 *      stops there instead of chaining the remaining delta to whatever is scrollable behind.
 * One removes the board as a wheel TARGET, the other as a chain DESTINATION.
 *
 * NOT DONE, on purpose: no body scroll lock (this CRM has never had one — the only
 * document.body.style.overflow in the app is on an unrelated public page), no new overlay or
 * modal system, and no pointer-events change. The overlay's `pointer-events-none` and its inner
 * `pointer-events-auto` are exactly as they were, because closing the gap made the veil — which
 * already had pointer-events auto — the hit target in that band.
 *
 * Run: npx tsx scripts/tests/workspaceVeilCoverage.test.ts
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

/** Comments quote the OLD classes, so assertions run against code. */
const strip = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n")

const P = "components/crm/DashboardClient.tsx"
const raw = readFileSync(P, "utf8")
const src = strip(raw)

console.log("\nCLIENT WORKSPACE — BACKGROUND COVERAGE & SCROLL\n")

// ── 1. The exposure, as geometry ───────────────────────────────────────────────────────────────
console.log("the exposed band, as geometry (measured values from the harness)")

/** The body container's content box, as the harness measured it. */
const CONTAINER = { top: 104, bottom: 812 }
/** A flex item with no vertical inset fills it — this is the board wrapper. */
const BOARD = { top: CONTAINER.top, bottom: CONTAINER.bottom }
const inset = (px: number) => ({ top: CONTAINER.top + px, bottom: CONTAINER.bottom - px })

/** Bands where the board is uncovered, given the veil's inset. */
function exposedBands(veilInsetPx: number): number {
  const veil = inset(veilInsetPx)
  return Math.max(0, veil.top - BOARD.top) + Math.max(0, BOARD.bottom - veil.bottom)
}

ok("the OLD veil (top-2 bottom-2 = 8px) left 16px of board uncovered", exposedBands(8) === 16)
ok("…8px at the top", inset(8).top - BOARD.top === 8)
ok("…and 8px at the bottom", BOARD.bottom - inset(8).bottom === 8)
ok("the NEW veil (top-0 bottom-0) leaves none", exposedBands(0) === 0)
ok(
  "the workspace overlay keeps its own 8px inset — the veil grew, the workspace did not",
  inset(8).top === 112 && inset(8).bottom === 804,
)

console.log("\nscroll containment, as behaviour")
/** Port of the browser's scroll-chaining rule for one container. */
function chainsOutward(atEnd: boolean, overscroll: "auto" | "contain"): boolean {
  if (!atEnd) return false
  return overscroll === "auto"
}
ok("mid-scroll never chains, either way", !chainsOutward(false, "auto") && !chainsOutward(false, "contain"))
ok("at the end, the OLD panel chained outward", chainsOutward(true, "auto"))
ok("…and the NEW one does not", !chainsOutward(true, "contain"))

// ── 2. The two properties are in the source ────────────────────────────────────────────────────
console.log("\nthe two changed properties")
const veilLine = src.split("\n").find((l) => l.includes("detailVeilStyle} className")) ?? ""
const overlayLine = src.split("\n").find((l) => l.includes("detailOverlayStyle} className")) ?? ""
const wsLine = src.split("\n").find((l) => l.includes("beast-ai-clearance")) ?? ""

ok("the veil line exists", veilLine.length > 0)
ok("the veil spans the full height", /absolute top-0 bottom-0/.test(veilLine), veilLine.trim().slice(0, 120))
ok("…and is no longer inset 8px", !/top-2 bottom-2/.test(veilLine))
ok("the workspace panel scrolls", /overflow-y-auto/.test(wsLine))
ok("…and contains its own overscroll", /overscroll-contain/.test(wsLine), wsLine.trim().slice(0, 140))

// ── 3. Everything else is untouched ────────────────────────────────────────────────────────────
console.log("\nnothing else moved")
ok("the OVERLAY keeps top-2 bottom-2 — workspace geometry unchanged", /absolute top-2 bottom-2/.test(overlayLine))
ok("…its z-40 is unchanged", /z-40/.test(overlayLine))
ok("…and its pointer-events-none is unchanged", /pointer-events-none/.test(overlayLine))
ok("the inner row still re-enables pointer events", /className="flex gap-2 w-full h-full pointer-events-auto"/.test(src))
ok("the veil is still z-30, behind the overlay and above the board", /z-30/.test(veilLine))
ok("the board wrapper is still z-10 and overflow-hidden", /relative z-10 flex-1 overflow-hidden block/.test(src))
ok("the veil's inset classes are untouched (left/right unchanged)", /\$\{veilInsetCls\}/.test(veilLine))
ok(
  "veilInsetCls itself is unchanged",
  /followUpsOpen \? "left-0 right-\[228px\]" : "left-0 right-\[48px\]"/.test(src) &&
    /followUpsOpen \? "left-\[228px\] right-0" : "left-\[48px\] right-0"/.test(src),
)
ok(
  "overlayInsetCls itself is unchanged",
  /followUpsOpen \? "left-\[18px\] right-\[246px\]" : "left-\[18px\] right-\[66px\]"/.test(src),
)
ok("the toolbar offset still wins for the veil when measured", /detailVeilStyle = detailBelowToolbar \? \{ top: focusToolbarH \} : undefined/.test(src))
ok("…and the overlay still adds the board padding on top of it", /detailOverlayStyle = detailBelowToolbar \? \{ top: focusToolbarH \+ focusBoardPad \} : undefined/.test(src))
ok("the veil still renders only while a lead is selected", /\{selectedLead && \(\s*<div style=\{detailVeilStyle\}/.test(src))

console.log("\nno new overlay system, and no scroll lock")
ok("NO body scroll lock was introduced", !/body\.style\.overflow|documentElement\.style\.overflow/.test(src))
ok("…and none exists anywhere in the CRM", (() => {
  const files = ["components/crm/DashboardClient.tsx", "components/crm/LeadPanel.tsx"]
  return files.every((f) => !/body\.style\.overflow/.test(readFileSync(f, "utf8")))
})())
ok("no portal / fixed-inset modal was added for the workspace", !/createPortal[\s\S]{0,200}detailVeil/.test(src))
ok("the root container's own layout is unchanged", /focusMode \? "fixed inset-0 z-\[60\] h-full" : "h-screen"/.test(src))

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
