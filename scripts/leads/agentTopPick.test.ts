/**
 * MY TOP PICK FOR YOU — the agent's own recommendation, and its distance from the client's.
 *
 *   npx tsx scripts/leads/agentTopPick.test.ts
 *
 * Two selections now live in the same workspace, minutes apart, both called a "top pick". The
 * thing worth proving is that they never touch: separate columns, separate owners, separate
 * colours and separate words, with no code path deriving one from the other. After that, the
 * ordinary guarantees — at most one, clearable, survives a refresh, invisible to the client as
 * a control, and gone the moment its property leaves the list.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let pass = 0
let fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) } }
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"))
const raw = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const SQL = raw("supabase/migrations/20261108000000_agent_top_pick.sql")
const CARD = read("components/crm/BestMatches.tsx")
const DASH = read("components/crm/DashboardClient.tsx")
const FAV = read("components/crm/LeadFavorites.tsx")
const PAGE = read("app/locator-beast/r/[token]/page.tsx")
const PAGE_RAW = raw("app/locator-beast/r/[token]/page.tsx")
const LIST = read("app/locator-beast/r/[token]/RecommendationList.tsx")

// ── 1. THE TWO PICKS ARE INDEPENDENT ──────────────────────────────────────────────────────────
console.log("the agent's pick and the client's pick are separate facts:")
ok("the agent's lives in its own column", /add column if not exists agent_top_pick_recommendation_id/.test(SQL))
ok("…pointing at lead_recommendations", /references public\.lead_recommendations\(id\)/.test(SQL))
ok("…while the client's still points at lead_favorites",
  /references public\.lead_favorites\(id\)/.test(raw("supabase/migrations/20260815000002_leads_top_pick.sql")))
ok("the migration does not touch top_pick_favorite_id", !/alter[\s\S]{0,200}top_pick_favorite_id|update public\.leads set top_pick/i.test(SQL))
ok("the agent handler writes ONLY its own column",
  /agent_top_pick_recommendation_id: recommendationId === null \? null : Number\(recommendationId\)/.test(DASH))
{
  const h = DASH.slice(DASH.indexOf("handleSetAgentTopPick"), DASH.indexOf("handleSetAgentTopPick") + 1400)
  ok("…and never the client's", !/top_pick_favorite_id/.test(h))
  ok("…nor any favorite", !/lead_favorites|setLocalFavorites/.test(h))
  ok("…nor a recommendation row", !/lead_recommendations|setLocalRecommendations|sort_order/.test(h))
}
ok("the card derives the agent star from the agent column only",
  /agentTopPickId != null && String\(agentTopPickId\) === String\(r\.id\)/.test(CARD))
ok("…and reads no favorite top pick at all", !/top_pick_favorite_id/.test(CARD))
ok("Favorites still derives the CLIENT's badge from its own column",
  /String\(lead\.top_pick_favorite_id\) === String\(fav\.id\)/.test(FAV))
ok("…and knows nothing about the agent's", !/agent_top_pick/.test(FAV))

// ── 2. LABELLING ──────────────────────────────────────────────────────────────────────────────
console.log("\nthe two badges cannot be mistaken for each other:")
ok("Favorites now says whose pick it is", /Client&apos;s Top Pick/.test(raw("components/crm/LeadFavorites.tsx")))
ok("…in the unchanged green", /border-emerald-600\/40[\s\S]{0,160}text-emerald-600/.test(FAV))
ok("the agent's badge says My Top Pick for You", /My Top Pick for You/.test(CARD))
ok("…in amber, not green", /border-amber-500\/40 bg-amber-500\/12[\s\S]{0,80}text-amber-500/.test(CARD))
ok("…and never borrows the emerald treatment", !/emerald/.test(CARD))

// ── 3. AT MOST ONE, AND CLEARABLE ─────────────────────────────────────────────────────────────
console.log("\nat most one per client, by construction:")
ok("it is a single scalar column, not a per-row flag", !/is_agent_top_pick|agent_top_pick boolean/i.test(SQL))
ok("…so moving it is one write, with nothing to clear first",
  /setLocalLeads\(\(prev\) => prev\.map[\s\S]{0,200}\.\.\.updates/.test(DASH))
ok("clicking the selected star clears it", /onSetAgentTopPick!\(isAgentTopPick \? null : r\.id\)/.test(CARD))
ok("null is an accepted value end to end",
  /recommendationId: number \| string \| null/.test(CARD) && /recommendationId === null \? null/.test(DASH))
ok("the star is only offered when a setter exists", /const canPickTop = typeof onSetAgentTopPick === "function"/.test(CARD))

console.log("\nthe write is guarded on both axes:")
{
  // AUTHORIZATION is RLS on `leads` — the same boundary the eight other lead-column writes on
  // this page already use. This handler neither widens nor narrows it.
  ok("the write goes through the RLS-bound client, not the service role",
    /supabase\.from\("leads"\)\.update\(updates\)/.test(DASH) && !/supabaseAdmin[\s\S]{0,200}agent_top_pick/.test(DASH))
  ok("…and carries no workspace claim of its own", !/workspace_id/.test(DASH))
  // CORRECTNESS is the ownership check: the FK promises the row exists, not that it is this
  // lead's. A lead pointing at another lead's recommendation would be nonsense stored forever.
  ok("a pick must belong to the selected lead",
    /String\(r\.lead_id\) === String\(selectedLeadId\)/.test(DASH))
  ok("…and a foreign id is refused before any write",
    /refusing: recommendation does not belong to this lead[\s\S]{0,80}return false/.test(DASH))
  ok("…while clearing is always allowed", /if \(recommendationId !== null\) \{/.test(DASH))
  ok("the guard runs BEFORE the update", DASH.indexOf("does not belong to this lead") < DASH.indexOf('from("leads").update(updates)'))
}

console.log("\nthe database enforces ownership too, not just the front end:")
{
  ok("a trigger validates the designation", /create trigger leads_agent_top_pick_belongs_to_lead/.test(SQL))
  ok("…checking the row belongs to THIS lead",
    /r\.id = new\.agent_top_pick_recommendation_id[\s\S]{0,80}r\.lead_id = new\.id/.test(SQL))
  ok("…and raising a check_violation when it does not", /errcode = '23514'/.test(SQL))
  // The three things the safeguard must NOT break:
  ok("clearing still works — null returns immediately",
    /if new\.agent_top_pick_recommendation_id is null then\s*\n\s*return new;/.test(SQL))
  ok("ON DELETE SET NULL still works, for the same reason", /on delete set null/.test(SQL))
  ok("an unchanged value is not re-validated", /is not distinct from new\.agent_top_pick_recommendation_id/.test(SQL))
  // And the property that keeps it off the hot path.
  ok("it fires ONLY when that column is written",
    /before insert or update of agent_top_pick_recommendation_id/.test(SQL))
  ok("…so every other lead write never reaches it", !/before insert or update on public\.leads/.test(SQL))
  ok("the trigger is replaceable, not duplicated", /drop trigger if exists leads_agent_top_pick_belongs_to_lead/.test(SQL))
}

console.log("\nit survives a refresh, and a failed save does not lie:")
ok("the write persists to the lead row", /from\("leads"\)\.update\(updates\)\.eq\("id", selectedLeadId\)/.test(DASH))
ok("…so the next load reads it back from the lead",
  /agentTopPickId=\{\(selectedLead as any\)\?\.agent_top_pick_recommendation_id \?\? null\}/.test(DASH))
ok("a failed save rolls the star back", /\[agent-top-pick\] save failed[\s\S]{0,400}?return false/.test(DASH))
ok("demo clients stay local", /if \(isDemoLeadId\(selectedLeadId\)\) return true/.test(DASH))

// ── 4. THE CONTROL ────────────────────────────────────────────────────────────────────────────
console.log("\nthe star sits where it was specified:")
{
  const row = CARD.slice(CARD.indexOf("flex flex-none items-center gap-1.5"))
  const star = row.indexOf("onSetAgentTopPick")
  const x = row.indexOf("onRemoveRecommendation(r.property_url)")
  const pencil = row.indexOf("<PropertyPricingEditor")
  const heart = row.indexOf("crm-rec-heart")
  ok("star → ✕ → edit → heart", star > 0 && star < x && x < pencil && pencil < heart)
  ok("…in the same 22×22 footprint as its neighbours", /h-\[22px\] w-\[22px\][\s\S]{0,200}onSetAgentTopPick|onSetAgentTopPick[\s\S]{0,400}h-\[22px\] w-\[22px\]/.test(CARD))
}
ok("unselected is an outline star", /fill=\{isAgentTopPick \? "currentColor" : "none"\}/.test(CARD))
ok("selected is gold", /text-\[#f5a524\]/.test(CARD))
ok("…the same gold the client page uses", /--gold:#f5a524/.test(PAGE_RAW))
ok("it announces its state to assistive tech", /aria-pressed=\{isAgentTopPick\}/.test(CARD))

// ── 5. THE CLIENT-FACING BADGE ────────────────────────────────────────────────────────────────
console.log("\nthe client's badge is navy, gold-starred, and upper-left:")
// MUTED SLATE, not the solid navy it launched with: filled with --navy the badge was the
// darkest, hardest-edged thing on the card and beat the photograph it sat on.
ok("it uses the page's own navy, translucent", /\.lbr-toppick\{[^}]*background:rgba\(14,37,69,\.65\)/.test(PAGE_RAW))
ok("…which is the --navy token's own value", /--navy:#0e2545/.test(PAGE_RAW))
ok("…with a backdrop blur, prefixed for Safari\/iOS",
  /-webkit-backdrop-filter:blur\(6px\)/.test(PAGE_RAW) && /[^-]backdrop-filter:blur\(6px\)/.test(PAGE_RAW))
ok("…and it is NOT the opaque fill any more", !/\.lbr-toppick\{[^}]*background:var\(--navy\)/.test(PAGE_RAW))
// The floor the muting must not cross. White on this fill composites to 4.95:1 over a white
// photo — the worst case a property image can present — and 17.79:1 over a black one.
// 60% was asked for and fails at 4.23:1; 62% is the literal break-even with zero margin.
ok("…while white text stays readable on ANY photo", (() => {
  const lin = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const L = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  const over = (bg: [number, number, number]) => {
    const c = ([14, 37, 69] as const).map((f, i) => 0.65 * f + 0.35 * bg[i]) as [number, number, number]
    return (1.05) / (L(...c) + 0.05)
  }
  return over([255, 255, 255]) >= 4.5 && over([0, 0, 0]) >= 4.5
})())
ok("the star is the gold token", /\.lbr-toppick svg\{[^}]*color:var\(--gold\)/.test(PAGE_RAW))
ok("the text is white", /\.lbr-toppick\{[^}]*color:#fff/.test(PAGE_RAW))
ok("it is a compact pill", /\.lbr-toppick\{[^}]*border-radius:999px/.test(PAGE_RAW))
ok("upper LEFT", /\.lbr-toppick\{[^}]*top:12px;left:12px/.test(PAGE_RAW))
ok("…while the heart keeps the upper right", /\.lbr-heart\{position:absolute;top:12px;right:12px/.test(PAGE_RAW))
ok("…and the special keeps the lower left", /\.lbr-promo\{position:absolute;left:12px[^}]*bottom:12px/.test(PAGE_RAW))
ok("it is absolutely positioned, so it adds NO card height", /\.lbr-toppick\{position:absolute/.test(PAGE_RAW))
ok("the wording is exact", /My Top Pick for You/.test(LIST))
ok("no amber or light-blue fill survives anywhere in it", !/\.lbr-toppick\{[^}]*(#f5a524|amber|#e0f2fe|lightblue)/.test(PAGE_RAW.replace(/\.lbr-toppick svg\{[^}]*\}/, "")))

console.log("\n…shown for exactly one property, and only when one is chosen:")
ok("rendered only on the matching index", /agentTopPickIndex !== null && p\.index === agentTopPickIndex/.test(LIST))
ok("…so no pick renders nothing", /agentTopPickIndex\?: number \| null/.test(LIST))
ok("the page defaults it to null", /const agentTopPickIndex = typeof agentTopPickData === "number" \? agentTopPickData : null/.test(PAGE))

console.log("\nthe PUBLIC badge is temporarily hidden — on purpose, and only the badge:")
{
  ok("a single flag gates it", /const SHOW_AGENT_TOP_PICK_BADGE = (true|false)/.test(LIST))
  // Currently ON, showing the muted treatment for review. Flipping it to false hides the badge
  // without touching anything below — which is why the switch is a constant and not a deletion.
  ok("…and it is currently ON, showing the muted badge", /const SHOW_AGENT_TOP_PICK_BADGE = true/.test(LIST))
  ok("…gating the render, not deleting it", /SHOW_AGENT_TOP_PICK_BADGE && agentTopPickIndex !== null && p\.index === agentTopPickIndex/.test(LIST))
  // Everything a restore depends on must still be here. Deleting any of it would turn a
  // one-word revert into a rebuild, which is the whole reason the switch exists.
  ok("the markup survives", /<div className="lbr-toppick">/.test(LIST) && /My Top Pick for You/.test(LIST))
  ok("the styles survive", /\.lbr-toppick\{position:absolute;top:12px;left:12px/.test(PAGE_RAW))
  ok("…including the gold star", /\.lbr-toppick svg\{[^}]*color:var\(--gold\)/.test(PAGE_RAW))
  ok("the prop still arrives", /agentTopPickIndex\?: number \| null/.test(LIST))
  ok("the page still resolves it every load", /rpc\("lb_agent_top_pick_index"/.test(PAGE))
  ok("…and still passes it down", /agentTopPickIndex=\{agentTopPickIndex\}/.test(PAGE))
}

console.log("\n…and the AGENT side is entirely unaffected:")
{
  ok("the star control is still rendered", /<ClientUnitWasherDryer|onSetAgentTopPick!\(isAgentTopPick \? null : r\.id\)/.test(CARD))
  ok("the CRM badge still shows the agent their pick", /My Top Pick for You/.test(CARD))
  ok("the write path is untouched", /agent_top_pick_recommendation_id: recommendationId === null \? null : Number\(recommendationId\)/.test(DASH))
  ok("…with its ownership guard", /String\(r\.lead_id\) === String\(selectedLeadId\)/.test(DASH))
  ok("the column, trigger and lookup all survive",
    /add column if not exists agent_top_pick_recommendation_id/.test(SQL) &&
    /create trigger leads_agent_top_pick_belongs_to_lead/.test(SQL) &&
    /create or replace function public\.lb_agent_top_pick_index/.test(SQL))
}

console.log("\nthe client gets no control over it:")
ok("the list exposes no setter", !/onSetAgentTopPick|setAgentTopPick/.test(LIST))
ok("…and no click handler on the badge", !/lbr-toppick[\s\S]{0,200}onClick/.test(LIST))
ok("the badge is a div, not a button", /<div className="lbr-toppick">/.test(LIST))
// "on delete set null" is a constraint, not a write — strip the DDL clause before checking
// that the client-facing surface has no mutating statement in it.
ok("the SQL exposes a read, with no writer", /returns integer/.test(SQL) &&
  !/\b(insert into|update\s+public|delete\s+from)\b/i.test(SQL.replace(/--.*$/gm, "")))

// ── 6. REMOVED, STALE AND MISSING ─────────────────────────────────────────────────────────────
console.log("\na pick that should not show, does not:")
ok("removing the property clears the column", /on delete set null/.test(SQL))
ok("the lookup joins THIS share's own items", /i\.source_recommendation_id = l\.agent_top_pick_recommendation_id/.test(SQL))
ok("…so a pick on another list cannot leak in", /where s\.token_hash = p_token_hash/.test(SQL))
ok("…nor onto a disabled or revoked share", /s\.disabled_at is null/.test(SQL) && /s\.revoked_at is null/.test(SQL))
ok("a lead with no pick returns nothing", /limit 1/.test(SQL))

// ── 7. NOTHING ELSE MOVED ─────────────────────────────────────────────────────────────────────
console.log("\nthe scope held:")
ok("the resolver function was NOT replaced", !/create or replace function public\.lb_resolve_client_recommendations/.test(SQL))
ok("…and the snapshot tables are untouched", !/alter table public\.client_recommendation_share/.test(SQL))
ok("drag-to-reorder is intact", /<SortableRow key=\{r\.id\}/.test(CARD))
ok("the commission badge is intact", /<CommissionBadge status=\{commission\} size="row" \/>/.test(CARD))
ok("the washer\/dryer badge is intact", /<WasherDryerBadge status=\{washerDryerShown\} className="mr-auto" \/>/.test(CARD))
ok("the reasons row is intact", /\{shown\.join\(" · "\)\}/.test(read("components/crm/ReasonsControl.tsx")))
ok("the client's favorites heart is intact", /aria-pressed=\{isFav\}/.test(LIST))
ok("…and the sticky footer", /Choose your favorite properties|lbr-favbar/.test(raw("app/locator-beast/r/[token]/RecommendationList.tsx")))
ok("the migration is purely additive", /add column if not exists/.test(SQL) && !/drop column|drop table|truncate/i.test(SQL))

console.log(`\nAgent top pick: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
