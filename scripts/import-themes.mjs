#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Reusable city-theme importer.
//
// Copies skyline images from a local source folder INTO the project, optimizes
// them (resize + WebP), and regenerates the city→image map that the Smart Lead
// Form hero themes read from. The image FILENAMES are the source of truth —
// nothing about cities or states is hardcoded here, so adding a new city later
// is just: drop `<city>-skyline.png` into the right state folder and rerun this.
//
//   Usage:  npm run import-themes            (default source folder)
//           node scripts/import-themes.mjs "/path/to/Locator Beast Themes"
//
// Source layout expected:  <source>/<State>/<city>-skyline.<png|jpg|webp>
// Only images INSIDE a state subfolder are imported; loose files in the source
// root (and non-images) are ignored and reported.
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from "node:fs"
import path from "node:path"
import os from "node:os"
import sharp from "sharp"

const SOURCE_DIR =
  process.argv[2] ||
  process.env.THEMES_SOURCE ||
  path.join(os.homedir(), "Downloads", "Locator Beast Themes")

const PROJECT_ROOT = process.cwd()
const PUBLIC_THEMES_DIR = path.join(PROJECT_ROOT, "public", "themes")
const GENERATED_FILE = path.join(PROJECT_ROOT, "lib", "themes", "generated-themes.ts")
const CATALOG_FILE = path.join(PROJECT_ROOT, "lib", "markets", "catalog.ts")

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"])
const MAX_WIDTH = 1600 // plenty for a hero background; keeps files small
const WEBP_QUALITY = 82

// slug: lowercase, non-alphanumerics → single hyphens, trimmed.
const slugify = (s) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")

// Generic descriptor tokens dropped from the END of a filename to reveal the
// city (handles "skyline", the "skyine" typo, "-2", "-theme", etc.). Not a city
// list — just noise words, so future files with any of these still resolve.
const isDescriptor = (t) => /^(sky\w*|theme|themes|bg|background|hero|photo|image|img|\d+)$/i.test(t)

// Generic abbreviation expansion for nicer labels (not a city list).
const ABBREV = { ft: "Fort", mt: "Mount" }

function cityFromFilename(filename) {
  const base = filename.replace(/\.[^.]+$/, "")
  let tokens = slugify(base).split("-").filter(Boolean)
  while (tokens.length > 1 && isDescriptor(tokens[tokens.length - 1])) tokens.pop()
  const slug = tokens.join("-")
  const label = tokens.map((t) => ABBREV[t] || t.charAt(0).toUpperCase() + t.slice(1)).join(" ")
  return { slug, label }
}

async function readCatalogSlugs() {
  try {
    const txt = await fs.readFile(CATALOG_FILE, "utf8")
    return new Set([...txt.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]))
  } catch {
    return new Set()
  }
}

const mb = (n) => (n / 1024 / 1024).toFixed(2) + " MB"

