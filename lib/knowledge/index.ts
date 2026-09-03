// Public entry point for the shared knowledge base. The Help Center pages and
// the Ask Beast endpoint import ONLY from here, so a future move to a database
// or CMS changes just these accessors — not the pages or the assistant.

import { GETTING_STARTED_ARTICLES } from "./articles/gettingStarted"
import { LEADS_ARTICLES } from "./articles/leads"
import { AGENDA_ARTICLES } from "./articles/agenda"
import { SMART_LEAD_FORM_ARTICLES } from "./articles/smartLeadForm"
import { TROUBLESHOOTING_ARTICLES } from "./articles/troubleshooting"
import { CATEGORIES, getCategory, type HelpCategory } from "./categories"
import { isLive, type KnowledgeArticle } from "./schema"

export * from "./schema"
export { CATEGORIES, getCategory } from "./categories"
export type { HelpCategory } from "./categories"
export { searchArticles, scoreArticle } from "./search"

const ALL: KnowledgeArticle[] = [
  ...GETTING_STARTED_ARTICLES,
  ...LEADS_ARTICLES,
  ...AGENDA_ARTICLES,
  ...SMART_LEAD_FORM_ARTICLES,
  ...TROUBLESHOOTING_ARTICLES,
]

/** All entries regardless of status — for internal review tooling only. */
export const ALL_ARTICLES: KnowledgeArticle[] = ALL

/** The ONLY articles shown in the Help Center and retrieved by Ask Beast:
 *  published AND verified. Drafts, needs-review, planned, and locked never ship. */
export const LIVE_ARTICLES: KnowledgeArticle[] = ALL.filter(isLive)

export function getLiveArticle(categorySlug: string, slug: string): KnowledgeArticle | undefined {
  return LIVE_ARTICLES.find((a) => a.categorySlug === categorySlug && a.slug === slug)
}
export function getLiveArticleBySlug(slug: string): KnowledgeArticle | undefined {
  return LIVE_ARTICLES.find((a) => a.slug === slug)
}
export function liveArticlesInCategory(categorySlug: string): KnowledgeArticle[] {
  return LIVE_ARTICLES.filter((a) => a.categorySlug === categorySlug)
}
export function categoryHasLiveContent(categorySlug: string): boolean {
  return LIVE_ARTICLES.some((a) => a.categorySlug === categorySlug)
}

/** Categories in display order, each tagged with whether it currently has live
 *  content (so the Help Center can show "Coming soon" instead of an empty list). */
export function categoriesWithStatus(): (HelpCategory & { live: boolean; count: number })[] {
  return [...CATEGORIES]
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ ...c, live: categoryHasLiveContent(c.slug), count: liveArticlesInCategory(c.slug).length }))
}

/** Resolve related-article slugs to their live articles (drops any not live). */
export function resolveRelated(slugs: string[] | undefined): KnowledgeArticle[] {
  if (!slugs) return []
  return slugs.map((s) => getLiveArticleBySlug(s)).filter((a): a is KnowledgeArticle => !!a)
}

export { getCategory as getHelpCategory }
