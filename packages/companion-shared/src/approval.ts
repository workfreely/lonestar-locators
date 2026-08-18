// Approval V1 — the second property-intelligence dimension. Compact row contract:
//
//   Approval: [Risk] · [Mgmt] · [Key reason]
//
// V1 evidence is ONLY the SAD management company (confirmed selector, read into
// CurrentProperty.propertyManagement) matched against a small, LOCATOR-SUPPLIED
// management-intelligence table. It is deliberately narrow and conservative:
//
//   • Risk vocabulary is Locator Beast's own: Low | Moderate | High | Unverified.
//     ("Good Approval" is never used.) V1 only ever produces Low / Moderate /
//     Unverified — there is no evidence path to High yet, so we never fabricate it.
//   • Management intelligence is EVIDENCE, not a guarantee — never say/imply
//     "Guaranteed Approval".
//   • Unknown management → Unverified (NOT High). Unknown does NOT mean strict.
//   • No credit-score thresholds; no generalizing a property-specific policy to a
//     whole company; SAD's "No Credit Check" is ignored as evidence (unreliable).
//   • Missing management evidence must NEVER negatively exclude a property — it is
//     simply Unverified with no risk inference.
//
// This dimension is property-side only in V1 (no client credit context yet), so it
// does not consume ClientContext; it will when real approval context lands.

export type ApprovalRisk = "Low" | "Moderate" | "High" | "Unverified";
export type ApprovalResult = {
  risk: ApprovalRisk;
  /** Compact management display (e.g. "Mgmt Support", "Abbey", "Greystar"), or null. */
  mgmt: string | null;
  /** Single short key reason (e.g. "Second chance"), or null. */
  reason: string | null;
};

// LOCATOR-SUPPLIED management intelligence — the ONLY entries we treat as evidence.
// `match` is a normalized substring tested against the SAD management text. Display
// names are compact (Companion shows "Mgmt Support", not "Management Support").
const MGMT_INTEL: { match: string; display: string; risk: ApprovalRisk; reason: string }[] = [
  { match: "management support", display: "Mgmt Support", risk: "Low", reason: "Second chance" },
  { match: "abbey", display: "Abbey", risk: "Moderate", reason: "Conditional deposit" },
  { match: "willow bridge", display: "Willow Bridge", risk: "Low", reason: "1099 friendly" },
];

/** Shorten an unknown management name for the compact row (drop common suffixes). */
function compactMgmt(raw: string): string {
  const trimmed = raw
    .replace(/\s+/g, " ")
    .replace(/\b(property management|residential|management|apartments|communities|group|company|co|llc|inc|lp|l\.p\.)\b\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const out = trimmed || raw.trim();
  return out.length > 22 ? out.slice(0, 22).trim() : out;
}

export function evaluateApproval(property: { propertyManagement?: string | null }): ApprovalResult {
  const raw = (property.propertyManagement ?? "").trim();
  // No management evidence at all → Unverified, no inference (never penalizes).
  if (!raw) return { risk: "Unverified", mgmt: null, reason: null };

  const n = raw.toLowerCase();
  const hit = MGMT_INTEL.find((m) => n.includes(m.match));
  if (hit) return { risk: hit.risk, mgmt: hit.display, reason: hit.reason };

  // Known company name but no reliable intel → Unverified + the name, NO risk guess.
  return { risk: "Unverified", mgmt: compactMgmt(raw), reason: null };
}