async function main() {
  let entries
  try {
    entries = await fs.readdir(SOURCE_DIR, { withFileTypes: true })
  } catch {
    console.error(`\n❌ Source folder not found:\n   ${SOURCE_DIR}\n`)
    process.exit(1)
  }

  // Rebuild public/themes from scratch so the output always mirrors the source
  // exactly (no stale images left behind after a rename/removal).
  await fs.rm(PUBLIC_THEMES_DIR, { recursive: true, force: true })
  await fs.mkdir(PUBLIC_THEMES_DIR, { recursive: true })

  const imported = []
  const emptyStates = []
  const ignoredRootImages = []
  const duplicates = []
  const seen = new Map() // "state/city" -> source relative path

  // Loose image files in the source ROOT are outside any state folder → ignore.
  for (const e of entries) {
    if (e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase())) ignoredRootImages.push(e.name)
  }

  for (const e of entries.filter((x) => x.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const stateSlug = slugify(e.name)
    const stateDir = path.join(SOURCE_DIR, e.name)
    const files = (await fs.readdir(stateDir))
      .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
      .sort()

    if (files.length === 0) {
      emptyStates.push(e.name)
      continue
    }

    for (const f of files) {
      const { slug: citySlug, label: cityLabel } = cityFromFilename(f)
      const key = `${stateSlug}/${citySlug}`
      if (seen.has(key)) {
        duplicates.push({ file: `${e.name}/${f}`, conflictsWith: seen.get(key), city: cityLabel })
        continue
      }
      seen.set(key, `${e.name}/${f}`)

      const srcAbs = path.join(stateDir, f)
      const outRel = path.posix.join("themes", stateSlug, `${citySlug}.webp`)
      const outAbs = path.join(PUBLIC_THEMES_DIR, stateSlug, `${citySlug}.webp`)
      await fs.mkdir(path.dirname(outAbs), { recursive: true })

      const srcSize = (await fs.stat(srcAbs)).size
      await sharp(srcAbs)
        .rotate()
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toFile(outAbs)
      const outSize = (await fs.stat(outAbs)).size

      imported.push({ citySlug, cityLabel, state: stateSlug, imageUrl: "/" + outRel, srcSize, outSize, source: `${e.name}/${f}` })
    }
  }

  imported.sort((a, b) => a.state.localeCompare(b.state) || a.cityLabel.localeCompare(b.cityLabel))

  // Regenerate the TS map the app reads.
  await fs.mkdir(path.dirname(GENERATED_FILE), { recursive: true })
  const generated = `// AUTO-GENERATED by scripts/import-themes.mjs — DO NOT EDIT BY HAND.
// Rerun \`npm run import-themes\` after adding/removing images in the source
// folder. The image filenames are the source of truth for cities & states.
export type ImportedTheme = { slug: string; label: string; state: string; imageUrl: string }

export const IMPORTED_THEMES: ImportedTheme[] = [
${imported.map((t) => `  { slug: ${JSON.stringify(t.citySlug)}, label: ${JSON.stringify(t.cityLabel)}, state: ${JSON.stringify(t.state)}, imageUrl: ${JSON.stringify(t.imageUrl)} },`).join("\n")}
]
`
  await fs.writeFile(GENERATED_FILE, generated)

  // Cross-reference the operational market catalog for "cities without images".
  const catalogSlugs = await readCatalogSlugs()
  const importedSlugs = new Set(imported.map((t) => t.citySlug))
  const marketsWithout = [...catalogSlugs].filter((s) => !importedSlugs.has(s)).sort()

  // ── Report ─────────────────────────────────────────────────────────────
  const totalSrc = imported.reduce((a, t) => a + t.srcSize, 0)
  const totalOut = imported.reduce((a, t) => a + t.outSize, 0)
  console.log(`\n════════════════════════════════════════════════════════`)
  console.log(`  Locator Beast — City Theme Import`)
  console.log(`════════════════════════════════════════════════════════`)
  console.log(`Source: ${SOURCE_DIR}\n`)

  console.log(`✅ Images imported (${imported.length}):`)
  for (const t of imported) {
    console.log(
      `   • ${t.cityLabel.padEnd(18)} ${t.state.padEnd(12)} ${mb(t.srcSize).padStart(8)} → ${mb(t.outSize).padStart(8)}   ${t.imageUrl}`
    )
  }
  console.log(`   optimized: ${mb(totalSrc)} → ${mb(totalOut)} (${Math.round((1 - totalOut / totalSrc) * 100)}% smaller)\n`)

  console.log(`✅ Cities matched (${importedSlugs.size}): ${imported.map((t) => t.cityLabel).join(", ")}\n`)

  console.log(`⚠️  Market cities without an image (${marketsWithout.length}): ${marketsWithout.length ? marketsWithout.join(", ") : "none — every market city has a theme"}`)
  console.log(`⚠️  Empty state folders (${emptyStates.length}): ${emptyStates.length ? emptyStates.join(", ") : "none"}\n`)

  console.log(`🖼️  Ignored loose images in source root, not in a state folder (${ignoredRootImages.length}): ${ignoredRootImages.length ? ignoredRootImages.join(", ") : "none"}`)
  console.log(`🖼️  Duplicate cities skipped (${duplicates.length}): ${duplicates.length ? duplicates.map((d) => `${d.file} (dup of ${d.conflictsWith})`).join(", ") : "none"}\n`)

  console.log(`📁 Copied into: public/themes/<state>/<city>.webp`)
  console.log(`📁 Map regenerated: lib/themes/generated-themes.ts`)
  console.log(`════════════════════════════════════════════════════════\n`)
}

main().catch((err) => {
  console.error("Import failed:", err)
  process.exit(1)
})
