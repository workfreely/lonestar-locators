// Sample data for the public Live Demo. Deliberately NOT wired to production —
// no real Smart Lead Form config, no CRM, no AI backend. Just enough polished,
// realistic sample data to give visitors the "wow" without exposing internals.

export type DemoLead = {
  name: string;
  phone: string;
  email: string;
  budget: string;
  bedrooms: string;
  moveDate: string;
  area: string;
  notes: string;
};

export const SAMPLE_LEAD: DemoLead = {
  name: "Jordan Mitchell",
  phone: "(512) 555-0142",
  email: "jordan.mitchell@email.com",
  budget: "$1,800 / mo",
  bedrooms: "2 Bedrooms",
  moveDate: "2026-09-01",
  area: "South Austin",
  notes: "Relocating for a new job. Needs covered parking and a pet-friendly community for a small dog.",
};

export const BUDGET_OPTIONS = [
  "$1,200 / mo",
  "$1,500 / mo",
  "$1,800 / mo",
  "$2,200 / mo",
  "$2,500+ / mo",
];
export const BEDROOM_OPTIONS = ["Studio", "1 Bedroom", "2 Bedrooms", "3+ Bedrooms"];
export const AREA_OPTIONS = [
  "Downtown Austin",
  "South Austin",
  "North Austin",
  "East Austin",
  "Round Rock",
];

export function firstName(lead: DemoLead): string {
  return (lead.name.trim().split(/\s+/)[0] || "your client").trim();
}

// Read-only AI insights sample. Approval / budget / communities are fixed
// realistic samples; the next action + concerns are personalized to the lead.
export function buildInsights(lead: DemoLead) {
  const fn = firstName(lead);
  return {
    approvalProbability: 92,
    approvalLabel: "High",
    recommendedBudget: "$1,650 – $1,950 / mo",
    concerns: [
      `Move date is ~5 weeks out — availability in ${lead.area || "the area"} tightens near month-end.`,
      "Pet-friendly + covered parking narrows the qualifying community list.",
    ],
    communities: [
      { name: "The Ellis at South Lamar", detail: "2 bed · from $1,780 · pet-friendly · garage parking" },
      { name: "Lantower Techridge", detail: "2 bed · from $1,695 · dog park · reserved parking" },
      { name: "Ryder South Congress", detail: "2 bed · from $1,890 · gated garage · walkable" },
    ],
    nextAction: `Text ${fn} 3 tour options in ${lead.area || "the target area"} within 24 hours, leading with the pet-friendly + parking match.`,
  };
}
