// APPLY THE VERIFIED GEOGRAPHIC MANIFEST — metadata-only, one column set, nothing else.
//
// Run:  npx tsx scripts/social/applyGeoManifest.ts            (DRY RUN — reports, writes nothing)
//       npx tsx scripts/social/applyGeoManifest.ts --apply    (writes)
//
// ── WHY THIS IS NOT THE EDITOR'S SAVE DRAFT ─────────────────────────────────────────────────
// Save Draft sends the whole post back: caption, headline, hashtags, overlay template, price,
// amenities, cover offset. That is the correct behaviour for a human editing a post and the wrong
// behaviour for a geography fix, because every one of those fields becomes a write that has to be
// trusted not to differ. This writer touches three columns on social_content and NOTHING on
// social_posts, so the marketing fields are not preserved by care — they are never addressed.
//
// ── THE SEVEN GATES, IN ORDER ───────────────────────────────────────────────────────────────
//  1. The revision triggers must be installed and enabled, or nothing runs. History is what makes
//     this reversible, so its absence is a hard stop rather than a warning.
//  2. Each property name must resolve to EXACTLY ONE research record, and that record's place_id
//     must pass the shape check and resolve to content owned by the same owner. A name that is
//     ambiguous or an id that is malformed, truncated or unknown stops that entry.
//  3. Every target row's complete before-state is captured, column by column.
//  4. Only the columns whose value actually differs are sent. A no-op is skipped, so it writes no
//     revision and does not touch updated_at.
//  5. The update is conditional on the values just read (an optimistic-concurrency filter). If
//     anything moved underneath us — another session, the editor, a parallel script — the update
//     matches zero rows and the entry is reported as a conflict rather than silently winning.
//  6. The patch is built from a THREE-KEY allowlist. `market` additionally requires marketApproved
//     on the entry, so a market can never ride along with a neighbourhood fix.
//  7. Afterwards every row is re-read in full and diffed against its before-state. Any column
//     outside the allowlist that moved is reported as a failure, not a footnote. social_posts and
//     social_property_research are snapshotted whole and must come back byte-identical.

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { GEO_MANIFEST, FLAGGED, type GeoEntry } from "./geoManifest"
import { checkPlaceIdShape, resolvePlaceId } from "@/lib/social/placeIdentity"

const APPLY = process.argv.includes("--apply")

// The ONLY columns this script may ever write.
const ALLOWED = ["market", "area_neighborhood", "district"] as const
type Allowed = (typeof ALLOWED)[number]

function client(): SupabaseClient {
  const env = Object.fromEntries(
    readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]))
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL as string, env.SUPABASE_SERVICE_ROLE_KEY as string)
}

const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16)
const norm = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v))

type Row = Record<string, unknown>
type Outcome = {
  property: string; contentId: string; postIds: string[]; statuses: string[]
  before: Partial<Record<Allowed, string | null>>
  after: Partial<Record<Allowed, string | null>>
  changed: Allowed[]
  result: "written" | "dry-run" | "no-op" | "skipped" | "conflict" | "failed"
  note?: string
}

