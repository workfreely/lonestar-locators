// Reusable demo seed for a Locator Beast workspace.
//
//   node scripts/seed-demo.mjs --email you@example.com          # reset + seed
//   node scripts/seed-demo.mjs --email you@example.com --reset  # wipe seed only
//
// - Populates ONLY the given owner's workspace (workspace_id + owner_user_id set
//   on every row → RLS-scoped to that account).
// - Every seeded lead is tagged utm_campaign = 'demo_seed'; reset only ever
//   deletes rows carrying that tag, so real leads you create are never touched.
// - Reads Supabase URL + SERVICE ROLE key from .env.local. Does not create the
//   account or touch auth — you sign up + onboard normally first.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SEED_TAG = "demo_seed";

const args = process.argv.slice(2);
const email = (args[args.indexOf("--email") + 1] || process.env.SEED_EMAIL || "").trim();
const resetOnly = args.includes("--reset");
if (!email || email.startsWith("--")) {
  console.error("Usage: node scripts/seed-demo.mjs --email you@example.com [--reset]");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── date helpers (relative so the workspace always looks freshly active) ──────
const now = Date.now();
const daysAgo = (d) => new Date(now - d * 864e5).toISOString();
const daysFromNow = (d) => new Date(now + d * 864e5).toISOString();
const dateAgo = (d) => new Date(now - d * 864e5).toISOString().slice(0, 10);
const dateFromNow = (d) => new Date(now + d * 864e5).toISOString().slice(0, 10);

// ── resolve the owner + their workspace ───────────────────────────────────────
async function resolveOwner() {
  const { data: list, error } = await admin.auth.admin.listUsers();
  if (error) throw error;
  const user = list.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`No auth user for ${email}. Sign up + complete onboarding first.`);
  const { data: mem } = await admin
    .from("workspace_members").select("workspace_id").eq("user_id", user.id).eq("status", "active").limit(1);
  const workspaceId = mem?.[0]?.workspace_id;
  if (!workspaceId) throw new Error(`No active workspace for ${email}. Finish onboarding first.`);
  return { userId: user.id, workspaceId };
}

async function reset(scope) {
  const { data: seeded } = await admin
    .from("leads").select("id").eq("workspace_id", scope.workspaceId).eq("utm_campaign", SEED_TAG);
  const ids = (seeded ?? []).map((r) => r.id);
  if (ids.length) {
    for (const t of ["lead_next_actions", "lead_timeline", "ai_client_briefs", "lead_favorites"]) {
      await admin.from(t).delete().in("lead_id", ids);
    }
    await admin.from("leads").delete().in("id", ids);
  }
  console.log(`  reset: removed ${ids.length} seeded leads (+ their actions/timeline/insights/favorites)`);
}

// ── lead templates — realistic Austin-area apartment-locating pipeline ────────
// credit tiers drive the computed Approval Probability (High / Moderate / Low).
const HIGH = { credit_score: "742", credit_history: "Excellent — no issues", criminal_background: "None" };
const MOD = { credit_score: "628", credit_history: "Fair — one late payment", criminal_background: "None" };
const LOW = { credit_score: "561", credit_history: "Broken lease 2 years ago", criminal_background: "None" };
const LOWX = { credit_score: "590", credit_history: "Eviction filed 3 years ago", criminal_background: "None" };

