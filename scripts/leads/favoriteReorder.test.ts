/**
 * FAVORITE PROPERTIES — drag to reorder.
 *
 *   npx tsx scripts/leads/favoriteReorder.test.ts
 *
 * Recommended Properties has been draggable for a while; this gives Favorites the same thing by
 * REUSING it rather than copying it. So most of what matters here is negative: the two lists
 * must not share positions, the Top Pick must not move, and every workflow action on a card must
 * still be clickable next to a drag handle.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { sortFavorites, compareFavorites } from "@/lib/leads/favoriteOrder"
import { compareRecommendations, moveItem, positionsFor } from "@/lib/leads/recommendationOrder"

let pass = 0
let fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) } }
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"))

const FAV = read("components/crm/LeadFavorites.tsx")
const BEST = read("components/crm/BestMatches.tsx")
const ROW = read("components/crm/SortableRow.tsx")
const DASH = read("components/crm/DashboardClient.tsx")
const LOADER = read("app/admin/leads/page.tsx")
const MIG = readFileSync(join(process.cwd(), "supabase/migrations/20261107000000_favorite_sort_order.sql"), "utf8")
/** Executable SQL only: `--` comments AND the quoted text a COMMENT ON statement carries. A
 *  column comment that NAMES another table is documentation, not a modification of it, and a raw
 *  scan reads the sentence as the deed. */
const EXEC = MIG.replace(/--[^\n]*/g, "").replace(/'(?:[^']|'')*'/g, "''")

// ── 1. ONE IMPLEMENTATION, NOT TWO ────────────────────────────────────────────────────────────
console.log("the drag handle is shared, not copied:")
ok("a shared SortableRow exists", /export default function SortableRow/.test(ROW))
ok("…with the six-dot grip", (ROW.match(/<circle/g) ?? []).length === 6)
ok("Favorites uses it", /<SortableRow /.test(FAV))
ok("Recommended uses the SAME one", /<SortableRow /.test(BEST))
ok("…and neither defines its own grip any more",
  !/function Grip\(\)/.test(FAV) && !/function Grip\(\)/.test(BEST))
ok("the ordering rule is shared too — favoriteOrder re-exports the comparator",
  compareFavorites === compareRecommendations)
{
  const rows = [
    { id: 3, sort_order: null, created_at: "2026-01-03" },
    { id: 1, sort_order: 2, created_at: "2026-01-01" },
    { id: 2, sort_order: 1, created_at: "2026-01-02" },
  ]
  ok("arranged rows come first, in position order",
    sortFavorites(rows).map((r) => r.id).join(",") === "2,1,3")
  ok("…and an unarranged row keeps its created_at place (NULLS LAST)",
    sortFavorites([{ id: 1, sort_order: null, created_at: "2026-02-01" }, { id: 2, sort_order: null, created_at: "2026-01-01" }])
      .map((r) => r.id).join(",") === "2,1")
  ok("the sort does not mutate its input", (() => { const a = [...rows]; sortFavorites(a); return a.map((r) => r.id).join(",") === "3,1,2" })())
}

// ── 2. THE TWO LISTS ARE INDEPENDENT ──────────────────────────────────────────────────────────
console.log("\nFavorites ordering is independent of Recommended:")
ok("it writes lead_favorites, not lead_recommendations",
  /from\("lead_favorites"\)\.update\(\{ sort_order \}\)/.test(DASH))
ok("…through its own handler", /const handleReorderFavorites = async/.test(DASH))
ok("…separate from the recommendations one", /const handleReorderRecommendations = async/.test(DASH))
ok("the migration adds the column to lead_favorites",
  /alter table public\.lead_favorites\s*\n\s*add column if not exists sort_order integer/.test(MIG))
ok("…and no statement touches lead_recommendations", !/lead_recommendations/.test(EXEC),
  EXEC.split("\n").filter((l) => l.includes("lead_recommendations")).join(" | "))
ok("…the stripper works (the doc comment really does name it)", /lead_recommendations/.test(MIG))

