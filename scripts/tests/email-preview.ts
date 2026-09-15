/**
 * Renders the Locator Beast lead emails to static HTML for visual preview.
 * No email is sent. Run: npx tsx scripts/tests/email-preview.ts <outDir>
 */
import { writeFileSync } from "node:fs";
import { newLeadEmail, leadConfirmationEmail } from "@/lib/notifications";
import { resolveCitySkyline } from "@/lib/notifications/cityHeader";
import {
  buildAgentIdentity,
  decideIabs,
  iabsComplianceWarning,
  buildClientSignatureText,
} from "@/lib/notifications/agentSignature";
import {
  buildGuestCardFields,
  buildGuestCardBody,
} from "@/lib/leads/guestCard";
import { drawGuestCard, type PdfImage } from "@/lib/leads/guestCardPdf";
import { jsPDF } from "jspdf";
import sharp from "sharp";

const outDir = process.argv[2] || ".";

// Node image loader for the PDF preview: fetch → sharp → PNG base64 (+ dims).
// Mirrors the browser <canvas> loader; returns null on any failure so the PDF
// still generates (proving graceful degradation).
async function loadPdfImageNode(url: string | null | undefined, square: boolean): Promise<PdfImage> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    let img = sharp(Buffer.from(await res.arrayBuffer()));
    img = square ? img.resize(240, 240, { fit: "cover" }) : img.resize(600, 600, { fit: "inside", withoutEnlargement: true });
    const png = await img.png().toBuffer();
    const meta = await sharp(png).metadata();
    return { dataUrl: `data:image/png;base64,${png.toString("base64")}`, width: meta.width ?? 1, height: meta.height ?? 1 };
  } catch {
    return null;
  }
}

// Values mirror what the Smart Lead Form actually saves: beds/baths are exact
// ("1" | "2" | "3+"), move_date is a date-only ISO string ("YYYY-MM-DD").
const houston = {
  first_name: "Jordan", last_name: "Sample", email: "jordan@example.com", phone: "(555) 010-4477",
  city: "Houston", neighborhoods: "Montrose, The Heights", submarkets: "",
  move_date: "2026-08-31", property_type: "Apartment", beds: "1", baths: "1",
  desired_rent: "$1,200 – $1,800", income: "$4,000 – $6,000 / month",
  credit_score: "700+", credit_history: "Good", notes: "Prefers a quiet building with in-unit laundry.", source: "Instagram",
};
const chicago = { ...houston, city: "Chicago", neighborhoods: "West Loop, Lincoln Park", desired_rent: "$2,000 – $2,600", income: "$6,000 – $8,000 / month", beds: "2", baths: "2" };
const unknown = { ...houston, city: "Lubbock" }; // unsupported → neutral header
// Same lead, but income not collected → proves the Monthly Income row + Income
// chip are omitted and the AI summary states income was not listed.
const noIncome = { ...houston, income: "" };
// Studio submission: form saves empty beds/baths, so the label comes from the
// property type → "Studio" (never invented as "Studio / 1").
const studio = { ...houston, property_type: "Studio", beds: "", baths: "" };

const owner = { locatorName: "Alex Rivera", leadUrl: "https://locatorbeast.com/admin/leads?id=123" };

