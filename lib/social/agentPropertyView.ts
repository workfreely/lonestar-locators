// WHAT AN AGENT MAY SEE ABOUT A PROPERTY — one explicit allowlist.
//
// The goal is that an agent can answer a renter's question without asking the admin. The risk is
// that property_catalog also holds operational and verification material that is none of an
// agent's business. So the safe fields are LISTED, never derived by excluding a few known-bad
// ones: a deny-list silently leaks every column added after it was written, and this table has
// 60+ columns and grows.
//
// Nothing here is a UI preference. The select strings below are what the server asks the database
// for, so a field absent from this module is never fetched, never serialized, and cannot leak
// through a response the interface happens not to render.

/** Columns read from property_catalog for an agent. Anything not here is not fetched. */
export const AGENT_PROPERTY_COLUMNS = [
  "place_id",
  "property_name",
  "city",
  "address",
  "website_url",
  // Unit mix — what a renter asks first.
  "beds_min", "beds_max", "baths_min", "baths_max", "sqft_min", "sqft_max",
  // Pricing, WITH its provenance. A price without a date is a claim; with one it is evidence.
  "rent_min", "rent_max", "pricing_last_verified",
  "studio_starting_rent", "onebr_starting_rent", "twobr_starting_rent",
  "threebr_starting_rent", "fourbr_starting_rent", "fivebr_plus_starting_rent",
  "townhome_starting_rent", "loft_starting_rent", "penthouse_starting_rent",
  // Specials, same rule: the text is useless to an agent without knowing how stale it is.
  "current_special", "current_special_checked_at", "current_special_source",
  "amenity_keywords", "amenities_url",
  // Operational notes a LOCATOR genuinely needs on a tour call. Each is agent-facing by nature:
  // whether they must escort, when they can tour, what the pet rules are, lease lengths, what
  // utilities and internet cost, and whether a deposit alternative exists.
  "escort_notes", "escort_requirement_last_verified",
  "tour_hours_notes", "hours_last_verified",
  "pet_policy_notes", "restricted_breeds_notes", "monthly_pet_rent", "pet_policy_last_verified",
  "lease_term_notes",
  "utility_notes", "internet_notes", "internet_last_verified",
  "deposit_alternative_notes",
] as const

/**
 * NEVER sent to an agent. Kept as a NAMED list purely so the test can assert it stays excluded —
 * the allowlist above is the actual mechanism, and this is a tripwire over it.
 *
 *   verification_notes            internal QA about how a row was checked
 *   affordable_program_*          program eligibility administration
 *   property_image_source*        provenance of our imagery pipeline
 *   source, source_type           where we scraped the row from
 *   rental_home_candidate         internal classification
 *   management_company_website_url  routes an agent around the locator relationship
 */
export const AGENT_PROPERTY_FORBIDDEN = [
  "verification_notes",
  "affordable_program_notes", "affordable_rent_limitation", "affordable_program_last_verified",
  "property_image_source", "property_image_source_detail", "property_image_verified_at",
  "property_image_backup_source", "property_image_backup_source_detail", "property_image_backup_verified_at",
  "source", "source_type",
  "rental_home_candidate",
  "management_company_website_url",
] as const

/**
 * Columns read from social_content for an agent.
 *
 * `notes` is ABSENT on purpose — it is the admin's private working note on the footage, and
 * composePost's SourceMeta already treats it as internal and refuses to emit it into public copy.
 * `original_filename` and `storage_path` are absent too: a filename often carries internal naming,
 * and the path is a media locator that must only ever be resolved through signAgentMedia.
 */
export const AGENT_CONTENT_COLUMNS = [
  "id", "property_name", "display_name", "market", "property_type",
  "budget_range", "special", "amenities", "place_id",
  "duration_s", "available_to_agents",
] as const

/** Columns read from social_posts for an agent's own row. */
export const AGENT_POST_COLUMNS = [
  "id", "source_content_id", "connection_id", "destination", "platform", "status",
  "caption", "hashtags", "scheduled_at", "published_at", "external_post_url",
  "approved_at", "declined_at", "needs_review_at", "needs_review_reason",
  "render_status", "rendered_storage_path",
] as const

/** The agent-facing status vocabulary. Derived, never stored — one function so the library, the
 *  calendar and the details panel always agree on what a row is called. */
export type AgentStatus = "Pending Review" | "Approved" | "Needs Review" | "Skipped" | "Scheduled" | "Published"

export function agentStatusOf(post: {
  approved_at?: string | null
  declined_at?: string | null
  needs_review_at?: string | null
  scheduled_at?: string | null
  published_at?: string | null
} | null | undefined): AgentStatus {
  if (!post) return "Pending Review"
  // Order matters and is the product rule: a published post is done; a stale one needs attention
  // even if it was approved; a skip is final until undone; a schedule outranks a bare approval.
  if (post.published_at) return "Published"
  if (post.declined_at) return "Skipped"
  if (post.needs_review_at) return "Needs Review"
  if (post.scheduled_at) return "Scheduled"
  if (post.approved_at) return "Approved"
  return "Pending Review"
}

/** Comma-joined select string for a Supabase query. */
export const selectOf = (cols: readonly string[]) => cols.join(", ")
