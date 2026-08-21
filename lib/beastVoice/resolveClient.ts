import type { ClientMatch } from "./types"

// Match a spoken name against the leads ALREADY loaded in the board's memory.
// Pure and offline — no query, no fetch, no Supabase. Beast Voice can therefore
// only ever act on leads the locator can already see.
//
// Never guesses: tiers are tried strongest-first and the FIRST tier that matches
// anything wins. If that tier holds more than one lead the caller is told to ask,
// because picking "the best of two Marias" is exactly the kind of silent wrong
// action a voice command must not take.

function normalize(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // fold accents: recognizers rarely emit them
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function fullName(lead: any): string {
  return normalize(`${lead?.first_name ?? ""} ${lead?.last_name ?? ""}`)
}

export function resolveClient(spokenName: string, leads: any[]): ClientMatch {
  const q = normalize(spokenName)
  if (!q || !Array.isArray(leads) || leads.length === 0) return { kind: "none" }

  const named = leads.filter((l) => fullName(l).length > 0)

  const tiers: ((l: any) => boolean)[] = [
    // 1. Exact full name — "maria gonzalez"
    (l) => fullName(l) === q,
    // 2. Full name begins with what was said — "maria gonz" (clipped audio)
    (l) => fullName(l).startsWith(q),
    // 3. Exact first name — "contact maria"
    (l) => normalize(l.first_name) === q,
    // 4. Exact last name — "contact gonzalez"
    (l) => normalize(l.last_name) === q,
    // 5. Loose containment, last resort — mis-heard middle words
    (l) => fullName(l).includes(q),
  ]

  for (const test of tiers) {
    const hits = named.filter(test)
    if (hits.length === 1) return { kind: "one", lead: hits[0] }
    // Cap the ask list; more than a handful means the utterance was too vague
    // to disambiguate by picking from a popover.
    if (hits.length > 1) return { kind: "many", leads: hits.slice(0, 5) }
  }

  return { kind: "none" }
}
