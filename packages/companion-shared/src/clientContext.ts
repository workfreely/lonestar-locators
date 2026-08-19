// Current Client Context (V1, Option A) — the single, conservative, deterministic
// projection of the active client's confirmed location/requirements that EVERY
// property-intelligence evaluator consumes (Location today; Approval/Amenities/
// Specials as they land). Resolved ONCE per client and reused across every property,
// so evaluating 50–100 SAD properties never re-reads the conversation per property.
//
// Layering (Option A — deterministic, no AI, no intent-guessing):
//   • baseline  = Smart Form / Search Criteria (structured, authoritative defaults)
//   • overrides = Locator Notes + existing AI Insights → `overrideText`, the "latest
//                 confirmed" layer. A clear later agent/insight update can supersede a
//                 baseline value; this resolver only ASSEMBLES that layer as text —
//                 downstream evaluators decide, and leave ambiguity Unverified.
//   • clientNotes stays available as context but NEVER auto-supersedes structured
//     criteria (it is the client's original form prose, not a confirmed update).
//
// Option B (a structured Current-Requirements object maintained by the batch AI, once
// per client) is deferred; when it lands it becomes another field here without
// changing the evaluators' interface.

export type ClientContext = {
  /** Smart Form baseline. */
  city: string | null;
  desiredAreas: string | null;
  interest: string | null;
  /** Client's original form notes — context only; never auto-overrides baseline. */
  clientNotes: string | null;
  /** Agent Locator Notes (confirmed) — part of the current/override layer. */
  locatorNotes: string | null;
  /** Existing AI Client Insights bullets (sanitized) — part of the override layer. */
  aiInsights: string[];
  /** Structured Must-Have Amenities (canonical option values). The PRIMARY source for
   *  the Amenities evaluator; empty when the client never supplied any. */
  mustHaveAmenities: string[];
  /** Locator Notes + AI Insights joined — the free-text "current/override" layer the
   *  evaluators scan for a clear later update. Empty string when neither is present. */
  overrideText: string;
};

export type ClientContextInput = {
  city?: string | null;
  desiredAreas?: string | null;
  interest?: string | null;
  clientNotes?: string | null;
  locatorNotes?: string | null;
  aiInsights?: string[] | null;
  mustHaveAmenities?: string[] | null;
};

function clean(v?: string | null): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

export function resolveClientContext(input: ClientContextInput): ClientContext {
  const aiInsights = (input.aiInsights ?? []).map((s) => (s ?? "").trim()).filter(Boolean);
  const locatorNotes = clean(input.locatorNotes);
  const overrideText = [locatorNotes, ...aiInsights].filter(Boolean).join(". ");
  return {
    city: clean(input.city),
    desiredAreas: clean(input.desiredAreas),
    interest: clean(input.interest),
    clientNotes: clean(input.clientNotes),
    locatorNotes,
    aiInsights,
    mustHaveAmenities: (input.mustHaveAmenities ?? []).map((s) => (s ?? "").trim()).filter(Boolean),
    overrideText,
  };
}