// ── Resolved-identity fixtures (exercise the real buildAgentIdentity logic) ────
// Jay / AptAmigo — Texas agent, IABS configured, full signature.
const jay = buildAgentIdentity({
  profile: {
    preferred_name: "Jay Morris",
    brokerage: "ReLIVe Realty",
    phone_number: "(210) 895-5766",
    email: "jay.login@account.example", // account/login email — must NOT show
    client_contact_email: "jay@reliverealty.com", // client-facing — SHOULD show
    profile_photo_url: "https://locatorbeast.com/themes/texas/houston.webp",
    business_logo_url: "https://locatorbeast.com/themes/texas/austin.webp",
  },
  workspace: {
    website: "https://www.reliverealty.com/",
    service_areas: ["san-antonio", "dallas", "austin", "houston", "fort-worth"],
    smart_form_config: {
      copy: { agentTitle: "Licensed Apartment Locator" },
      footer: { iabsUrl: "https://s3.amazonaws.com/portal.aptamigo.com/document/trec_iabs.pdf" },
    },
  },
});
// Stress case — long brokerage, long client contact email, long market list.
const longValues = buildAgentIdentity({
  profile: {
    preferred_name: "Alexandria Montgomery-Whitfield",
    brokerage: "Montgomery Whitfield Luxury Residential Group International",
    phone_number: "(210) 895-5766",
    client_contact_email: "alexandria.montgomery.whitfield@luxuryresidentialgroup.example",
    profile_photo_url: "https://locatorbeast.com/themes/texas/san-antonio.webp",
  },
  workspace: {
    website: "https://www.montgomerywhitfieldluxuryresidential.example/",
    service_areas: ["san-antonio", "dallas", "austin", "houston", "fort-worth"],
    smart_form_config: { copy: { agentTitle: "Licensed Apartment Locator" }, footer: {} },
  },
});
// Texas agent with NO IABS URL → disclosure shows unlinked + Settings warning.
const txNoIabs = buildAgentIdentity({
  profile: { preferred_name: "Dana Reyes", brokerage: "Hill Country Living", phone_number: "(210) 555-7788", email: "dana@hillcountry.com", profile_photo_url: "https://locatorbeast.com/themes/texas/san-antonio.webp" },
  workspace: { website: "https://hillcountry.example", service_areas: ["san-antonio", "austin"], smart_form_config: { copy: { agentTitle: "Apartment Locator" }, footer: { iabsUrl: "" } } },
});
// Non-Texas agent (Atlanta) → Texas disclosure omitted.
const nonTx = buildAgentIdentity({
  profile: { preferred_name: "Morgan Lee", brokerage: "Peachtree Rentals", phone_number: "(404) 555-3311", email: "morgan@peachtree.com", profile_photo_url: "https://locatorbeast.com/themes/illinois/chicago.webp" },
  workspace: { website: "https://peachtree.example", service_areas: ["atlanta"], smart_form_config: { copy: {}, footer: {} } },
});
// Texas agent missing optional image / logo / website → fallbacks (initials, omit).
const sparse = buildAgentIdentity({
  profile: { preferred_name: "Sam Carter", brokerage: "Lone Star Leasing", phone_number: "", email: "sam@lonestar.example" },
  workspace: { service_areas: ["austin"], smart_form_config: { copy: {}, footer: { iabsUrl: "https://example.com/iabs.pdf" } } },
});

const confirm = (lead: typeof houston, sig: ReturnType<typeof buildAgentIdentity> | null) =>
  leadConfirmationEmail({ locatorName: sig?.name ?? "Alex Rivera", signature: sig, lead }).html;

const files: Record<string, string> = {
  "email-owner-houston.html": newLeadEmail({ ...owner, lead: houston }).html,
  "email-owner-no-income.html": newLeadEmail({ ...owner, lead: noIncome }).html,
  "email-owner-studio.html": newLeadEmail({ ...owner, lead: studio }).html,
  // (1) Texas/AptAmigo renter confirmation — image, brokerage, IABS, contact.
  "email-confirm-jay-texas.html": confirm(houston, jay),
  // (2) Texas user missing IABS URL — disclosure unlinked + fail-safe.
  "email-confirm-tx-no-iabs.html": confirm(houston, txNoIabs),
  // (3) Non-Texas user — Texas disclosure omitted.
  "email-confirm-nontx.html": confirm({ ...houston, city: "Atlanta" }, nonTx),
  // (4) Missing optional image/logo/website — initials + omitted rows.
  "email-confirm-sparse.html": confirm(houston, sparse),
  // No-signature back-compat fallback.
  "email-confirm-nosig.html": confirm(chicago, null),
  "email-confirm-unknown.html": confirm(unknown, jay),
  // Long brokerage / email / market list — verify no overflow or crowding.
  "email-confirm-long.html": confirm(houston, longValues),
};
for (const [name, html] of Object.entries(files)) writeFileSync(`${outDir}/${name}`, html);

