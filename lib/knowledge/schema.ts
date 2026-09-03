// Shared knowledge base — ONE source of truth for the Help Center and Ask Beast
// AI. Content-as-code for this version: articles are typed objects, so the same
// content renders as browsable Help Center pages AND is retrieved by Ask Beast.
// Update an article once and both surfaces reflect it.
//
// The shape below is deliberately storage-agnostic: it can be moved to a
// database or CMS later without changing the Help Center pages or the Ask Beast
// endpoint, which only depend on the accessors in ./index.
//
// Content rule: every field is written at the USER-FACING level only (what the
// feature does, why it helps you, where to go, what you and your client see,
// what happens next). No internal logic, formulas, thresholds, code, or
// proprietary implementation details ever go in here.

export type ArticleType = "product-guide" | "troubleshooting" | "playbook" | "video"
export type VerificationStatus = "verified" | "needs-review" | "planned" | "locked"
export type PublishStatus = "published" | "draft"

export type KnowledgeArticle = {
  /** Stable unique id (never reused), so a link/reference survives a slug change. */
  id: string
  title: string
  /** Category slug (see ./categories). */
  categorySlug: string
  slug: string
  type: ArticleType

  // Body — the writing pattern. Populate what applies; omit what doesn't.
  shortAnswer: string
  whyItMatters: string
  whatItHelpsYouDo: string
  /** Only when the feature is client-facing. */
  whatClientSees?: string
  steps?: string[]
  whatHappensNext?: string
  rulesOrLimitations?: string[]
  commonMistakes?: string[]
  troubleshooting?: string

  // Retrieval + navigation
  keywords: string[]
  /** Different ways an agent might ask the same thing (helps Ask Beast match). */
  altPhrasings: string[]
  /** Related article slugs (same or other category). */
  relatedArticles?: string[]

  // Media
  /** Link to an existing Beast Academy lesson, when one applies. */
  videoUrl?: string
  /** Text placeholder when a tutorial is planned but not yet available. */
  videoPlaceholder?: string

  // Governance
  lastReviewed: string
  status: PublishStatus
  verification: VerificationStatus
}

/** Canonical URL for an article. Kept in one place so a future storage move
 *  never has to touch the Help Center pages or Ask Beast. */
export function articleUrl(a: Pick<KnowledgeArticle, "categorySlug" | "slug">): string {
  return `/help/${a.categorySlug}/${a.slug}`
}

/** An article is live only when it is BOTH published AND verified. Draft,
 *  needs-review, planned, and locked content never reaches the published Help
 *  Center or Ask Beast retrieval. */
export function isLive(a: KnowledgeArticle): boolean {
  return a.status === "published" && a.verification === "verified"
}
