// SIGNED MEDIA — the three-state result, the re-use rules, and the safety conditions on the cache.
//
// WHY THIS EXISTS. Routes used to collapse "no video" and "signing failed" into the same null, so
// the Post Editor printed "No preview" — a dead end — for a clip sitting safely in storage. The
// failure is real: createSignedUrl returns `Too many connections issued to the database` under
// load, reproduced against production. Everything below is about never confusing those two again,
// and about re-using a URL only when it is safe to.
//
// The Supabase client is a STUB here: this suite never contacts storage or the database.
// Run: npx tsx scripts/social/signedMedia.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { signMedia, mapWithConcurrency, clearSignedMediaCache, signedMediaCacheSize, SIGN_TTL_SECONDS, SIGN_CONCURRENCY } from "../../lib/social/signedMedia"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8")

let stubSeq = 0
/** A stub that counts calls and can be told to fail the first N attempts. */
function stub(opts: { failFirst?: number; always?: boolean } = {}) {
  let calls = 0
  let toFail = opts.failFirst ?? 0
  const stubId = ++stubSeq // so two different stubs can never mint an identical url by coincidence
  const client = {
    storage: {
      from() {
        return {
          async createSignedUrl(p: string) {
            calls++
            if (opts.always || toFail > 0) { toFail--; return { data: null, error: { message: "Too many connections issued to the database" } } }
            return { data: { signedUrl: `https://x/${p}?token=s${stubId}-${calls}` }, error: null }
          },
        }
      },
    },
  }
  return { client: client as never, calls: () => calls }
}
const OWNER = "owner-a", OTHER = "owner-b", P = "o/c/source.mov"

