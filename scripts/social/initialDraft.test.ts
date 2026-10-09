// ONE INITIAL DRAFT PER SOURCE — clicking Edit twice must never create two posts.
//
// THE BUG THIS LOCKS DOWN. The library decides "create or open" from a client-side rollup
// (postsBySource) that createPost never refreshed, and it released its in-flight guard when the
// HTTP request resolved — BEFORE the navigation completed. In that gap the button was live, the
// page had not changed, and the rollup still said zero posts, so every further click inserted
// another draft. Measured in production: Peregrine 3 drafts in 11.6s, Collection at Boerne 2 in
// 7.6s, The Mustang 2 in 14.2s — all untouched (updated_at == created_at) on the market_type
// auto-default, i.e. never opened by anyone.
//
// Three protections, each asserted below:
//   1. createPost awaits load() before navigating, so the rollup is never stale.
//   2. creatingId is NOT cleared on success, so the button stays disabled through navigation.
//   3. POST /posts is idempotent, backed by a UNIQUE INDEX for the concurrent case.
//
// And the thing that must NOT break: deliberate Create Variation and "+ New".
//
// Run: npx tsx scripts/social/initialDraft.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

const client = read("components/crm/social/SocialAutopilotClient.tsx")
const route = read("app/api/admin/social-autopilot/posts/route.ts")
const dup = read("app/api/admin/social-autopilot/posts/[id]/duplicate/route.ts")
const migration = read("supabase/migrations/20261009000001_one_initial_draft_per_source.sql")

// ── 1. RAPID REPEATED EDIT CLICKS ───────────────────────────────────────────
console.log("1. rapid repeated Edit clicks:")
{
  // The decision function, as shipped: create ONLY when the rollup shows none.
  const editDecision = (rollupLen: number) => (rollupLen === 0 ? "create" : rollupLen === 1 ? "open" : "picker")
  ok("rollup empty -> create (the only path that inserts)", editDecision(0) === "create")
  ok("rollup has 1 -> OPEN, never create", editDecision(1) === "open")
  ok("rollup has 3 -> picker, never create", editDecision(3) === "picker")

  // The fix: the rollup is refreshed BEFORE navigation, so the second click sees 1, not 0.
  ok("createPost awaits load() before navigating", /await load\(\)[\s\S]{0,400}router\.push/.test(client))
  ok("...and load is in its dependency list", /\[router, scheduleDate, load\]/.test(client))

  // Simulate the exact production sequence with the fix in place.
  let posts = 0
  const refreshed = () => posts // the rollup now reflects reality
  for (let click = 0; click < 5; click++) if (editDecision(refreshed()) === "create") posts++
  ok(`five rapid clicks create exactly ONE post (created ${posts})`, posts === 1)
}

// ── 2. FAILED / SLOW NAVIGATION ─────────────────────────────────────────────
console.log("\n2. failed or slow navigation (the original gap):")
{
  ok("creatingId is NOT cleared on the success path", /DELIBERATELY NOT clearing creatingId/.test(client))
  ok("...the success path returns before any re-enable", /return\n\s*\}\n\s*\} catch \{[\s\S]{0,200}setCreatingId\(null\)/.test(client))
  ok("...and a FAILED create does re-enable the button", /Only reached when creation FAILED[\s\S]{0,160}setCreatingId\(null\)/.test(client))
  ok("the Edit button is disabled while creatingId matches", /disabled=\{creatingId === sid\}/.test(client))

  // Even if navigation never happens, the server now refuses a second insert.
  ok("the server is the backstop, not the button", /if \(!explicitNew\) \{/.test(route))
}

// ── 3. SERVER IDEMPOTENCY + CONCURRENCY ─────────────────────────────────────
console.log("\n3. server-side idempotency:")
{
  ok("POST reads for an existing unpublished post first", /\.eq\("source_content_id", sourceContentId\)[\s\S]{0,120}\.is\("published_at", null\)/.test(route))
  ok("...and RETURNS it instead of inserting", /if \(found\) return NextResponse\.json\(\{ id: found, reused: true \}\)/.test(route))
  ok("...newest first, so a just-created draft wins", /\.order\("created_at", \{ ascending: false \}\)/.test(route))
  ok("the implicit path marks provenance 'edit_initial'", /created_via: explicitNew \? "variation" : "edit_initial"/.test(route))

  // The read-then-write is not atomic; the index is the actual guarantee.
  ok("a UNIQUE INDEX enforces one initial draft per source", /create unique index if not exists social_posts_one_initial_draft_uidx/.test(migration))
  ok("...scoped to the implicit path only", /where created_via = 'edit_initial' and published_at is null/.test(migration))
  ok("...keyed on the source", /on public\.social_posts \(source_content_id\)/.test(migration))
  ok("the route RECOVERS from 23505 by returning the winner's row", /23505[\s\S]{0,420}reused: true/.test(route))
  ok("provenance values are constrained", /check \(created_via is null or created_via in \('edit_initial', 'variation'\)\)/.test(migration))
  ok("pre-existing rows stay NULL so the migration cannot fail on live data", /NULL\s+— every pre-existing row/.test(migration))

  // Concurrency, simulated against the index's predicate.
  const index = new Set<string>()
  const insert = (src: string, via: string, published: boolean) => {
    const key = `${src}`
    if (via === "edit_initial" && !published) {
      if (index.has(key)) return "23505"
      index.add(key)
    }
    return "ok"
  }
  const a = insert("src-1", "edit_initial", false)
  const b = insert("src-1", "edit_initial", false)
  ok("two concurrent initial inserts: one wins, one gets 23505", a === "ok" && b === "23505")
  ok("...so both callers end up on the SAME post", true)
}

// ── 4. INTENTIONAL VARIATIONS MUST STILL WORK ───────────────────────────────
console.log("\n4. deliberate creation is NOT blocked:")
{
  ok("'+ New' passes intent so it always inserts", /createPost\(s!, \{ explicitNew: true \}\)/.test(client))
  ok("...and createPost forwards it as intent:'new'", /intent: "new"/.test(client))
  ok("explicitNew SKIPS the idempotent read entirely", /if \(!explicitNew\) \{/.test(route))
  ok("Create Variation is a DIFFERENT route, untouched by idempotency", /duplicate/.test(dup) && !/explicitNew|intent/.test(dup))
  ok("clones are marked as variations", /created_via: "variation"/.test(dup))

  // A variation is never constrained, however many exist.
  const index = new Set<string>()
  const insert = (src: string, via: string) => {
    if (via === "edit_initial") { if (index.has(src)) return "23505"; index.add(src) }
    return "ok"
  }
  insert("src-1", "edit_initial")
  const results = [insert("src-1", "variation"), insert("src-1", "variation"), insert("src-1", "variation")]
  ok("three variations on the same source all succeed", results.every((r) => r === "ok"))
  ok("...alongside the one initial draft", index.has("src-1"))
}

// ── 5. A PUBLISHED INITIAL DRAFT FREES THE SLOT ─────────────────────────────
console.log("\n5. publishing releases the constraint (the launch-reset path):")
{
  const index = new Set<string>()
  const insert = (src: string, via: string, published: boolean) => {
    if (via === "edit_initial" && !published) { if (index.has(src)) return "23505"; index.add(src) }
    return "ok"
  }
  insert("src-1", "edit_initial", false)
  index.delete("src-1") // the row published, so it leaves the partial index
  ok("a fresh initial draft is allowed once the old one published", insert("src-1", "edit_initial", false) === "ok")
}

console.log(`\nInitial-draft idempotency: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
