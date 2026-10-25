import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { lowestPrice, priceLabelMode } from "@/lib/social/composePost"
import {
  selectVoiceClips, isClipCompatible, isAutoEligible, normalizePropertyType,
  type VoiceClipMeta, type PropertyFacts, type VoiceMarket,
} from "@/lib/social/voiceLibrary"

/**
 * RECOMMENDED HOOKS AND CTAs for one post.
 *
 * It answers three questions the editor needs and cannot work out for itself: which clips may be
 * applied automatically, which are compatible but make a claim somebody must confirm, and — for
 * the clip currently SELECTED — whether it conflicts with what is actually known about the
 * property.
 *
 * ── IT RECOMMENDS; IT NEVER CHOOSES ─────────────────────────────────────────────────────────
 * Nothing here writes. The editor shows these as suggestions, the person picks, and the pick is
 * saved on the post. A saved selection is never revisited by this route or by the renderer.
 *
 * ── WHERE THE PROPERTY FACTS COME FROM ──────────────────────────────────────────────────────
 *   type    the post's own featured_property_type if set, else social_content.property_type,
 *           which is populated on every content row with exactly the vocabulary the CTAs use.
 *           property_catalog.property_type is NULL on all 4,204 rows and is never consulted.
 *   market  social_content.market
 *   price   social_content.budget_range and price_label_mode — THE PRICE THIS VIDEO DISPLAYS.
 *
 * ── WHY THE DISPLAYED PRICE AND NOT THE CATALOG ─────────────────────────────────────────────
 * property_catalog carries a starting rent for 12 of its 4,204 rows, and for exactly 1 of the
 * 155 properties Social Beast posts about — so checking spoken prices against it refused all 28
 * price hooks on every video but one. budget_range is the number a person verified and typed for
 * this video, and the number its overlay prints. Checking the voiceover against it is both
 * possible and stricter in the way that counts: the voice has to agree with the caption the
 * viewer can read. Nothing here writes to either table.
 */
export const dynamic = "force-dynamic"

function toMarket(market: string | null): VoiceMarket | null {
  switch ((market ?? "").trim()) {
    case "San Antonio": return "SATX"
    case "Dallas": return "DAL"
    case "Houston": return "HOU"
    default: return null  // Austin has no recordings; unknown stays unknown
  }
}

