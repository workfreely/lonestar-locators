/**
 * Renders the Locator Beast lead emails to static HTML for visual preview.
 * No email is sent. Run: npx tsx scripts/tests/email-preview.ts <outDir>
 */
import { writeFileSync } from "node:fs";
import { newLeadEmail, leadConfirmationEmail } from "@/lib/notifications";
import { resolveCitySkyline } from "@/lib/notifications/cityHeader";

const outDir = process.argv[2] || ".";

const houston = {
  first_name: "Jordan", last_name: "Sample", email: "jordan@example.com", phone: "(555) 010-4477",
  city: "Houston", neighborhoods: "Montrose, The Heights", submarkets: "",
  move_date: "2026-09-01", property_type: "Apartment", beds: "1-2", baths: "1-2",
  desired_rent: "$1,200 – $1,800", income: "$4,000 – $6,000 / month",
  credit_score: "700+", credit_history: "Good", notes: "Prefers a quiet building with in-unit laundry.", source: "Instagram",
};
const chicago = { ...houston, city: "Chicago", neighborhoods: "West Loop, Lincoln Park", desired_rent: "$2,000 – $2,600", income: "$6,000 – $8,000 / month" };
const unknown = { ...houston, city: "Lubbock" }; // unsupported → neutral header

const owner = { locatorName: "Alex Rivera", leadUrl: "https://locatorbeast.com/admin/leads?id=123" };

const files: Record<string, string> = {
  "email-owner-houston.html": newLeadEmail({ ...owner, lead: houston }).html,
  "email-confirm-houston.html": leadConfirmationEmail({ locatorName: "Alex Rivera", lead: houston }).html,
  "email-confirm-chicago.html": leadConfirmationEmail({ locatorName: "Alex Rivera", lead: chicago }).html,
  "email-confirm-unknown.html": leadConfirmationEmail({ locatorName: "Alex Rivera", lead: unknown }).html,
};
for (const [name, html] of Object.entries(files)) writeFileSync(`${outDir}/${name}`, html);

// Prove the resolver covers every market (skyline follows the lead's market).
const cities = ["Houston", "Chicago", "Miami–Fort Lauderdale", "Dallas–Fort Worth", "San Antonio", "New Braunfels", "Lubbock", ""];
console.log("subjects:",
  JSON.stringify({ owner: newLeadEmail({ ...owner, lead: houston }).subject, confirm: leadConfirmationEmail({ lead: houston }).subject }));
for (const c of cities) console.log(`resolve "${c || "(empty)"}" →`, JSON.stringify(resolveCitySkyline(c)));
console.log("wrote:", Object.keys(files).join(", "), "→", outDir);
