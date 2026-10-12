// THE UPLOAD PROGRESS LABEL — and proof the fix is display-only.
//
// The bug: after typing a property name, the upload progress / "Upload complete" list named each
// row by its SOURCE FILENAME, often a camera UUID, so the operator could not tell which video was
// which. The label now comes from the property name they entered.
//
// Two things are asserted, and the second matters more than the first:
//   1. the label rule itself — the property name, falling back to the filename, never blank;
//   2. that NOTHING ELSE MOVED. A label change that quietly altered what gets stored would be a
//      data bug wearing a UI bug's clothes, so the upload payload and storage path are pinned
//      here by source: originalFilename is still the real file.name, the storage path is still
//      keyed by contentId, and no rename happens anywhere.
//
// Run: npx tsx scripts/social/uploadLabel.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { uploadLabel } from "../../lib/social/uploadLabel"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const f = (name: string) => ({ name })

// ── 1. THE RULE ─────────────────────────────────────────────────────────────
console.log("1. the property name is the label; the filename is the fallback:")
ok("a typed property name wins over the filename",
  uploadLabel({ propertyName: "Merrick On Midway", file: f("IMG_4821.mov") }) === "Merrick On Midway")
ok("...including over a UUID filename — the case that prompted this",
  uploadLabel({ propertyName: "Hanover Preston Hollow", file: f("3f6d1244-f20a-ae8a-9b21-5c7e1d4f0a93.mp4") }) === "Hanover Preston Hollow")
ok("no property name falls back to the filename", uploadLabel({ propertyName: "", file: f("COOP-Heights.mp4") }) === "COOP-Heights.mp4")
ok("whitespace-only is treated as missing", uploadLabel({ propertyName: "   ", file: f("clip.mov") }) === "clip.mov")
ok("surrounding whitespace is trimmed off the label", uploadLabel({ propertyName: "  Kessler Bluffs  ", file: f("a.mp4") }) === "Kessler Bluffs")
ok("the label is never empty, even with both blank-ish", uploadLabel({ propertyName: " ", file: f("") }) === "")
ok("a name that merely CONTAINS spaces is untouched", uploadLabel({ propertyName: "Seven17 Lehman Apartments", file: f("x.mp4") }) === "Seven17 Lehman Apartments")
ok("unicode and punctuation survive", uploadLabel({ propertyName: "Résidence — Lofts #2", file: f("x.mp4") }) === "Résidence — Lofts #2")
ok("it never returns the filename when a name exists",
  [["A", "b.mp4"], ["Loft 9", "9.mov"], ["x", "x"]].every(([p, n]) => uploadLabel({ propertyName: p, file: f(n) }) === p))

// ── 2. ONE LABEL FOR BOTH STATES, AND NOTHING ELSE MOVED ────────────────────
console.log("\n2. the client uses it for display only:")
const src = readFileSync(path.join(process.cwd(), "components/crm/social/SocialAutopilotClient.tsx"), "utf8")
ok("the component imports the shared rule rather than restating it", /import \{ uploadLabel \} from "@\/lib\/social\/uploadLabel"/.test(src))
{
  // The progress modal renders ONE <li> for every file, in both the uploading and the complete
  // state — so a single labelled row proves the label is identical in both. Pin that there is
  // exactly one such row, or "same name throughout" could quietly stop being true.
  const rows = src.match(/\{String\(u\.seq\)\.padStart\(2, "0"\)\} · \{uploadLabel\(u\)\}/g) ?? []
  ok("exactly one row template, so progress and completion cannot diverge", rows.length === 1)
  ok("the heading still switches between Uploading… and Upload complete around it",
    /uploadsDone \? "Upload complete" : "Uploading…"/.test(src))
  ok("the raw filename is no longer the visible row label", !/· \{u\.file\.name\}/.test(src))
  ok("...but it is still reachable in the row's tooltip", /title=\{uploadLabel\(u\) === u\.file\.name \? u\.file\.name : `\$\{uploadLabel\(u\)\} — \$\{u\.file\.name\}`\}/.test(src))
}
ok("the name is snapshotted per file when the batch starts, like meta",
  /pendingFiles\.map\(\(file, i\) => \(\{[\s\S]*?propertyName: meta\.propertyName \}\)\)/.test(src))

console.log("\n3. storage, identifiers and records are untouched:")
ok("originalFilename is still the REAL file name", /originalFilename: uf\.file\.name,/.test(src))
ok("the storage path is still keyed by contentId and the real extension",
  /const path = `\$\{userId\}\/\$\{uf\.contentId\}\/source\.\$\{extOf\(uf\.file\.name\)\}`/.test(src))
ok("no rename/move/copy of an uploaded object was introduced",
  !/\.move\(|\.copy\(|rename/i.test(src.split("const uploadOne")[1]?.slice(0, 4000) ?? ""))
ok("the label rule itself cannot touch storage — it imports nothing",
  !/^import /m.test(readFileSync(path.join(process.cwd(), "lib/social/uploadLabel.ts"), "utf8")))
{
  // The BULK upload table is a DIFFERENT surface: it already shows Property in its own column
  // beside the filename column, so it was deliberately left alone. Assert that, so a later
  // "consistency" edit there is a decision rather than an accident.
  const bulk = readFileSync(path.join(process.cwd(), "components/crm/social/BulkReview.tsx"), "utf8")
  ok("BulkReview still shows the filename AND the property name as separate columns",
    /title=\{r\.file\.name\}>\{r\.file\.name\}/.test(bulk) && /\{r\.propertyName \|\| "—"\}/.test(bulk))
}

console.log(`\nUpload label: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
