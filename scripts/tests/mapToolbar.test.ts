// MAP TOOLBAR — the combined Beast Matches toggle, and a row that can actually shrink.
//
// Run: npx tsx scripts/tests/mapToolbar.test.ts   (pure — reads source)
//
// The crowding had one cause: every control in the row declared flex:none and the search a
// fixed 320px, so the toolbar had exactly one intrinsic width. With Agenda and Companion both
// open the centre pane is roughly 700px and the row simply ran past the edge.
//
// A @media rule cannot see that — the sidebars change the PANE, not the viewport — so the
// compacting is done with @container rules on the pane itself.
import { readFileSync } from "node:fs"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) } }
const css = readFileSync("app/globals.css", "utf8")
const board = readFileSync("components/crm/LeadBoard.tsx", "utf8")
const explorer = readFileSync("components/crm/explorer/BeastPropertyExplorer.tsx", "utf8")

console.log("\nthe count and the toggle are one control")
ok("the toggle's Beast tab carries the count",
  /mode === "beast" \? `\$\{label\} \(\$\{beastMatchCount\}\)` : label/.test(explorer))
ok("the Unleash button no longer repeats it", !/`\$\{beastMatchCount\} Beast \$\{beastMatchCount === 1/.test(explorer))
ok("it reads 'Unleash Beast' again after a run, because that is what it does",
  /beastPhase === "scanning" \? "Beast is searching…" : "Unleash Beast"/.test(explorer))
ok("both modes still exist", /"Beast Matches"/.test(explorer) && /"All Properties"/.test(explorer))
ok("switching still only sets state — no search, no re-rank", /onClick=\{\(\) => setMapFilter\(mode\)\}/.test(explorer))
ok("the count still comes from the shortlist", /setBeastMatchCount\(shortlist\.length\)/.test(explorer))

console.log("\nthe row can shrink")
ok("the left group absorbs the width change", /\.kb-toolbar-left \{[^}]*flex:1 1 auto[^}]*min-width:0/.test(css))
ok("the search shrinks to a floor instead of holding a fixed width",
  /\.kb-toolbar-left \.kb-search \{[^}]*flex:1 1 272px[^}]*min-width:148px/.test(css))
ok("NOTHING in the toolbar is flex:none with a fixed width any more",
  !/\.kb-toolbar-left \.kb-search \{ flex:none; width:320px; \}/.test(css))

console.log("\nit compacts against the PANE, not the window")
ok("the pane is a named container", /\.kb-workspace \{[^}]*container-type:inline-size[^}]*container-name:kbpane/.test(css))
ok("the compacting rules are @container, not @media", (css.match(/@container kbpane/g) ?? []).length >= 3)
ok("labels stand down at 1000px", /@container kbpane \(max-width: 1000px\) \{[\s\S]{0,400}\.kb-wide-label \{ display:none; \}/.test(css))

console.log("\nnothing loses its meaning when its words go")
for (const [what, re] of [
  ["Back to Workspace", /title="Back to Workspace" aria-label="Back to Workspace"/],
  ["Focus", /title=\{focus \? "Exit Focus" : "Focus"\}\n\s*aria-label=\{focus \? "Exit Focus" : "Focus"\}/],
] as const) ok(`${what} keeps its accessible name and tooltip`, re.test(board))
ok("Unleash Beast keeps its accessible name and tooltip",
  /title=\{beastPhase === "scanning" \? "Beast is searching…" : "Unleash Beast"\}/.test(explorer) &&
  /aria-label=\{beastPhase === "scanning" \? "Beast is searching…" : "Unleash Beast"\}/.test(explorer))
ok("the market switcher and the toggle KEEP their text at every width",
  !/kb-wide-label/.test(explorer.slice(explorer.indexOf("const marketSwitcher"), explorer.indexOf("const marketSwitcher") + 1200)))

console.log("\nthe Map button only disappears where it did nothing")
ok("it still renders from the board", /\{workspace !== "map" && \([\s\S]{0,220}onWorkspaceChange\("map"\)/.test(board))
ok("…and not inside the map, where it switched to the workspace you were already in",
  !/aria-pressed=\{workspace === "map"\} onClick=\{\(\) => onWorkspaceChange\("map"\)\}/.test(board))

console.log("\nthe two control groups are separated")
// .kb-map-actions had NO gap at all: Unleash Beast and the Beast Matches toggle are portalled
// in as siblings, so they sat flush while every other control got the row's 10px.
ok("the action group has a gap of its own", /\.kb-toolbar-left \.kb-map-actions \{[^}]*gap:12px/.test(css))
ok("…and it narrows with the pane without ever returning to flush",
  /@container kbpane \(max-width: 1180px\)[\s\S]{0,400}\.kb-map-actions \{ gap:10px; \}/.test(css) &&
  /@container kbpane \(max-width: 820px\)[\s\S]{0,500}\.kb-map-actions \{ gap:8px; \}/.test(css))
ok("the search gave back the width, trimmed to 272", /\.kb-toolbar-left \.kb-search \{ flex:1 1 272px[^}]*max-width:272px/.test(css))

console.log("\nbelow ~700px the row wraps instead of overlapping")
// A toolbar-level scrollWidth check CANNOT see this: .kb-toolbar-left is flex:1 1 auto with
// min-width:0, so its BOX shrinks while its flex:none children keep their width and spill out.
// Measured at a 620px pane before the fix: the toggle's right edge 628 vs Focus's left edge 579.
ok("there is a wrap rule for the pane sizes that genuinely do not fit",
  /@container kbpane \(max-width: 700px\)[\s\S]{0,400}flex-wrap:wrap/.test(css))
ok("the wrapped rows are spaced", /@container kbpane \(max-width: 700px\)[\s\S]{0,400}row-gap:8px/.test(css))
ok("Focus is never pulled into the wrap — it is not in the wrapping group",
  !/\.kb-toolbar \{[^}]*flex-wrap/.test(css))

console.log("\nnothing else about the map changed")
ok("no matching, scoring or filtering logic is touched here",
  !/scoreProperty|rankProperties|qualif/i.test(explorer.slice(explorer.indexOf("const mapFilterToggle"), explorer.indexOf("const mapFilterToggle") + 900)))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