// ── 3. THE TOP PICK DOES NOT MOVE ─────────────────────────────────────────────────────────────
// It is a POINTER on leads, not a position here, so this is structural rather than incidental.
console.log("\nreordering never changes the Top Pick:")
{
  const favHandler = DASH.slice(DASH.indexOf("const handleReorderFavorites"), DASH.indexOf("const handleReorderRecommendations"))
  ok("the handler writes sort_order and nothing else",
    /update\(\{ sort_order \}\)/.test(favHandler) && !/top_pick/.test(favHandler))
  ok("…and never touches the leads table", !/from\("leads"\)/.test(favHandler))
  ok("the drag handler passes positions only, not a pick",
    /onReorder\?\.\(moveItem\(leadFavorites, from, to\)\.map\(\(f: any\) => f\.id\)\)/.test(FAV))
  ok("no statement touches top_pick_favorite_id", !/top_pick_favorite_id/.test(EXEC))
  // Moving the Top Pick to the end must leave it the Top Pick.
  const favs = [{ id: "a" }, { id: "b" }, { id: "c" }]
  const topPick = "a"
  const moved = moveItem(favs, 0, 2).map((f) => f.id)
  ok("a reorder is a pure permutation — same ids, new sequence",
    moved.join(",") === "b,c,a" && [...moved].sort().join(",") === "a,b,c")
  ok(`…and the Top Pick (${topPick}) is still in the list`, moved.includes(topPick))
}

// ── 4. PERSISTENCE ────────────────────────────────────────────────────────────────────────────
console.log("\nthe order survives a refresh:")
ok("the loader reads sort_order first", /\.order\("sort_order", \{ ascending: true, nullsFirst: false \}\)/.test(LOADER))
ok("…then created_at", /\.order\("created_at", \{ ascending: true \}\)/.test(LOADER))
ok("…then id, so the order is total", /\.order\("id", \{ ascending: true \}\)/.test(LOADER))
ok("the column is nullable, so existing favorites keep their place",
  /add column if not exists sort_order integer;/.test(MIG) && !/not null/i.test(EXEC))
ok("an index covers the real per-lead query",
  /create index if not exists lead_favorites_lead_order_idx[\s\S]{0,120}?\(lead_id, sort_order, created_at\)/.test(MIG))
ok("the migration is additive — no drop, no rename, no row writes",
  !/\bdrop\b|\brename\b/i.test(EXEC) && !/^\s*(update|delete|insert)\s/im.test(EXEC))
{
  const ids = ["c", "a", "b"]
  const pos = positionsFor(ids)
  ok("positions are 1-based and in the dragged sequence",
    JSON.stringify(pos) === JSON.stringify([{ id: "c", sort_order: 1 }, { id: "a", sort_order: 2 }, { id: "b", sort_order: 3 }]))
}
ok("the optimistic update re-sorts by the canonical rule", /sortFavorites\(/.test(DASH))
ok("the demo workspace never writes to the database", /isDemoLeadId\(leadId\)\) return/.test(DASH.slice(DASH.indexOf("handleReorderFavorites"), DASH.indexOf("handleReorderRecommendations"))))

// ── 5. THE CARD STILL WORKS ───────────────────────────────────────────────────────────────────
console.log("\nevery existing action survives beside the handle:")
ok("the drag listeners are on the HANDLE, never the row",
  /\{\.\.\.attributes\}[\s\S]{0,80}?\{\.\.\.listeners\}/.test(ROW) && /<button/.test(ROW.slice(ROW.indexOf("{...attributes}") - 300, ROW.indexOf("{...attributes}"))))
ok("a press that does not travel stays a click (5px activation)",
  /activationConstraint: \{ distance: 5 \}/.test(FAV))
ok("touch works without hijacking the page scroll", /touch-none/.test(ROW))
ok("keyboard reordering is supported", /KeyboardSensor/.test(FAV) && /sortableKeyboardCoordinates/.test(FAV))
for (const action of ["Guest Card Sent", "Tour Follow-Up", "Check Application", "Schedule Tour"]) {
  ok(`${action} is still rendered`, readFileSync(join(process.cwd(), "components/crm/LeadFavorites.tsx"), "utf8").includes(action))
}
ok("commission, specials and gift cards still render", /<CommissionBadge /.test(FAV) && /<PromoBadges/.test(FAV))
ok("the card's own classes are unchanged (compact layout preserved)",
  /className="bg-\[var\(--crm-inset\)\] border border-\[var\(--crm-border\)\] rounded-lg px-3 py-2"/.test(FAV))
ok("the key moved to the wrapper, so React still identifies rows",
  /<SortableRow key=\{fav\.id\} id=\{String\(fav\.id\)\}/.test(FAV))

console.log("\nreordering is offered only when it can be saved:")
ok("no handler ⇒ no handles", /const canReorderFavorites = !!onReorder && leadFavorites\.length > 1/.test(FAV))
ok("…and a disabled row renders its children untouched", /if \(!enabled\) return <>\{children\}<\/>/.test(ROW))
ok("a single favorite is not draggable", /leadFavorites\.length > 1/.test(FAV))

console.log(`\nFavorite reorder: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
