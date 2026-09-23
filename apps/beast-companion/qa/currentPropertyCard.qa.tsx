/**
 * DEV-ONLY QA render — NOT part of the extension build.
 *
 * scripts/build.mjs only ever bundles sidepanel.html / content / background, so
 * nothing in this qa/ folder can reach dist/ or ship. It exists solely to eyeball
 * the Current Property card. It renders the REAL PropertiesView component with a
 * grounded fixture, so the actual evaluators (evaluateLocationFit / evaluateApproval /
 * evaluateAmenities / evaluateSpecials / evaluateBudget / evaluateMatchScore) and the
 * shared selectMatchReasonLines compute the badge + reason lines — no mock, no
 * fabricated output. No Supabase, no production data.
 *
 * Run (from apps/beast-companion):
 *   npx vite --config vite.config.ts --port 5199
 * then open http://localhost:5199/qa/ . The extension build (scripts/build.mjs)
 * never touches this folder, so it stays out of dist/ and never ships.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { PropertiesView } from "@/sidepanel/properties/PropertiesView";
import { applyTheme } from "@/sidepanel/applyTheme";
import "@/sidepanel/lead/panel.css";

// Match the default panel theme so the --lb-* tokens resolve exactly as they do in
// the shipped side panel.
applyTheme("midnight");

// ── Grounded CLIENT (Smart Form criteria) — mirrors existing unit-test fixtures ──
const lead = {
  id: "qa-lead",
  name: "QA Client",
  preferredName: "QA Client",
  searchCriteria: {
    city: "Austin",
    desiredAreas: "Downtown Austin",
    interest: "apartment",
    budgetText: "$2,000 - $2,600",
    mustHaveAmenities: ["floor_to_ceiling_windows", "private_yard", "attached_garage"],
  },
  clientNotes: null,
  locatorNotes: null,
  aiInsights: [],
} as any;

// ── Grounded PROPERTY (as the external-site adapter would deliver it) ──────────
const currentProperty = {
  propertyId: "qa-prop",
  propertyName: "The Catherine",
  propertyAddress: "500 Comal St, Austin, TX 78702",
  // Neutral placeholder URL — favorites/recommendations are empty so it only feeds
  // the (false) isRecommended/isFavorited checks; never a third-party platform link.
  propertyUrl: "https://example.com/qa/the-catherine",
  websiteUrl: "https://example.com/qa/the-catherine",
  propertySubmarket: "Downtown Austin", // → location verdict "good" → "Within Preferred Area"
  propertyManagement: "Willow Bridge Property Company", // → approval "1099 friendly" (Low)
  propertyRent: { min: 2100, max: 2500 }, // within budget → feeds score, not a line
  propertyImageUrl: null, // → shared building placeholder
  googleRating: 4.6,
  propertyAmenities: {
    community: ["Swimming Pool", "Fitness Center"],
    unit: ["Floor-to-Ceiling Windows", "Private Fenced Yard", "Attached Garage"],
  },
  // The FOURTH grounded reason — kept in the input so the 3-line cap is genuinely
  // exercised (it is dropped, not shown).
  propertySpecials: ["Up to 8 weeks free on select units"],
} as any;

const noop = () => {};

function QA() {
  return (
    <div style={{ maxWidth: 400, margin: "0 auto", padding: 16 }}>
      <div style={{ marginBottom: 12, fontSize: 12, color: "var(--lb-text-secondary)" }}>
        DEV-ONLY QA · Current Property card · real evaluators + selectMatchReasonLines
      </div>
      <PropertiesView
        lead={lead}
        favorites={[]}
        recommendations={[]}
        currentProperty={currentProperty}
        onAddRecommendation={noop}
        onAddFavorite={noop}
        onMoveToFavorite={noop}
        onMoveToRecommendation={noop}
        onRemoveRecommendation={noop}
        onClearCurrentProperty={noop}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<QA />);
