// The status palette must actually be COMPILED, not merely declared.
//
// ── THE REGRESSION THIS EXISTS FOR ──────────────────────────────────────────────────────────
// The Accounts palette was moved from the component into lib/social/accountCapabilities.ts so the
// page and its preview harness could not drift. Tailwind's `content` globs covered pages, app and
// components — but NOT lib. So it stopped seeing `bg-yellow-500`, `text-sky-600` and every orange
// utility, and silently emitted no rule for them.
//
// NOTHING THREW. The class string still reached the HTML; there was simply no CSS behind it, so
// those badges rendered with no colour at all. Every unit test still passed, because they assert
// the STRINGS in TypeScript — which is precisely the thing that was still correct.
//
// A class referenced only from a file Tailwind does not scan fails this quietly, every time. So
// this checks the two different facts: the config scans the file, and the build emitted the rules.
// Run: npm run build && npx tsx scripts/social/tailwindPalette.test.ts
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { CAPABILITY_TONE, CAPABILITY_DOT, type CapabilityState } from "@/lib/social/accountCapabilities"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}
const STATES: CapabilityState[] = ["active", "paused", "disabled", "permission_needed", "attention"]

console.log("1. THE CONFIG SCANS WHERE THE CLASSES LIVE:")
{
  const cfg = readFileSync("tailwind.config.ts", "utf8")
  ok("tailwind scans ./lib (the palette lives in lib/social/accountCapabilities.ts)",
    /["']\.\/lib\/\*\*/.test(cfg), "add ./lib/**/*.{js,ts,jsx,tsx,mdx} to content")
  ok("…and still scans components and app", /\.\/components\/\*\*/.test(cfg) && /\.\/app\/\*\*/.test(cfg))
  // darkMode:"class" changes the emitted selector, which is why a naive grep for `.text-x-400`
  // misses the dark variants — they ship as `.dark\:text-x-400`.
  ok("dark mode is class-based, so dark variants emit as escaped selectors",
    /darkMode:\s*["']class["']/.test(cfg))
}

console.log("\n2. EVERY PALETTE CLASS IS IN THE BUILD OUTPUT:")
{
  const dir = ".next/static/chunks"
  if (!existsSync(dir)) {
    fail++
    console.log("  ✗ no build output found — run `npm run build` first. This check cannot be skipped:")
    console.log("    the whole point is that the TypeScript was correct while the CSS was missing.")
  } else {
    const css = readdirSync(dir).filter((f) => f.endsWith(".css"))
      .map((f) => readFileSync(`${dir}/${f}`, "utf8")).join("\n")
    ok(`${css.length > 0 ? "" : "NO "}CSS found in the build output`, css.length > 0)

    for (const state of STATES) {
      const tone = CAPABILITY_TONE[state]      // e.g. "text-yellow-600 dark:text-yellow-400"
      const dot = CAPABILITY_DOT[state]        // e.g. "bg-yellow-500"
      const missing: string[] = []
      for (const cls of [...tone.split(/\s+/), dot].filter(Boolean)) {
        // A `dark:` utility is emitted with the colon escaped; a plain one is not.
        const selector = cls.includes(":")
          ? `.${cls.replace(/:/g, "\\:")}`
          : `.${cls}`
        if (!css.includes(selector)) missing.push(cls)
      }
      ok(`${state.padEnd(18)} → ${tone} ${dot}`, missing.length === 0, `not compiled: ${missing.join(", ")}`)
    }
  }
}

console.log("\n3. THE COLOURS ARE ACTUALLY DIFFERENT IN THE OUTPUT:")
{
  const dir = ".next/static/chunks"
  if (existsSync(dir)) {
    const css = readdirSync(dir).filter((f) => f.endsWith(".css"))
      .map((f) => readFileSync(`${dir}/${f}`, "utf8")).join("\n")
    // Pull the rgb() each dot colour resolves to. Two states sharing one value would defeat the
    // entire change even with five distinct class names.
    const rgb = new Map<CapabilityState, string>()
    for (const state of STATES) {
      const cls = CAPABILITY_DOT[state]
      const m = css.match(new RegExp(`\\.${cls}\\s*\\{[^}]*?background-color:\\s*(rgb\\([^)]*\\))`))
      if (m) rgb.set(state, m[1])
    }
    ok("every dot colour resolves to a concrete rgb()", rgb.size === STATES.length,
      `${rgb.size}/${STATES.length}`)
    ok("all five dot colours are DIFFERENT values, not just different names",
      new Set(rgb.values()).size === rgb.size,
      [...rgb.entries()].map(([s, v]) => `${s}=${v}`).join(" "))
    for (const [s, v] of rgb) console.log(`    ${s.padEnd(18)} ${v}`)
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
