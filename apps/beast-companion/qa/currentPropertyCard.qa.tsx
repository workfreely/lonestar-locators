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

// ── Grounded CLIENT (Smart Form criteria) — a San Antonio client so the canary
// properties' submarkets can register as "Within Preferred Area". ──────────────
const lead = {
  id: "qa-lead",
  name: "QA Client",
  preferredName: "QA Client",
  searchCriteria: {
    city: "San Antonio",
    desiredAreas: "Westover Hills, Brooks, Stone Oak",
    interest: "apartment",
    budgetText: "$1,200 - $2,000",
    mustHaveAmenities: [],
  },
  clientNotes: null,
  locatorNotes: null,
  aiInsights: [],
} as any;

const noop = () => {};

// ── Canary properties as the enriched displayCurrentProperty would arrive ──────
// Canonical fields (propertyImageUrl(+Backup), propertyCurrentSpecial, send/escort
// Commission, catalogVerifiedAt) come from property_catalog via the CRM enrichment
// round-trip. These are the REAL values written by the 5-property canary.
const NOW = new Date().toISOString();

// 1) Preserve — primary photo LOADS, special "2 Months Free", commission 100/100.
const preserve = {
  propertyId: "qa-preserve", propertyName: "Preserve at Westover Hills",
  propertyAddress: "10919 Rustic Kt, San Antonio, TX 78251",
  propertyUrl: "https://example.com/qa/preserve", websiteUrl: "https://thepreservewestoverhills.com/",
  propertySubmarket: "Westover Hills", googleRating: 3.6,
  propertyImageUrl: "https://thepreservewestoverhills.com/assets/images/cache/Image-31-3414efa0ebc8b4b7bb96608b99e48944.jpg",
  propertyImageUrlBackup: "https://thepreservewestoverhills.com/assets/images/cache/Image-32-f3474d32b0be981ace111075e97caa52.jpg",
  propertyCurrentSpecial: "100% off rent for 2 month(s) on a 12 mo lease Other Concessions: 8 WEEKS FREE.",
  sendCommission: "100%", escortCommission: "100%", bonusFlat: null, catalogVerifiedAt: NOW,
} as any;

// 2) Canyon Point — primary URL is DELIBERATELY BROKEN to prove primary → backup:
// the entrance photo (real backup) must display. Special "1 Month Free", 125/125.
const canyon = {
  propertyId: "qa-canyon", propertyName: "Canyon Point",
  propertyAddress: "12070 Culebra Rd, San Antonio, TX 78253",
  propertyUrl: "https://example.com/qa/canyon", websiteUrl: "https://canyonpointapts.com/",
  propertySubmarket: "Far West Side", googleRating: 3.3,
  propertyImageUrl: "https://canyonpointapts.com/__broken__/does-not-exist.jpg",
  propertyImageUrlBackup: "https://medialibrarycfo.entrata.com/fit-in/760x428/17535/MLv3/9/36/2026/08/06/023148/6a74ef344e4cc0.78410407547.jpg",
  propertyCurrentSpecial: "100% off rent for 1 month(s) on a 12 mo lease Look & Lease: PLUS UP TO an additional TWO WEEKS of FREE RENT",
  sendCommission: "125%", escortCommission: "125%", bonusFlat: null, catalogVerifiedAt: NOW,
} as any;

// 3) The Floodgate — NO special (null) → chip HIDDEN; commission 50/75.
const floodgate = {
  propertyId: "qa-floodgate", propertyName: "The Floodgate",
  propertyAddress: "111 Lexington Ave, San Antonio, TX 78205",
  propertyUrl: "https://example.com/qa/floodgate", websiteUrl: "https://www.thefloodgateliving.com/",
  propertySubmarket: "Downtown", googleRating: 4.9,
  propertyImageUrl: "https://thefloodgateliving.b-cdn.net/wp-content/uploads/2025/05/photoby-onwardgroup-photoby-onwardgroup-047-20250417-floodgate-rpm-windowstill-lpg-36-1--scaled.jpg",
  propertyImageUrlBackup: "https://thefloodgateliving.b-cdn.net/wp-content/uploads/2025/05/photoby-onwardgroup-photoby-onwardgroup-108-20250417-floodgate-rpm-windowstill-lpg-97-2--1920x1280.jpg",
  propertyCurrentSpecial: null,
  sendCommission: "50%", escortCommission: "75%", bonusFlat: null, catalogVerifiedAt: NOW,
} as any;

const CASES: { note: string; property: any }[] = [
  { note: "① primary photo loads · special '2 Months Free' · commission 100/100", property: preserve },
  { note: "② primary BROKEN → backup photo loads · special '1 Month Free' · 125/125", property: canyon },
  { note: "③ no special → chip hidden · commission 50/75", property: floodgate },
];

function Card({ note, property }: { note: string; property: any }) {
  return (
    <div style={{ maxWidth: 400, margin: "0 auto 22px" }}>
      <div style={{ marginBottom: 8, fontSize: 11.5, fontWeight: 600, color: "var(--lb-text-secondary)" }}>{note}</div>
      <PropertiesView
        lead={lead}
        favorites={[]}
        recommendations={[]}
        currentProperty={property}
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

function QA() {
  return (
    <div style={{ padding: 16 }}>
      <div style={{ maxWidth: 400, margin: "0 auto 14px", fontSize: 12, color: "var(--lb-text-secondary)" }}>
        DEV-ONLY QA · Current Property card · REAL component + real canary canonical data
      </div>
      {CASES.map((c) => (
        <Card key={c.property.propertyId} note={c.note} property={c.property} />
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<QA />);
