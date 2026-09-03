import type { KnowledgeArticle } from "./schema"

// Deterministic keyword retrieval used by BOTH the Help Center search page and
// (server-side) the Ask Beast endpoint. Transparent keyword matching over the
// user-facing fields — this is help-content search, not a proprietary ranking
// system.

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()
const tokenize = (s: string) => norm(s).split(" ").filter((w) => w.length > 1)

export function scoreArticle(query: string, a: KnowledgeArticle): number {
  const qTokens = Array.from(new Set(tokenize(query)))
  if (qTokens.length === 0) return 0

  const fields: { text: string; weight: number }[] = [
    { text: a.title, weight: 6 },
    { text: a.altPhrasings.join(" "), weight: 5 },
    { text: a.keywords.join(" "), weight: 5 },
    { text: a.shortAnswer, weight: 3 },
    { text: [a.whyItMatters, a.whatItHelpsYouDo, ...(a.steps ?? []), a.troubleshooting ?? ""].join(" "), weight: 1 },
  ]
  const sets = fields.map((f) => ({ set: new Set(tokenize(f.text)), weight: f.weight }))

  let score = 0
  for (const qt of qTokens) {
    for (const f of sets) if (f.set.has(qt)) score += f.weight
  }
  // Boost when the whole query appears verbatim in a high-signal field.
  const nq = norm(query)
  if (nq.length >= 4) {
    if (norm(a.title).includes(nq)) score += 8
    if (a.altPhrasings.some((p) => norm(p).includes(nq))) score += 6
    if (a.keywords.some((k) => norm(k).includes(nq))) score += 4
  }
  return score
}

export function searchArticles(query: string, articles: KnowledgeArticle[], limit = 8): KnowledgeArticle[] {
  return articles
    .map((a) => ({ a, s: scoreArticle(query, a) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, limit)
    .map((x) => x.a)
}