// (5) Guest card — one deliverable, email body + PDF share the same builders.
const gcFields = buildGuestCardFields(
  { first_name: "Jordan", last_name: "Sample", email: "jordan@example.com", phone: "5550104477", desired_rent: "$1,200 – $1,800", beds: "1", baths: "1", property_type: "Apartment", move_date: "2026-08-31", city: "Houston" },
  { property_name: "The McKinley", property_address: "123 Main St, Houston, TX" },
  jay,
);
const gcLeasing = "leasing@themckinley.com";
const gcGenerated = "08/07/2026";
const gcShow = decideIabs(jay, { leadCity: "Houston" }).show;
const guestCardBody = `${buildGuestCardBody(gcFields, { leasingEmail: gcLeasing, generatedDate: gcGenerated })}\n\n${buildClientSignatureText(jay, { showDisclosure: gcShow })}`;
writeFileSync(`${outDir}/guest-card-jay-texas.txt`, guestCardBody);

// Rendered PDF (with agent photo + brokerage logo embedded via sharp).
void (async () => {
  const [gcPhoto, gcLogo] = await Promise.all([
    loadPdfImageNode(jay.photoUrl, true),
    loadPdfImageNode(jay.logoUrl, false),
  ]);
  const gcDoc = new jsPDF({ unit: "pt", format: "letter" });
  drawGuestCard(gcDoc, { fields: gcFields, signature: jay, showDisclosure: gcShow, leasingEmail: gcLeasing, generatedDate: gcGenerated, agentPhoto: gcPhoto, brokerageLogo: gcLogo });
  writeFileSync(`${outDir}/guest-card-jay-texas.pdf`, Buffer.from(gcDoc.output("arraybuffer")));
  console.log(`guest-card PDF: photo=${gcPhoto ? "embedded" : "skipped"} logo=${gcLogo ? "embedded" : "skipped"}`);
})();