const LEADS = [
  // ── New (4) ─────────────────────────────────────────────────────────────
  { first: "Maria", last: "Alvarez", source: "instagram", stage: "new", tier: HIGH, city: "Austin", area: "South Austin", rent: "$1,750", beds: "2", moveIn: 34, age: 2,
    notes: "Saw the IG reel, relocating from Dallas for a nursing job.", loc: "Fast replies. Wants pet-friendly (cat).",
    insights: ["Highly responsive — replied within 20 min.", "Budget firm at $1,750; flexible on move date.", "Needs pet-friendly (one cat)."], conv: "Hi! Yes I'm looking for a 2 bed in South Austin around $1,750, moving next month." },
  { first: "Devon", last: "Brooks", source: "tiktok", stage: "new", tier: MOD, city: "Austin", area: "North Austin", rent: "$1,500", beds: "1", moveIn: 45, age: 1,
    notes: "TikTok DM. First apartment, needs guidance.", loc: "First-time renter — walk through the process.",
    insights: ["First-time renter — will need hand-holding.", "Budget-conscious, $1,500 ceiling."], conv: "how does this work? do you charge anything?" },
  { first: "Priya", last: "Nair", source: "google", stage: "new", tier: HIGH, city: "Round Rock", area: "Round Rock", rent: "$2,100", beds: "3", moveIn: 60, age: 3,
    notes: "Google search. Family of 4, needs good schools.", loc: "Prioritize school districts + garage.",
    insights: ["Strong approval profile.", "School district is the top priority.", "Timeline is flexible (~2 months)."], conv: "We need a 3 bedroom near good elementary schools." },
  { first: "Marcus", last: "Webb", source: "referral", stage: "new", tier: MOD, city: "Austin", area: "East Austin", rent: "$1,650", beds: "1", moveIn: 30, age: 1,
    notes: "Referred by a past client.", loc: "Referral from Jasmine — treat as warm.", insights: ["Warm referral — high intent.", "Wants walkable East Austin."], conv: "Jasmine said you helped her find a place, hoping you can help me too." },

  // ── Contacted (4) — includes overdue follow-ups ───────────────────────────
  { first: "Ashley", last: "Kim", source: "instagram", stage: "contacted", tier: HIGH, city: "Austin", area: "Downtown", rent: "$2,300", beds: "1", moveIn: 25, age: 9,
    notes: "Wants a downtown high-rise with amenities.", loc: "Texted options, waiting on reply. FU overdue.",
    contactedAgo: 5, overdueFU: 2, insights: ["Wants luxury high-rise amenities (gym, pool).", "Approval is strong.", "Went quiet — nudge needed."], conv: "Those look nice, let me think about it." },
  { first: "Tyler", last: "Nguyen", source: "google", stage: "contacted", tier: LOW, city: "Austin", area: "South Austin", rent: "$1,400", beds: "1", moveIn: 40, age: 12,
    notes: "Broken lease — needs 2nd-chance friendly.", loc: "Filtering for broken-lease friendly communities.",
    contactedAgo: 3, overdueFU: 1, insights: ["Broken lease — needs 2nd-chance communities.", "Approval odds are lower; set expectations.", "Motivated, replies same-day."], conv: "I had a broken lease in 2023, will that be a problem?" },
  { first: "Sofia", last: "Reyes", source: "tiktok", stage: "contacted", tier: MOD, city: "Austin", area: "Mueller", rent: "$1,900", beds: "2", moveIn: 33, age: 7,
    notes: "Comparing us with another locator.", loc: "Competitive — move fast with a strong list.",
    contactedAgo: 2, insights: ["Comparing locators — responsiveness will win it.", "Likes Mueller / modern builds."], conv: "another locator sent me some too, still deciding" },
  { first: "Jordan", last: "Patel", source: "referral", stage: "contacted", tier: HIGH, city: "Cedar Park", area: "Cedar Park", rent: "$2,000", beds: "3", moveIn: 55, age: 6,
    notes: "Relocating for work, company covering deposit.", loc: "Corporate relo — flexible budget.",
    contactedAgo: 4, insights: ["Corporate relocation — budget flexible.", "Strong approval.", "Wants a home office (3rd bedroom)."], conv: "My employer is covering the move so I have some flexibility." },

  // ── List Sent (3) — with favorites ────────────────────────────────────────
  { first: "Hannah", last: "Cole", source: "instagram", stage: "list_sent", tier: HIGH, city: "Austin", area: "South Lamar", rent: "$1,850", beds: "2", moveIn: 20, age: 14,
    notes: "Loved 2 of the 3 options sent.", loc: "Sent guest cards for The Ellis + Ryder.",
    contactedAgo: 10, favorites: [["The Ellis at South Lamar", "2 bed · $1,780 · pet-friendly"], ["Ryder South Congress", "2 bed · $1,890 · walkable"]],
    insights: ["Loved The Ellis + Ryder from the list.", "Ready to tour this weekend.", "Pet-friendly + parking are must-haves."], conv: "The Ellis looks perfect! Can we see it Saturday?" },
  { first: "Chris", last: "Donovan", source: "google", stage: "list_sent", tier: MOD, city: "Austin", area: "Domain", rent: "$2,050", beds: "2", moveIn: 28, age: 11,
    notes: "Wants Domain area, near work.", loc: "Sent 4 Domain-area options.",
    contactedAgo: 6, favorites: [["Lantower Domain", "2 bed · $1,995 · rooftop"]],
    insights: ["Focused on the Domain for the commute.", "Comparing amenities across the list."], conv: "Lantower looks good, what are the fees?" },
  { first: "Bianca", last: "Ford", source: "tiktok", stage: "list_sent", tier: LOWX, city: "Austin", area: "Riverside", rent: "$1,350", beds: "1", moveIn: 22, age: 13,
    notes: "Eviction history — 2nd-chance list sent.", loc: "Curated 2nd-chance approved list.",
    contactedAgo: 8, overdueFU: 3, favorites: [["Eastside Station", "1 bed · $1,320 · 2nd-chance"]],
    insights: ["Eviction on record — 2nd-chance list.", "Approval is the main risk; prep the app.", "Went quiet 3 days — follow up."], conv: "thanks for finding places that work with my situation" },

  // ── Ready to Tour (2) — tour scheduled ────────────────────────────────────
  { first: "Elena", last: "Vasquez", source: "referral", stage: "ready_to_tour", tier: HIGH, city: "Austin", area: "Zilker", rent: "$2,200", beds: "2", moveIn: 18, age: 16,
    notes: "Tour booked Sat 2pm.", loc: "Tour confirmed: The Catherine, Sat 2pm.",
    contactedAgo: 12, tourInDays: 3, tourProp: "The Catherine (Zilker)",
    insights: ["Tour confirmed — high intent.", "Strong approval, ready to apply after touring."], conv: "See you Saturday at 2!" },
  { first: "Andre", last: "Foster", source: "instagram", stage: "ready_to_tour", tier: MOD, city: "Austin", area: "Hyde Park", rent: "$1,700", beds: "1", moveIn: 26, age: 15,
    notes: "Deciding between two tour times.", loc: "Tour tentative: Skyloft, Sun 11am.",
    contactedAgo: 9, tourInDays: 5, tourProp: "Skyloft (Hyde Park)",
    insights: ["Tour tentatively set for Sunday.", "Wants to see the unit before committing."], conv: "Sunday morning works better for me" },

  // ── Done Touring (2) ──────────────────────────────────────────────────────
  { first: "Grace", last: "Liu", source: "google", stage: "done_touring", tier: HIGH, city: "Austin", area: "Downtown", rent: "$2,400", beds: "1", moveIn: 14, age: 22,
    notes: "Toured 2, loved the second.", loc: "Sending application link for 70 Rainey.",
    contactedAgo: 18, insights: ["Toured 2 — favored 70 Rainey.", "Ready to apply; send the link.", "Strong approval."], conv: "I'm ready to apply for the Rainey one!" },
  { first: "Sam", last: "Whitfield", source: "referral", stage: "done_touring", tier: MOD, city: "Round Rock", area: "Round Rock", rent: "$1,600", beds: "2", moveIn: 20, age: 20,
    notes: "Wants to sleep on it after touring.", loc: "Follow up in 2 days after their tour.",
    contactedAgo: 16, overdueFU: 1, insights: ["Toured, wants a day to decide.", "Slight hesitation on price."], conv: "let me talk it over with my roommate" },

  // ── Applied (2) ───────────────────────────────────────────────────────────
  { first: "Nina", last: "Okafor", source: "instagram", stage: "applied", tier: HIGH, city: "Austin", area: "Mueller", rent: "$1,950", beds: "2", moveIn: 10, age: 26,
    notes: "Application submitted, awaiting approval.", loc: "Applied to Aldrich 51 — check status.",
    contactedAgo: 24, insights: ["Application in — awaiting approval.", "Strong file, should approve quickly."], conv: "just submitted the application!" },
  { first: "Leo", last: "Martins", source: "google", stage: "applied", tier: MOD, city: "Austin", area: "South Austin", rent: "$1,500", beds: "1", moveIn: 12, age: 25,
    notes: "Applied, verifying income docs.", loc: "Waiting on income verification.",
    contactedAgo: 22, insights: ["Applied — income verification pending.", "Follow up with the leasing office."], conv: "they asked for pay stubs, sending them now" },

  // ── Closed (3) — with invoice / commission ────────────────────────────────
  { first: "Olivia", last: "Grant", source: "referral", stage: "closed", tier: HIGH, city: "Austin", area: "South Lamar", rent: "$1,800", beds: "2", moveIn: -6, age: 48,
    notes: "Leased! Great client.", loc: "Closed — invoice submitted, commission pending.",
    contactedAgo: 40, closedAgo: 6, invoice: { prop: "The Ellis at South Lamar", rent: 1780, commission: 890 },
    insights: ["Closed — leased The Ellis.", "Referral source; ask for a review."], conv: "Move-in went great, thank you!!" },
  { first: "Ethan", last: "Ross", source: "instagram", stage: "closed", tier: MOD, city: "Austin", area: "Domain", rent: "$2,000", beds: "2", moveIn: -20, age: 62,
    notes: "Leased at the Domain.", loc: "Closed — commission paid.",
    contactedAgo: 55, closedAgo: 20, invoice: { prop: "Lantower Domain", rent: 1995, commission: 998, paid: true },
    insights: ["Closed + commission paid.", "Happy client — good for a testimonial."], conv: "loving the new place" },
  { first: "Zoe", last: "Bennett", source: "tiktok", stage: "closed", tier: HIGH, city: "Cedar Park", area: "Cedar Park", rent: "$1,950", beds: "3", moveIn: -12, age: 51,
    notes: "Family leased a 3 bed.", loc: "Closed — invoice submitted.",
    contactedAgo: 45, closedAgo: 12, invoice: { prop: "Riata Cedar Park", rent: 1950, commission: 975 },
    insights: ["Closed — 3 bed for the family.", "Referral potential (mom's group)."], conv: "kids love the new schools!" },

  // ── Lost / Archived (2) — archive_reason ──────────────────────────────────
  { first: "Kevin", last: "Doyle", source: "google", stage: "archived", tier: MOD, city: "Austin", area: "North Austin", rent: "$1,600", beds: "1", moveIn: 30, age: 34,
    notes: "Went silent after list sent.", loc: "Ghosted after 3 follow-ups.",
    contactedAgo: 30, archive: "ghosted", insights: ["Ghosted after the list.", "3 follow-ups, no reply."], conv: "" },
  { first: "Rachel", last: "Simmons", source: "facebook", stage: "archived", tier: LOW, city: "Austin", area: "Riverside", rent: "$1,300", beds: "1", moveIn: 20, age: 38,
    notes: "Ended up renting on her own.", loc: "Rented elsewhere before touring.",
    contactedAgo: 28, archive: "rented_elsewhere", insights: ["Rented elsewhere — closed out.", "Was price-sensitive."], conv: "I found a place already, thanks anyway" },
];

