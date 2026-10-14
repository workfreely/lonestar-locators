#!/usr/bin/env node
// SYNC THE BUILD INTO THE FOLDER CHROME ACTUALLY LOADS.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────
// Chrome loaded an unpacked extension from ~/beast-companion-dist while every build wrote to
// apps/beast-companion/dist inside the repo. Both folders were real, both held a valid "Beast
// Companion" manifest, and nothing connected them — so a build could succeed, the code could be
// correct, the deploy could be green, and the panel on screen could still be weeks old. That
// failure is silent by construction, which is what made it expensive. This closes the gap.
//
// ── WHY IT DOES NOT JUST COPY ───────────────────────────────────────────────────────────────
// The destination is a live Chrome extension directory outside the repository, and its path IS
// the extension's identity: the manifest carries no "key", so Chrome derives the extension ID
// from the folder path. A new folder means a new ID and an empty chrome.storage — which is where
// the Beast Sync pairing lives. So this script may only ever refresh an install that ALREADY
// exists; it will never create one, and it refuses anything it cannot positively identify.
//
// Note on configuration: the pairing and settings live in Chrome's own profile storage, not in
// this folder. Nothing here can reach them. The guards below exist to protect the DISK — an
// unrelated directory that a typo or a stale env var might otherwise point at.

import { existsSync, readFileSync, readdirSync, rmSync, cpSync, mkdirSync, statSync } from "node:fs"
import { resolve, join, sep } from "node:path"
import { homedir } from "node:os"

const EXTENSION_NAME = "Beast Companion"
/** The only files a build owns. Everything else in the destination is left untouched. */
const BUILD_FILES = ["manifest.json", "sidepanel.html", "content.js", "background.js"]
const BUILD_DIRS = ["assets", "icons"]

const repoApp = resolve(import.meta.dirname, "..")
const source = join(repoApp, "dist")

// Destination, most explicit first. Machine-specific, so it is never committed.
const argDest = process.argv.find((a) => a.startsWith("--dest="))?.slice("--dest=".length)
const destination = resolve(
  argDest || process.env.BEAST_COMPANION_INSTALL_DIR || join(homedir(), "beast-companion-dist"),
)

function fail(msg) {
  console.error(`\n✗ sync-to-chrome REFUSED\n  ${msg}\n`)
  process.exit(1)
}
function skip(msg) {
  console.log(`\n· sync-to-chrome skipped — ${msg}\n`)
  process.exit(0)
}
function manifestName(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")).name
  } catch {
    return null
  }
}

// ── GUARDS. Every one of these has to hold before a single byte is written. ──────────────────

// 1. The source must be a build this script recognises, so a half-finished or empty dist can
//    never overwrite a working install.
if (!existsSync(source)) fail(`no build to sync — ${source} does not exist. Run the build first.`)
for (const f of BUILD_FILES) {
  if (!existsSync(join(source, f))) fail(`${source} is not a complete build — ${f} is missing.`)
}
if (manifestName(source) !== EXTENSION_NAME) {
  fail(`${source}/manifest.json is named ${JSON.stringify(manifestName(source))}, not ${JSON.stringify(EXTENSION_NAME)}.`)
}

// 2. An ABSENT destination is not an error — it just means this machine has no unpacked install.
//    Creating one would mint a new extension ID and lose the pairing, so we never do it.
if (!existsSync(destination)) {
  skip(`no installed extension at ${destination}. Nothing was created — a new folder would be a NEW extension ID with no Beast Sync pairing.`)
}
if (!statSync(destination).isDirectory()) fail(`${destination} is not a directory.`)

// 3. The destination must prove it is the extension install, not some unrelated folder that an
//    env var or a typo happens to name.
const destName = manifestName(destination)
if (destName !== EXTENSION_NAME) {
  fail(
    `${destination} does not look like a Beast Companion install.\n` +
      `  Its manifest.json is ${destName === null ? "missing or unreadable" : JSON.stringify(destName)}.\n` +
      `  Refusing to write into a directory this script cannot identify.`,
  )
}

// 4. Never write inside the repository — that would clobber the source with its own output.
if (destination === repoApp || destination.startsWith(repoApp + sep)) {
  fail(`${destination} is inside the repository. The install must live outside it.`)
}

// 5. Never anything shallow enough to be a home or a volume root.
const home = resolve(homedir())
if (destination === home || destination === resolve("/") || destination.split(sep).filter(Boolean).length < 3) {
  fail(`${destination} is too close to a filesystem or home root to be an extension folder.`)
}

// ── THE SYNC. Only the files a build owns are replaced. ──────────────────────────────────────
// Anything else in the destination — a .DS_Store, a note, anything the agent put there — is left
// exactly as it is. assets/ is emptied first because its filenames are content-hashed, so
// yesterday's bundle would otherwise sit beside today's forever.

const before = readdirSync(destination)
for (const d of BUILD_DIRS) {
  const target = join(destination, d)
  if (existsSync(join(source, d))) {
    rmSync(target, { recursive: true, force: true })
    mkdirSync(target, { recursive: true })
    cpSync(join(source, d), target, { recursive: true })
  }
}
for (const f of BUILD_FILES) {
  cpSync(join(source, f), join(destination, f))
}

const after = readdirSync(destination)
const removed = before.filter((n) => !after.includes(n))

console.log(`\n✓ Beast Companion build synced`)
console.log(`    from : ${source}`)
console.log(`    to   : ${destination}`)
console.log(`    files: ${[...BUILD_FILES, ...BUILD_DIRS.map((d) => d + "/")].join(", ")}`)
if (removed.length) console.log(`    note : no longer present — ${removed.join(", ")}`)
console.log(`    next : reload the extension at chrome://extensions (Developer mode → ↻ on Beast Companion)\n`)