const slim = (c: VoiceClipMeta) => ({
  originalFilename: c.originalFilename, displayName: c.displayName, clipType: c.clipType,
  market: c.market, category: c.category, pricePoint: c.pricePoint, propertyType: c.propertyType,
  ctaKeyword: c.ctaKeyword, eligibility: c.eligibility, requires: c.requires,
  transcript: c.transcript, transcriptStatus: c.transcriptStatus,
})

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { id } = await ctx.params

  const supabase = await createClient()
  const { data: postRow } = await supabase
    .from("social_posts")
    .select("id, voice_hook_id, voice_cta_id, featured_property_type, source_content_id, " +
      "source:source_content_id(property_name, property_type, market, place_id, budget_range, price_label_mode)")
    .eq("id", id)
    .maybeSingle()
  if (!postRow) return NextResponse.json({ error: "not_found" }, { status: 404 })
  // Through `unknown`: featured_property_type is added by a migration the generated types do not
  // know about yet, so PostgREST infers an error shape for the whole row. The same cast the
  // enrichment store uses for exactly this reason.
  const post = postRow as unknown as Record<string, unknown>

  const src = (post.source ?? null) as
    { property_name?: string; property_type?: string; market?: string; place_id?: string
      budget_range?: string | null; price_label_mode?: string | null } | null

  // THE POST'S OWN CHOICE WINS. It is the only place a person can resolve an ambiguous type,
  // and resolving it must not write anything back to the shared catalog.
  const resolvedType = (post.featured_property_type as string | null) ?? normalizePropertyType(src?.property_type ?? null)
  const typeSource = post.featured_property_type ? "this video" : src?.property_type ? "content record" : null

  // THE PRICE THIS VIDEO SHOWS — parsed by the SAME function that builds the overlay line, so
  // the two can never read one figure differently. Null simply means no price was entered, which
  // costs the video its price hooks and nothing else.
  const shownPrice = lowestPrice(src?.budget_range ?? null)
  const priceMode = priceLabelMode(src?.price_label_mode ?? null)

  const facts: PropertyFacts = {
    market: toMarket(src?.market ?? null),
    startingRent: shownPrice,
    priceMode,
    propertyType: resolvedType,
  }

  // The library, classified from filenames + whatever transcripts exist. Clips live in storage;
  // their classification is derived, so this needs no extra table read.
  const { data: rows } = await supabase
    .from("social_voice_clips")
    .select("id, clip_type, name, original_filename, market, category, property_type, price_point, cta_keyword, transcript, transcript_status, eligibility, requires, normalized_storage_path")
  const clips: (VoiceClipMeta & { id: string })[] = (rows ?? [])
    .filter((r) => r.original_filename)
    .map((r) => ({
      id: r.id as string,
      originalFilename: r.original_filename as string,
      displayName: (r.name as string) ?? (r.original_filename as string),
      clipType: r.clip_type as "hook" | "cta",
      market: (r.market as VoiceMarket) ?? "GENERAL",
      category: r.category as never,
      pricePoint: (r.price_point as number) ?? null,
      propertyType: (r.property_type as string) ?? null,
      ctaKeyword: (r.cta_keyword as never) ?? null,
      transcript: (r.transcript as string) ?? null,
      transcriptStatus: (r.transcript_status as "confirmed" | "missing") ?? "missing",
      eligibility: (r.eligibility as never) ?? "universal",
      requires: (r.requires as never) ?? [],
      review: [],
    }))

  const sel = selectVoiceClips(facts, clips)
  const byFile = new Map(clips.map((c) => [c.originalFilename, c.id]))
  const withId = (m: VoiceClipMeta) => ({ ...slim(m), id: byFile.get(m.originalFilename) ?? null })

  // THE WARNING FOR WHAT IS ALREADY CHOSEN. A hard conflict is a factual one — wrong market,
  // a price the rent does not support, the wrong property type. It blocks publishing. A
  // conditional claim is a soft warning: it needs confirming, not correcting.
  const warn = (clipId: string | null) => {
    if (!clipId) return null
    const c = clips.find((x) => x.id === clipId)
    if (!c) return null
    const hard = isClipCompatible(c, facts)
    const auto = isAutoEligible(c, facts)
    if (!hard.ok) return { level: "hard" as const, clip: slim(c), reasons: hard.reasons }
    if (!auto.ok) return { level: "soft" as const, clip: slim(c), reasons: auto.reasons }
    if (c.transcriptStatus !== "confirmed" && (c.pricePoint !== null || c.requires.length > 0)) {
      return { level: "soft" as const, clip: slim(c), reasons: ["this recording has not been transcribed, so its claims have not been checked against what it actually says"] }
    }
    return null
  }

  const hookWarning = warn(post.voice_hook_id as string | null)
  const ctaWarning = warn(post.voice_cta_id as string | null)

  return NextResponse.json({
    property: {
      name: src?.property_name ?? null,
      market: src?.market ?? null, marketCode: facts.market,
      propertyType: resolvedType, propertyTypeSource: typeSource,
      // `startingRent` keeps its name because the editor already reads it; what changed is where
      // it comes from. `startingRentFrom` says so plainly instead of naming a catalog column.
      startingRent: shownPrice, startingRentFrom: shownPrice === null ? null : "this video's displayed price",
      priceMode,
    },
    recommended: {
      hooks: sel.hook ? [{ ...withId(sel.hook.clip), why: sel.hook.why }] : [],
      ctas: sel.cta ? [{ ...withId(sel.cta.clip), why: sel.cta.why }] : [],
    },
    conditional: sel.conditional.map((c) => ({ ...withId(c.clip), why: c.why })),
    rejected: sel.rejected.map((r) => ({ ...withId(r.clip), reasons: r.reasons })),
    warnings: { hook: hookWarning, cta: ctaWarning },
    // The editor disables Publish on this alone, so the rule lives in one place.
    blocksPublish: hookWarning?.level === "hard" || ctaWarning?.level === "hard",
  })
}