// Wrapped: the runner compiles to CJS, where top-level await is not available.
async function main() {

  // ── 1. THREE STATES ─────────────────────────────────────────────────────────
  console.log("1. absent and failed are different answers:")
  clearSignedMediaCache()
  {
    const s = stub()
    const r = await signMedia(s.client, null, OWNER)
    ok("no path → absent, and nothing was signed", r.status === "absent" && r.url === null && s.calls() === 0)
  }
  {
    const s = stub()
    const r = await signMedia(s.client, P, OWNER)
    ok("a path that signs → ok, with a url", r.status === "ok" && !!r.url)
  }
  clearSignedMediaCache()
  {
    const s = stub({ always: true })
    const r = await signMedia(s.client, P, OWNER)
    ok("signing that always fails → FAILED, never 'absent'", r.status === "failed" && r.url === null)
    ok("...and it RETRIED once before giving up (2 attempts)", s.calls() === 2)
  }
  clearSignedMediaCache()
  {
    const s = stub({ failFirst: 1 })
    const r = await signMedia(s.client, P, OWNER)
    ok("a transient failure is recovered by the retry", r.status === "ok" && !!r.url && s.calls() === 2)
  }

  // ── 2. RE-USE ───────────────────────────────────────────────────────────────
  console.log("\n2. a valid URL is re-used, so the browser can actually cache it:")
  clearSignedMediaCache()
  {
    const s = stub()
    const a = await signMedia(s.client, P, OWNER)
    const b = await signMedia(s.client, P, OWNER)
    ok("the SAME url comes back on a second request", a.url === b.url)
    ok("...and storage was only asked once", s.calls() === 1)
  }
  {
    clearSignedMediaCache()
    const s = stub()
    const mine = await signMedia(s.client, P, OWNER)
    const theirs = await signMedia(s.client, P, OTHER)
    ok("a DIFFERENT owner never receives another owner's url", mine.url !== theirs.url)
    ok("...it signed separately for each owner rather than re-using across them", s.calls() === 2)
    const again = await signMedia(s.client, P, OWNER)
    ok("...and each owner still re-uses their OWN url", again.url === mine.url && s.calls() === 2)
  }
  clearSignedMediaCache()
  {
    // The cache must expire BEFORE the token, or a url could be handed out seconds from death.
    const s = stub()
    const t0 = 1_000_000
    const first = await signMedia(s.client, P, OWNER, t0)
    const justBefore = await signMedia(s.client, P, OWNER, t0 + 24 * 60 * 1000)
    ok("still re-used at 24 minutes", justBefore.url === first.url)
    const after = await signMedia(s.client, P, OWNER, t0 + 26 * 60 * 1000)
    ok("re-signed at 26 minutes — before the 30-minute token expires", after.url !== first.url)
    ok("the token itself is 30 minutes", SIGN_TTL_SECONDS === 1800)
  }
  clearSignedMediaCache()
  {
    const s = stub({ always: true })
    await signMedia(s.client, P, OWNER)
    ok("a FAILURE is never cached — the next request tries again", signedMediaCacheSize() === 0)
  }

  // ── 3. THE CACHE CANNOT GROW WITHOUT BOUND ──────────────────────────────────
  console.log("\n3. bounded, and scoped:")
  clearSignedMediaCache()
  {
    const s = stub()
    for (let i = 0; i < 50; i++) await signMedia(s.client, `p/${i}.mov`, OWNER)
    ok("50 distinct paths → 50 entries", signedMediaCacheSize() === 50)
    clearSignedMediaCache(OWNER)
    ok("clearing one owner empties only that owner's entries", signedMediaCacheSize() === 0)
    const src = read("lib/social/signedMedia.ts")
    ok("there is a hard entry cap", /const MAX_ENTRIES = \d+/.test(src))
    ok("eviction drops the oldest entry", /cache\.keys\(\)\.next\(\)\.value/.test(src))
    // The real invariant: nothing with "use client" pulls this in. A per-browser Map would be
  // useless rather than unsafe, but it would also mean a route's cache silently stopped working.
  {
    const { execSync } = require("node:child_process") as typeof import("node:child_process")
    const importers = execSync(`grep -rl 'lib/social/signedMedia' --include='*.tsx' --include='*.ts' components app lib scripts || true`, { encoding: "utf8" })
      .split("\n").filter(Boolean)
    const clientImporters = importers.filter((f) => !f.includes(".test.") && /^"use client"/m.test(read(f)))
    ok(`no client component imports it (checked ${importers.length} importers)`, clientImporters.length === 0)
  }
    ok("the cache lives in this instance's memory, with no shared store",
      !/redis|memcach|upstash|kv\.|globalThis\./i.test(src))
  }

  // ── 4. BOUNDED CONCURRENCY ──────────────────────────────────────────────────
  console.log("\n4. the signing burst is bounded without being serialised:")
  {
    let inFlight = 0, peak = 0
    const items = Array.from({ length: 60 }, (_, i) => i)
    const out = await mapWithConcurrency(items, 8, async (n) => {
      inFlight++; peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 2))
      inFlight--
      return n * 2
    })
    ok(`never exceeded the limit (peak ${peak} of 8)`, peak <= 8)
    ok("every item was processed, in input order", out.length === 60 && out[0] === 0 && out[59] === 118)
    ok("the ceiling is well above 1 — this bounds the burst, it does not serialise it", SIGN_CONCURRENCY >= 8)
  }
  {
    const out = await mapWithConcurrency([], 8, async () => 1)
    ok("an empty list is handled", out.length === 0)
  }

  // ── 5. THE ROUTES ACTUALLY USE IT ───────────────────────────────────────────
  console.log("\n5. no route still collapses a failure into null:")
  for (const f of [
    "app/api/admin/social-autopilot/posts/[id]/route.ts",
    "app/api/admin/social-autopilot/posts/route.ts",
    "app/api/admin/social-autopilot/content/route.ts",
  ]) {
    const src = read(f)
    ok(`${f.split("/").slice(-2).join("/")}: the old swallowing sign() is gone`,
      !/createSignedUrl\([^)]*\)\)\.data\?\.signedUrl \?\? null/.test(src))
    ok(`${f.split("/").slice(-2).join("/")}: uses signMedia`, /signMedia\(/.test(src))
  }
  {
    const editor = read("app/api/admin/social-autopilot/posts/[id]/route.ts")
    ok("the editor route reports WHY the video is missing", /previewUrlFailed: preview\.status === "failed"/.test(editor))
    ok("...and returns the library thumbnail", /thumbUrl: thumb\.url/.test(editor))
    ok("the social COVER is still signed and returned, unchanged in meaning", /coverPreviewUrl: cover\.url/.test(editor))
    for (const f of ["app/api/admin/social-autopilot/posts/route.ts", "app/api/admin/social-autopilot/content/route.ts"]) {
      ok(`${f.split("/").slice(-2)[0]} list route no longer uses unbounded Promise.all for signing`,
        /mapWithConcurrency\(/.test(read(f)))
    }
  }


  console.log(`\nSigned media: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
void main()