// ── Owner-notification Credit Screening test matrix (6 sanitized cases) ───────
// Screening appears ONLY in the owner notification; the renter confirmation must
// never contain it. Each case renders the full owner email; we extract just the
// Credit Screening section for review.
const baseScreenLead = {
  first_name: "Jamie", last_name: "Doe", email: "jamie@example.com", phone: "5551234567",
  city: "Austin", move_date: "2026-09-15", property_type: "Apartment", beds: "2", baths: "2",
  desired_rent: "$1,500 – $2,000", income: "$5,000 – $7,000 / month", source: "direct",
};
const screeningCases: [string, typeof houston][] = [
  // Clean case: BOTH explicit answers must display — Credit History: Clean and
  // Criminal Background: None (explicitly submitted).
  ["1-clean", { ...baseScreenLead, credit_score: "720", credit_history: "Clean", criminal_background: "None" } as never],
  // Criminal field OMITTED (empty) here → it must NOT appear (vs case 1's explicit None).
  ["2-broken-lease", { ...baseScreenLead, credit_score: "640", credit_history: "Broken Lease", broken_lease_age: "2 years", broken_lease_amount: "$1,000-$2,000", criminal_background: "" } as never],
  ["3-eviction", { ...baseScreenLead, credit_score: "600", credit_history: "Eviction", eviction_court: "No", eviction_age: "1 year", eviction_balance: "$2,000-$5,000", criminal_background: "" } as never],
  ["4-criminal", { ...baseScreenLead, credit_score: "690", credit_history: "Clean", criminal_background: "Felony", criminal_charge: "Assault", felony_age: "5 years" } as never],
  ["5-multiple", { ...baseScreenLead, credit_score: "580", credit_history: "Broken Lease", broken_lease_age: "1 year", broken_lease_amount: "$500-$1,000", criminal_background: "Misdemeanor", criminal_charge: "DWI", misdemeanor_age: "3 years" } as never],
  ["6-omitted", { ...baseScreenLead, credit_score: "", credit_history: "", criminal_background: "" } as never],
];
const extractSection = (html: string, title: string): string => {
  const m = new RegExp(`<h2[^>]*>${title}</h2>\\s*<table[\\s\\S]*?</table>`, "i").exec(html);
  return m ? m[0] : `(no "${title}" section rendered — omitted)`;
};
const stripTags = (s: string) => s.replace(/<\/tr>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").replace(/\n /g, "\n").trim();
let matrix = "CREDIT SCREENING — OWNER NOTIFICATION TEST MATRIX\n(screening shown ONLY to the workspace owner; never to the renter)\nExplicit answers (Clean / None / No / $0) display; only true placeholders + omitted fields are hidden.\n\n";
for (const [name, lead] of screeningCases) {
  const html = newLeadEmail({ ...owner, lead }).html;
  matrix += `──────── ${name} ────────\n${stripTags(extractSection(html, "Credit Screening"))}\n\n`;
  writeFileSync(`${outDir}/screening-${name}.html`, html);
}
writeFileSync(`${outDir}/credit-screening-matrix.txt`, matrix);

// ── Field-aware suppressor assertions (rendered behavior, not internals) ──────
const ownerSec = (lead: object) => stripTags(extractSection(newLeadEmail({ ...owner, lead: lead as never }).html, "Credit Screening"));
const clean = ownerSec(screeningCases[0][1]);
const broken = ownerSec(screeningCases[1][1]);
const zeroScore = ownerSec({ ...baseScreenLead, credit_score: "0", credit_history: "Clean", criminal_background: "None" });
const emDash = ownerSec({ ...baseScreenLead, credit_score: "700", credit_history: "—", criminal_background: "None" });
const checks: [string, boolean][] = [
  ["clean shows 'Credit History' + 'Clean'", /Credit History/.test(clean) && /Clean/.test(clean)],
  ["clean shows explicit 'Criminal Background' + 'None'", /Criminal Background/.test(clean) && /None/.test(clean)],
  ["omitted criminal is hidden (case 2 has no 'Criminal Background')", !/Criminal Background/.test(broken)],
  ["credit score '0' omitted, section still renders history", !/Estimated Credit Score/.test(zeroScore) && /Credit History/.test(zeroScore)],
  ["em-dash credit_history omitted, but 'None' still shows", !/Credit History/.test(emDash) && /Criminal Background/.test(emDash)],
];
// Prove the renter confirmation carries NO screening data (privacy).
const renterHtml = leadConfirmationEmail({ locatorName: "Jay Morris", signature: jay, lead: { ...baseScreenLead, credit_score: "580", credit_history: "Eviction", eviction_age: "1 year", criminal_background: "Felony", criminal_charge: "Assault" } as never }).html;
const renterLeak = /credit|eviction|criminal|felony|misdemeanor|broken lease/i.test(stripTags(renterHtml.replace(/Texas law[\s\S]*$/i, ""))); // exclude signature/disclosure region
console.log("\n" + matrix);
console.log("── suppressor assertions ──");
for (const [label, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
console.log(`PASS? renter confirmation has NO screening terms: ${!renterLeak}`);

// Prove the resolver covers every market (skyline follows the lead's market).
const cities = ["Houston", "Chicago", "Miami–Fort Lauderdale", "Dallas–Fort Worth", "San Antonio", "New Braunfels", "Lubbock", ""];
console.log("subjects:",
  JSON.stringify({ owner: newLeadEmail({ ...owner, lead: houston }).subject, confirm: leadConfirmationEmail({ lead: houston }).subject }));
for (const c of cities) console.log(`resolve "${c || "(empty)"}" →`, JSON.stringify(resolveCitySkyline(c)));

console.log("\n── IABS / signature decisions ──");
const scen: [string, ReturnType<typeof buildAgentIdentity>, string][] = [
  ["jay (TX, IABS set)", jay, "Houston"],
  ["txNoIabs (TX, no URL)", txNoIabs, "Houston"],
  ["nonTx (Atlanta)", nonTx, "Atlanta"],
  ["sparse (TX, no photo/logo/website)", sparse, "Houston"],
];
for (const [label, sig, city] of scen) {
  const d = decideIabs(sig, { leadCity: city });
  console.log(
    `${label}: show=${d.show} missingUrl=${d.missingUrl} servesTexas=${sig.servesTexas} ` +
      `iabsUrl=${sig.iabsUrl ? "set" : "none"} title="${sig.title}" areas="${sig.serviceAreas ?? "—"}" ` +
      `photo=${sig.photoUrl ? "yes" : "initials"} logo=${sig.logoUrl ? "yes" : "omit"} website=${sig.website ? "yes" : "omit"} ` +
      `warn=${iabsComplianceWarning(sig) ? "YES" : "no"}`,
  );
}
console.log("wrote:", Object.keys(files).join(", "), "guest-card-jay-texas.txt", "→", outDir);
