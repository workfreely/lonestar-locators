/**
 * RENDER verification for the expanded-by-default sections.
 *
 * The source-assertion test (scripts/tests/companionSectionDefaults.test.ts) proves the props
 * are right. This one mounts the SHIPPED component and reads the accordion's own
 * `aria-expanded`, so "it displays expanded when I open a lead" is measured rather than
 * inferred — including the second lead, which is where a remembered collapse would show up.
 *
 * Run: npx tsx --import ./scripts/css-stub.mjs scripts/sectionDefaults.render.test.tsx
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LeadPanelBody } from "../src/sidepanel/lead/LeadPanelView";

let pass = 0;
let fail = 0;
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
};

/** Synthetic lead — no real client data. */
const makeLead = (id: number, name: string) => ({
  id,
  fullName: name,
  stage: "new",
  searchCriteria: {
    city: "Dallas",
    budgetText: "$1,400 - $1,700",
    income: "$4,000 - $5,000 / month",
    propertyType: "Apartment",
    beds: "2",
    baths: "2",
    moveDate: "2026-12-01",
    desiredAreas: "Uptown",
    commuteDestination: null,
    source: "SmartLead Form",
  },
  creditScreening: {
    creditScore: "620 - 679",
    creditHistory: "Broken Lease",
    brokenLeaseAge: "2 years",
    brokenLeaseAmount: "$1,000-$2,000",
    evictionAge: null,
    evictionBalance: null,
    criminalBackground: "No",
  },
  clientHistory: [],
  // present so "Client Notes stays collapsed" is a real assertion, not a vacuous one
  clientNotes: "Prefers a ground-floor unit.",
}) as any;

/** The open/closed state of every accordion, in document order, from the rendered markup. */
function sections(html: string): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const re = /aria-expanded="(true|false)"[^>]*>(?:(?!<\/button>).)*?class="lp-section-title">([^<]+)</gs;
  for (const m of html.matchAll(re)) out[m[2]] = m[1] === "true";
  return out;
}

console.log("\nBEAST COMPANION — SECTIONS RENDER EXPANDED\n");

const htmlA = renderToStaticMarkup(
  <LeadPanelBody lead={makeLead(1, "Test Lead One")} nextActions={[]} onDemo={(() => {}) as any} />,
);
const a = sections(htmlA);
console.log("  sections found:", JSON.stringify(a));

ok("Search Criteria renders expanded", a["Search Criteria"] === true);
ok("Credit Screening renders expanded", a["Credit Screening"] === true);
ok("Client History renders expanded", a["Client History"] === true);
ok("Client Notes IS rendered (so the next assertion is not vacuous)", "Client Notes" in a);
ok("Client Notes still renders collapsed", a["Client Notes"] === false);

console.log("\nthe expanded bodies actually contain the fields");
ok("Search Criteria body is present (its rows render, not just the heading)", htmlA.includes("Budget") && htmlA.includes("$1,400 - $1,700"));
ok("Credit Screening body is present", htmlA.includes("Credit Score") && htmlA.includes("620 - 679"));
ok("the broken-lease row shows age AND balance", htmlA.includes("2 years ago · balance $1,000-$2,000"));
ok("no eviction row for a broken-lease lead", !/lp-field[^>]*>\s*<[^>]*>Eviction</.test(htmlA) && !htmlA.includes(">Eviction<"));
ok("Client History shows its empty state rather than nothing", htmlA.includes("No recorded criteria changes yet."));

console.log("\nopening ANOTHER lead");
const b = sections(
  renderToStaticMarkup(
    <LeadPanelBody lead={makeLead(2, "Test Lead Two")} nextActions={[]} onDemo={(() => {}) as any} />,
  ),
);
ok("Search Criteria expanded on the second lead too", b["Search Criteria"] === true);
ok("Credit Screening expanded on the second lead too", b["Credit Screening"] === true);
ok("Client History expanded on the second lead too", b["Client History"] === true);

console.log("\nstill collapsible");
ok("each expanded head is a real button with aria-expanded", (htmlA.match(/class="lp-section-head"/g) ?? []).length >= 3);
ok("none of them is disabled (collapsible is intact)", !/class="lp-section-head"[^>]*disabled/.test(htmlA));
ok("the chevron renders in its open state", htmlA.includes("lp-chevron is-open"));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
