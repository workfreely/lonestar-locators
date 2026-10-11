export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { requireSocialAgent } from "@/lib/auth/requireSocialAgent"
import {
  AGENT_CONTENT_COLUMNS, AGENT_POST_COLUMNS, AGENT_PROPERTY_COLUMNS,
  agentStatusOf, selectOf,
} from "@/lib/social/agentPropertyView"

// GET → the read-only property details panel for ONE shared video.
//
// Everything an agent needs to answer a renter without calling the admin: the property, its unit
// mix, verified pricing and specials WITH their verification dates, amenities, the caption that
// will go out, and this agent's own posting state.
//
// READ ONLY, and allowlisted at the QUERY. The columns come from agentPropertyView, so a field
// that is not agent-safe is never fetched — it cannot leak through a response shape, a log line,
// or an interface that happens to render an unexpected key.
export async function GET(_req: Request, ctx: { params: Promise<{ contentId: string }> }) {
  const guard = await requireSocialAgent()
  if (!guard.ok) return guard.response
  const { supabase, connectionIds, ownerUserIds } = guard
  const { contentId } = await ctx.params

  // THE SHARE SWITCH IS PART OF THE LOOKUP, not a check performed afterwards. A video the admin
  // has withdrawn is indistinguishable from one that never existed.
  const { data, error } = await supabase
    .from("social_content")
    .select(selectOf(AGENT_CONTENT_COLUMNS))
    .eq("id", contentId)
    .eq("available_to_agents", true)
    .in("owner_user_id", ownerUserIds)
    .maybeSingle()
  if (error) return NextResponse.json({ error: "lookup_failed" }, { status: 500 })
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const content = data as unknown as Record<string, unknown>

  let property: Record<string, unknown> | null = null
  if (content.place_id) {
    const { data: prop } = await supabase
      .from("property_catalog")
      .select(selectOf(AGENT_PROPERTY_COLUMNS))
      .eq("place_id", content.place_id)
      .maybeSingle()
    property = (prop as unknown as Record<string, unknown>) ?? null
  }

  // This agent's own row only. Another agent's caption, schedule or decision for the same video
  // is not reachable from here — connection_id is the boundary.
  const { data: postRow } = await supabase
    .from("social_posts")
    .select(selectOf(AGENT_POST_COLUMNS))
    .eq("source_content_id", contentId)
    .in("connection_id", connectionIds)
    .maybeSingle()
  const post = (postRow as unknown as Record<string, unknown>) ?? null

  return NextResponse.json({
    contentId,
    property: property && {
      name: property.property_name, city: property.city, address: property.address,
      website: property.website_url,
      beds: { min: property.beds_min, max: property.beds_max },
      baths: { min: property.baths_min, max: property.baths_max },
      sqft: { min: property.sqft_min, max: property.sqft_max },
      pricing: {
        rentMin: property.rent_min, rentMax: property.rent_max,
        // Each tier is shown WITH the one date that says how much to trust all of them.
        byType: {
          studio: property.studio_starting_rent, oneBr: property.onebr_starting_rent,
          twoBr: property.twobr_starting_rent, threeBr: property.threebr_starting_rent,
          fourBr: property.fourbr_starting_rent, fivePlusBr: property.fivebr_plus_starting_rent,
          townhome: property.townhome_starting_rent, loft: property.loft_starting_rent,
          penthouse: property.penthouse_starting_rent,
        },
        lastVerified: property.pricing_last_verified,
      },
      special: {
        text: property.current_special,
        checkedAt: property.current_special_checked_at,
        source: property.current_special_source,
      },
      amenities: property.amenity_keywords, amenitiesUrl: property.amenities_url,
      // Operational answers a locator is asked on a tour call.
      notes: {
        escort: property.escort_notes, escortVerified: property.escort_requirement_last_verified,
        tourHours: property.tour_hours_notes, hoursVerified: property.hours_last_verified,
        petPolicy: property.pet_policy_notes, restrictedBreeds: property.restricted_breeds_notes,
        monthlyPetRent: property.monthly_pet_rent, petPolicyVerified: property.pet_policy_last_verified,
        leaseTerms: property.lease_term_notes,
        utilities: property.utility_notes, internet: property.internet_notes,
        internetVerified: property.internet_last_verified,
        depositAlternative: property.deposit_alternative_notes,
      },
    },
    video: {
      propertyType: content.property_type, market: content.market,
      durationSeconds: content.duration_s,
      adminSpecial: content.special, adminBudgetRange: content.budget_range,
    },
    posting: post && {
      postId: post.id, destination: post.destination, platform: post.platform,
      caption: post.caption, hashtags: post.hashtags,
      scheduledAt: post.scheduled_at, publishedAt: post.published_at,
      externalUrl: post.external_post_url,
      status: agentStatusOf(post as never),
      needsReviewReason: post.needs_review_reason,
    },
  })
}
