// PRODUCTION ↔ REPO SQL DRIFT CHECK
//
// Why this exists: on 2026-09-30 a SECURITY DEFINER function was rebuilt from the
// newest matching file in supabase/migrations. That file was NOT what production was
// running — the live body had since gained three snapshot columns through manual SQL
// that was never written back. The rewrite silently dropped them and every client
// recommendation page minted afterwards rendered gray placeholders.
//
// Nothing in the repo could have caught that, because the repo had no idea what was
// live. This closes that gap.
//
// HOW IT WORKS. Postgres exposes md5(prosrc) — a hash of the function BODY, i.e. the
// exact text between the dollar quotes. This extracts the same text from every
// definition in the repo, hashes it identically, and reports which repo file (if any)
// is the authoritative copy of what production is running.
//
// PostgREST cannot read pg_catalog, so the live hashes cannot be fetched from the app
// side. Paste them in (see USAGE) — one query, and the comparison is exact rather
// than a guess.
//
// USAGE
//   1. In the Supabase SQL Editor:
//        select proname, md5(prosrc) as body_hash
//          from pg_proc
//         where proname like 'lb_%'
//         order by proname;
//   2. Save the result as JSON — { "<proname>": "<body_hash>", ... } — to a file, or
//      paste it into LIVE_HASHES below for the tracked set.
//   3. npx tsx scripts/sql/checkFunctionDrift.ts [path/to/hashes.json]
//
// Exit code 1 on any drift, so this can gate a deploy.

import { readFileSync, readdirSync, existsSync } from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"

/**
 * Last verified against production 2026-09-30.
 *
 * Update these whenever manual SQL is applied — that is the whole point. A stale
 * entry here is itself drift, so treat a mismatch as "prove which side is right",
 * never as "edit the hash until it passes".
 */
const LIVE_HASHES: Record<string, string> = {
  lb_create_client_share: "9d58933d49f1068e711630dc36a8c99d",
  lb_prepare_client_share: "133aaf9d04486d80fad849b6ab1b9819",
  lb_resolve_client_recommendations: "5f779cf8cd6fde2176b23e982c3d0ed3",
  // Pass 2 area selection limit, applied 2026-10-01. These two are the REPO hashes,
  // recorded when the migration was written and not yet confirmed against prosrc —
  // the one query in USAGE above closes that. Behaviourally verified live the same
  // day (scripts/sql/verifyAreaLimitTrigger.ts, 23/23), so the trigger is known to be
  // active and running this logic; only the byte-exact body comparison is pending.
  lb_area_selection_count: "b3381d5a7626725f926b260d4e090238",
  lb_enforce_area_selection_limit: "c23d0ae2b03cdcf441dfc3054e4677fa",
}

const ROOT = process.cwd()
const SQL_DIRS = ["supabase/migrations", "supabase/manual"]

const md5 = (s: string) => createHash("md5").update(s, "utf8").digest("hex")

function sqlFiles(): string[] {
  const out: string[] = []
  for (const d of SQL_DIRS) {
    const abs = path.join(ROOT, d)
    if (!existsSync(abs)) continue
    for (const f of readdirSync(abs)) if (f.endsWith(".sql")) out.push(path.join(d, f))
  }
  return out
}

/** Every definition of `fn` in the repo, with the body hashed the way Postgres does. */
function repoDefinitions(fn: string): Array<{ file: string; hash: string; chars: number }> {
  const out: Array<{ file: string; hash: string; chars: number }> = []
  for (const rel of sqlFiles()) {
    const src = readFileSync(path.join(ROOT, rel), "utf8")
    const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`, "gi")
    let m: RegExpExecArray | null
    while ((m = re.exec(src))) {
      const after = src.slice(m.index)
      const open = after.indexOf("$$")
      if (open < 0) continue
      const close = after.indexOf("$$", open + 2)
      if (close < 0) continue
      const body = after.slice(open + 2, close)
      out.push({ file: rel, hash: md5(body), chars: body.length })
    }
  }
  return out
}

const live: Record<string, string> = process.argv[2]
  ? JSON.parse(readFileSync(process.argv[2], "utf8"))
  : LIVE_HASHES

let drift = 0
console.log("PRODUCTION ↔ REPO SQL FUNCTION ALIGNMENT\n")
for (const [fn, liveHash] of Object.entries(live)) {
  const defs = repoDefinitions(fn)
  const match = defs.find((d) => d.hash === liveHash)
  if (match) {
    console.log(`✅ ${fn}`)
    console.log(`     live = repo   ${liveHash}`)
    console.log(`     authoritative file: ${match.file}`)
  } else {
    drift++
    console.log(`❌ ${fn}  — DRIFT: production is running a body that is NOT in the repo`)
    console.log(`     live hash: ${liveHash}`)
    if (defs.length === 0) {
      console.log(`     no definition found in the repo at all`)
    } else {
      console.log(`     ${defs.length} repo definition(s), none matching:`)
      for (const d of defs) console.log(`       ${d.hash}  ${d.file}  (${d.chars} chars)`)
    }
    console.log(`     FIX: capture the live body and commit it —`)
    console.log(`       select prosrc from pg_proc where proname = '${fn}';`)
    console.log(`     Do NOT edit production to match the repo; the repo follows production.`)
  }
  console.log()
}

if (drift) {
  console.log(`${drift} function(s) drifted. The repo is NOT authoritative.`)
  process.exit(1)
}
console.log("All tracked functions: production and repo are aligned.")