async function main() {
  const sb = client()
  const log: string[] = []
  const say = (s: string) => { console.log(s); log.push(s) }

  say(`\n${"=".repeat(78)}\nGEOGRAPHIC ENRICHMENT — ${APPLY ? "APPLY" : "DRY RUN (no writes)"}\n${"=".repeat(78)}`)

  // ── GATE 1 — revision history must be live ────────────────────────────────────────────────
  // pg_trigger is not reachable over PostgREST, so the proof is produced by psql against the
  // pooler and handed in as TRIGGER_PROOF. That is deliberate: the check reads the LIVE catalog
  // rather than the migration ledger, which has been stale in this project before.
  const proofPath = process.env.TRIGGER_PROOF
  if (!proofPath) { console.error("✗ STOP — TRIGGER_PROOF not set; run via scripts/social/applyGeo.sh"); process.exit(1) }
  const triggers = JSON.parse(readFileSync(proofPath, "utf8").trim() || "[]") as
    { table: string; tgname: string; enabled: string }[]
  const need = ["social_content", "social_property_research"]
  const live = need.filter((t) => triggers.some((r) => r.table === t && r.enabled === "O"))
  if (live.length !== need.length) {
    say(`\n✗ STOP — revision triggers not enabled on: ${need.filter((n) => !live.includes(n)).join(", ")}`)
    say(`  (read ${triggers.length} trigger rows from the live catalog)`)
    process.exit(1)
  }
  say(`\n✓ gate 1 — revision triggers live on ${live.join(", ")} (${triggers.length} triggers in the catalog)`)

  // ── WHOLE-TABLE SNAPSHOTS, for gate 7 ─────────────────────────────────────────────────────
  const snap = async (table: string, cols: string) => {
    const { data, error } = await sb.from(table).select(cols).order("id")
    if (error) throw error
    return data as Row[]
  }
  const postsBefore = await snap("social_posts", "*")
  const researchBefore = await snap("social_property_research", "*")
  const contentBefore = await snap("social_content", "*")
  say(`✓ snapshots — content ${contentBefore.length} rows, posts ${postsBefore.length} rows, research ${researchBefore.length} rows`)

  const { data: revCountBefore } = await sb.from("social_revisions").select("id", { count: "exact", head: true })
  void revCountBefore
  const revBefore = (await sb.from("social_revisions").select("id")).data?.length ?? 0

  // ── research + content indexes ────────────────────────────────────────────────────────────
  const research = (await sb.from("social_property_research").select("owner_user_id, place_id, property_name")).data ?? []
  const allPlaceIds = new Set((contentBefore.map((c) => c.place_id).filter(Boolean)) as string[])
  const postsByContent = new Map<string, Row[]>()
  for (const p of postsBefore) {
    const k = p.source_content_id as string
    if (!postsByContent.has(k)) postsByContent.set(k, [])
    postsByContent.get(k)!.push(p)
  }

  const outcomes: Outcome[] = []

  for (const entry of GEO_MANIFEST) {
    // ── GATE 2 — exactly one research record, and a complete owner-scoped place_id ──────────
    const matches = research.filter((r) => r.property_name === entry.property)
    if (matches.length !== 1) {
      outcomes.push({ property: entry.property, contentId: "-", postIds: [], statuses: [], before: {}, after: {},
        changed: [], result: "failed", note: matches.length === 0 ? "no_match_for_name" : `ambiguous_name (${matches.length})` })
      continue
    }
    const rec = matches[0] as { owner_user_id: string; place_id: string }

    const shape = checkPlaceIdShape(rec.place_id)
    if (!shape.ok) {
      outcomes.push({ property: entry.property, contentId: "-", postIds: [], statuses: [], before: {}, after: {},
        changed: [], result: "failed", note: `place_id ${shape.reason}` })
      continue
    }
    const ownedMine = new Set(contentBefore.filter((c) => c.owner_user_id === rec.owner_user_id)
      .map((c) => c.place_id).filter(Boolean) as string[])
    const identity = resolvePlaceId({ ownerUserId: rec.owner_user_id, placeId: rec.place_id,
      ownedPlaceIds: ownedMine, allPlaceIds })
    if (!identity.ok) {
      outcomes.push({ property: entry.property, contentId: "-", postIds: [], statuses: [], before: {}, after: {},
        changed: [], result: "failed", note: `${identity.reason}: ${identity.message}` })
      continue
    }

    const rows = contentBefore.filter((c) => c.place_id === rec.place_id && c.owner_user_id === rec.owner_user_id)

    for (const row of rows) {
      const contentId = row.id as string
      const posts = postsByContent.get(contentId) ?? []
      const statuses = posts.map((p) => String(p.status))
      const nonDraft = statuses.filter((s) => s !== "draft")

      // ── GATE 3 — the complete before-state of the three columns ──────────────────────────
      const before: Partial<Record<Allowed, string | null>> = {
        market: norm(row.market), area_neighborhood: norm(row.area_neighborhood), district: norm(row.district),
      }

      // A published or ready post holds this video back unless the operator named it.
      if (nonDraft.length > 0 && !entry.publishedApproved) {
        outcomes.push({ property: entry.property, contentId, postIds: posts.map((p) => String(p.id)), statuses,
          before, after: before, changed: [], result: "skipped",
          note: `carries a ${[...new Set(nonDraft)].join("/")} post — held` })
        continue
      }

      // ── GATE 6 — the patch is built from the allowlist, and market needs its own approval ──
      const target: Partial<Record<Allowed, string | null>> = { ...before }
      if (entry.area !== null) target.area_neighborhood = entry.area
      if (entry.district !== null) target.district = entry.district
      if (entry.market) {
        if (!entry.marketApproved) {
          outcomes.push({ property: entry.property, contentId, postIds: posts.map((p) => String(p.id)), statuses,
            before, after: before, changed: [], result: "failed", note: "market change without marketApproved" })
          continue
        }
        target.market = entry.market
      }

      // ── GATE 4 — no-ops are not written ──────────────────────────────────────────────────
      const changed = ALLOWED.filter((k) => norm(before[k]) !== norm(target[k]))
      if (changed.length === 0) {
        outcomes.push({ property: entry.property, contentId, postIds: posts.map((p) => String(p.id)), statuses,
          before, after: before, changed: [], result: "no-op" })
        continue
      }
      const patch: Record<string, string | null> = {}
      for (const k of changed) patch[k] = target[k] ?? null
      if (Object.keys(patch).some((k) => !(ALLOWED as readonly string[]).includes(k))) {
        throw new Error(`REFUSED — patch for ${entry.property} contains a column outside the allowlist`)
      }

      if (!APPLY) {
        outcomes.push({ property: entry.property, contentId, postIds: posts.map((p) => String(p.id)), statuses,
          before, after: target, changed, result: "dry-run" })
        continue
      }

      // ── GATE 5 — conditional on the values just read ─────────────────────────────────────
      let q = sb.from("social_content").update(patch).eq("id", contentId).eq("owner_user_id", rec.owner_user_id)
      for (const k of changed) {
        const v = before[k]
        q = v === null ? q.is(k, null) : q.eq(k, v)
      }
      const { data: updated, error } = await q.select("id")
      if (error) {
        outcomes.push({ property: entry.property, contentId, postIds: posts.map((p) => String(p.id)), statuses,
          before, after: target, changed, result: "failed", note: error.message })
        continue
      }
      if (!updated || updated.length !== 1) {
        outcomes.push({ property: entry.property, contentId, postIds: posts.map((p) => String(p.id)), statuses,
          before, after: target, changed, result: "conflict",
          note: "the row changed underneath this read — nothing written" })
        continue
      }
      outcomes.push({ property: entry.property, contentId, postIds: posts.map((p) => String(p.id)), statuses,
        before, after: target, changed, result: "written" })
    }
  }

  // ── REPORT ────────────────────────────────────────────────────────────────────────────────
  const by = (r: Outcome["result"]) => outcomes.filter((o) => o.result === r)
  say(`\n${"-".repeat(78)}\nPER-RECORD MANIFEST\n${"-".repeat(78)}`)
  for (const o of outcomes.filter((x) => x.changed.length > 0 || x.result === "skipped")) {
    const tag = o.result === "written" ? "WROTE" : o.result === "dry-run" ? "would" : o.result.toUpperCase()
    say(`\n${tag}  ${o.property}`)
    say(`      content ${o.contentId}   post ${o.postIds.join(", ") || "(none)"}   [${o.statuses.join(",") || "no post"}]`)
    for (const k of (o.changed.length ? o.changed : ALLOWED)) {
      if (o.changed.length === 0) continue
      say(`      ${k}: ${JSON.stringify(o.before[k])} → ${JSON.stringify(o.after[k])}`)
    }
    if (o.note) say(`      note: ${o.note}`)
  }

  // ── GATE 7 — nothing outside the allowlist moved ──────────────────────────────────────────
  if (APPLY) {
    const contentAfter = await snap("social_content", "*")
    const postsAfter = await snap("social_posts", "*")
    const researchAfter = await snap("social_property_research", "*")
    const beforeById = new Map(contentBefore.map((r) => [r.id as string, r]))
    const leaks: string[] = []
    for (const a of contentAfter) {
      const b = beforeById.get(a.id as string)
      if (!b) { leaks.push(`new content row ${a.id}`); continue }
      for (const k of Object.keys(a)) {
        if ((ALLOWED as readonly string[]).includes(k) || k === "updated_at") continue
        if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) leaks.push(`${a.property_name} .${k}`)
      }
    }
    say(`\n${"-".repeat(78)}\nGATE 7 — NOTHING ELSE MOVED\n${"-".repeat(78)}`)
    say(`  social_content, columns outside the allowlist: ${leaks.length === 0 ? "✓ none changed" : "✗ " + leaks.join(", ")}`)
    say(`  social_posts   whole-table hash: ${sha(postsBefore)} → ${sha(postsAfter)}  ${sha(postsBefore) === sha(postsAfter) ? "✓ identical" : "✗ CHANGED"}`)
    say(`  research       whole-table hash: ${sha(researchBefore)} → ${sha(researchAfter)}  ${sha(researchBefore) === sha(researchAfter) ? "✓ identical" : "✗ CHANGED"}`)
    const revAfter = (await sb.from("social_revisions").select("id")).data?.length ?? 0
    say(`  revisions: ${revBefore} → ${revAfter}  (+${revAfter - revBefore}, expected +${by("written").length})`)
  }

  say(`\n${"-".repeat(78)}\nTOTALS\n${"-".repeat(78)}`)
  for (const r of ["written", "dry-run", "no-op", "skipped", "conflict", "failed"] as const) {
    if (by(r).length) say(`  ${r.padEnd(10)} ${by(r).length}`)
  }
  say(`  properties in manifest: ${GEO_MANIFEST.length}   flagged (never written): ${FLAGGED.length}`)
  if (by("failed").length || by("conflict").length) process.exitCode = 1
}

void main().catch((e) => { console.error(e); process.exit(1) })
