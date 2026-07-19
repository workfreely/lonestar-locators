// Duplicate-lead detection engine.
//
// Pure function — takes a candidate submission and a list of existing leads,
// returns a confidence classification. No DB access, no side effects, so
// it's fully testable in isolation and reusable from any entry point.
//
// Classification, per the approved architecture:
//   - "exact":    normalized phone matches, OR normalized email matches.
//                 Either one alone is treated as high confidence — this is
//                 not an AND of multiple fields, because a single correct
//                 phone or email match already means "same person."
//   - "possible": no phone/email match, but normalized name + move_date
//                 both match. This is a single weaker signal, so it's
//                 surfaced for a locator to confirm rather than treated as
//                 certain.
//   - "none":     no signal matches.
//
// Never relies on only one field being *checked* — every candidate is
// compared against phone, email, and name+move_date, not stopped at the
// first truthy field (replacing the old `phone || email || ...` fallback
// key in app/admin/leads/page.tsx's dedupeLeads()).

import { normalizeEmail, normalizeName, normalizePhone } from "./normalizeLead"

export type MatchSignal = "phone" | "email" | "name_and_move_date"
export type MatchConfidence = "exact" | "possible" | "none"

export type LeadIdentity = {
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  email?: string | null
  move_date?: string | null
}

export type DuplicateMatchResult = {
  confidence: MatchConfidence
  matchedLead: LeadIdentity | null
  matchedSignals: MatchSignal[]
}

function signalsFor(candidate: LeadIdentity, existing: LeadIdentity): MatchSignal[] {
  const signals: MatchSignal[] = []

  const candidatePhone = normalizePhone(candidate.phone)
  const existingPhone = normalizePhone(existing.phone)
  if (candidatePhone && existingPhone && candidatePhone === existingPhone) {
    signals.push("phone")
  }

  const candidateEmail = normalizeEmail(candidate.email)
  const existingEmail = normalizeEmail(existing.email)
  if (candidateEmail && existingEmail && candidateEmail === existingEmail) {
    signals.push("email")
  }

  const candidateFirst = normalizeName(candidate.first_name)
  const candidateLast = normalizeName(candidate.last_name)
  const existingFirst = normalizeName(existing.first_name)
  const existingLast = normalizeName(existing.last_name)
  const nameMatches =
    !!candidateFirst && !!candidateLast &&
    candidateFirst === existingFirst && candidateLast === existingLast
  const dateMatches =
    !!candidate.move_date && !!existing.move_date && candidate.move_date === existing.move_date
  if (nameMatches && dateMatches) {
    signals.push("name_and_move_date")
  }

  return signals
}

/**
 * Finds the best duplicate match for a candidate lead among existing leads.
 *
 * `existingLeads` should be ordered most-recent-first when possible, so that
 * if more than one existing lead matches, the most recently active record
 * is preferred as the match target (the one a locator is most likely
 * actively working).
 */
export function findDuplicateMatch(
  candidate: LeadIdentity,
  existingLeads: LeadIdentity[]
): DuplicateMatchResult {
  let bestPossible: { lead: LeadIdentity; signals: MatchSignal[] } | null = null

  for (const existing of existingLeads) {
    const signals = signalsFor(candidate, existing)
    if (signals.length === 0) continue

    if (signals.includes("phone") || signals.includes("email")) {
      return { confidence: "exact", matchedLead: existing, matchedSignals: signals }
    }

    if (!bestPossible) {
      bestPossible = { lead: existing, signals }
    }
  }

  if (bestPossible) {
    return { confidence: "possible", matchedLead: bestPossible.lead, matchedSignals: bestPossible.signals }
  }

  return { confidence: "none", matchedLead: null, matchedSignals: [] }
}