async function seed(scope) {
  let leadCount = 0, actionCount = 0, tlCount = 0, briefCount = 0, favCount = 0;
  for (const t of LEADS) {
    const base = t.tier;
    const contactedAgo = t.contactedAgo ?? null;
    const followUps = t.stage === "new" ? 0 : Math.min(t.age, 5);

    const leadRow = {
      first_name: t.first, last_name: t.last, phone: `(512) 555-0${(100 + leadCount).toString().slice(-3)}`,
      email: `${t.first}.${t.last}@example-demo.com`.toLowerCase(),
      city: t.city, neighborhoods: t.area, submarkets: t.area, property_type: "Apartment",
      desired_rent: t.rent, beds: t.beds, baths: t.beds === "3" ? "2" : "1",
      move_date: t.moveIn >= 0 ? dateFromNow(t.moveIn) : dateAgo(-t.moveIn),
      income: base === HIGH ? "$78,000" : base === MOD ? "$54,000" : "$41,000",
      credit_score: base.credit_score, credit_history: base.credit_history, criminal_background: base.criminal_background,
      source: t.source, crm_status: t.stage, priority: t.tier === HIGH ? "high" : "medium",
      notes: t.notes, locator_notes: t.loc,
      follow_up_count: followUps,
      created_at: daysAgo(t.age),
      first_text_sent_at: contactedAgo != null ? daysAgo(contactedAgo) : null,
      last_contacted_at: contactedAgo != null ? daysAgo(Math.max(0, contactedAgo - followUps)) : null,
      next_follow_up: t.overdueFU ? dateAgo(t.overdueFU) : (["new", "contacted", "list_sent"].includes(t.stage) ? dateFromNow(2) : null),
      closed_at: t.closedAgo != null ? daysAgo(t.closedAgo) : null,
      archive_reason: t.archive ?? null,
      utm_campaign: SEED_TAG, // ← seed marker (reset targets this only)
      utm_source: t.source,
      workspace_id: scope.workspaceId, owner_user_id: scope.userId,
      ...(t.invoice ? {
        invoice_property_name: t.invoice.prop, invoice_base_rent: t.invoice.rent,
        invoice_commission_pct: 50, invoice_expected_commission: t.invoice.commission,
        invoice_submitted: true, invoice_commission_paid: !!t.invoice.paid,
      } : {}),
    };

    const { data: ins, error } = await admin.from("leads").insert(leadRow).select("id").single();
    if (error) { console.error("  lead insert failed:", t.first, error.message); continue; }
    const leadId = ins.id;
    leadCount++;

    // AI Client Insights
    await admin.from("ai_client_briefs").insert({
      lead_id: leadId, insights: t.insights, last_conversation: t.conv || null,
      message_count: t.conv ? 4 + (leadCount % 6) : 0, last_synced_at: daysAgo(contactedAgo ?? t.age),
      workspace_id: scope.workspaceId, owner_user_id: scope.userId,
    });
    briefCount++;

    // Next Actions
    const actions = [];
    if (t.overdueFU) actions.push({ title: "Follow up (overdue)", due_at: daysAgo(t.overdueFU), priority: "high", completed: false });
    if (t.stage === "new") actions.push({ title: "Send first message", due_at: daysFromNow(0), priority: "high", completed: false });
    if (t.stage === "contacted" && !t.overdueFU) actions.push({ title: "Send apartment options", due_at: daysFromNow(1), priority: "medium", completed: false });
    if (t.stage === "list_sent" && t.favorites) actions.push({ title: "Email Guest Card", due_at: daysFromNow(1), priority: "high", completed: false });
    if (t.stage === "ready_to_tour") actions.push({ title: `Confirm tour — ${t.tourProp}`, due_at: daysFromNow(t.tourInDays), priority: "high", completed: false });
    if (t.stage === "done_touring") actions.push({ title: "Send application link", due_at: daysFromNow(1), priority: "high", completed: false });
    if (t.stage === "applied") actions.push({ title: "Check application status", due_at: daysFromNow(2), priority: "medium", completed: false });
    if (t.stage === "closed") actions.push({ title: "Submit invoice", due_at: daysAgo(t.closedAgo - 1), priority: "low", completed: true, completed_at: daysAgo(t.closedAgo - 1) });
    for (const a of actions) {
      await admin.from("lead_next_actions").insert({ lead_id: leadId, ...a, workspace_id: scope.workspaceId, owner_user_id: scope.userId });
      actionCount++;
    }

    // Favorites (list_sent / tour leads)
    for (const [name, addr] of t.favorites ?? []) {
      await admin.from("lead_favorites").insert({ lead_id: leadId, property_name: name, property_address: addr, workspace_id: scope.workspaceId, owner_user_id: scope.userId });
      favCount++;
    }

    // Timeline history (backdated)
    if (contactedAgo != null) {
      const events = [{ type: "first_contact", method: "text", sequence: 1, occurred_at: daysAgo(contactedAgo) }];
      for (let i = 1; i <= followUps; i++) {
        events.push({ type: "follow_up", method: i % 2 ? "text" : "call", sequence: i + 1, occurred_at: daysAgo(Math.max(0, contactedAgo - i * 3)) });
      }
      for (const e of events) {
        await admin.from("lead_timeline").insert({ lead_id: leadId, ...e, metadata: {}, created_by: scope.userId, workspace_id: scope.workspaceId, owner_user_id: scope.userId });
        tlCount++;
      }
    }
  }
  console.log(`  seeded: ${leadCount} leads · ${actionCount} next actions · ${tlCount} timeline events · ${briefCount} AI briefs · ${favCount} favorites`);
}

// ── run ───────────────────────────────────────────────────────────────────────
try {
  const scope = await resolveOwner();
  console.log(`Owner: ${email}  ·  workspace ${scope.workspaceId.slice(0, 8)}…`);
  await reset(scope);
  if (!resetOnly) await seed(scope);
  console.log("Done.");
} catch (err) {
  console.error("✗ " + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
}
