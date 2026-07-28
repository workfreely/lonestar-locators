// Demo Workspace — a client-side sample business shown while a profile has
// demo_mode on. NOTHING here is ever written to the shared leads table; these
// fixtures are passed straight into the CRM's client components in place of
// real data (see app/admin/leads/page.tsx and app/admin/performance/page.tsx),
// so Kanban, Agenda, AI Insights, Lead Panel and Analytics all populate.
// "Delete Demo Workspace" simply flips demo_mode off.
//
// The roster resembles a successful locator's real pipeline: an active board
// across every stage, a diverse cast of names/backgrounds, and each client
// teaching a different workflow (TikTok/Instagram/Facebook/Referral lead,
// luxury, second-chance, self-employed, military, high-rise, returning, cash
// rebate, tour completed, waiting on application, …). Every client carries a
// realistic AI brief (4 bullets + last conversation) so users see exactly what
// AI Insights looks like once Gmail/Calendar/Phone Sync/notes are connected.

import type { AiClientBrief } from "@/lib/types/aiClientBrief"

// Sensible starting goals when a profile hasn't set its own (Business Goals
// step defaults). Analytics are computed against these.
export const DEFAULT_MONTHLY_COMMISSION_GOAL = 15000
export const DEFAULT_AVG_COMMISSION_PER_LEASE = 1500

// ── Evergreen date helpers — keep the demo "current" no matter when viewed ──
const NOW = new Date()
function thisMonth(day: number, hour = 10): string {
  return new Date(NOW.getFullYear(), NOW.getMonth(), Math.min(Math.max(day, 1), 28), hour).toISOString()
}
function daysFromNow(n: number, hour = 9): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

export const DEMO_LEADS: any[] = [
  // ── New (3) ──
  {
    id: "demo-1", is_demo: true, crm_status: "new", lead_type: "long",
    first_name: "maria", last_name: "gonzalez", phone: "5125550142", email: "maria.g@example.com",
    city: "Austin", neighborhoods: "Downtown Austin, South Congress (SoCo)", desired_rent: "$1,500-$1,700",
    property_type: "Apartment", beds: "1", baths: "1", move_date: thisMonth(28),
    credit_score: 748, credit_history: "Clean", eviction_court: "No", criminal_background: "None",
    source: "tiktok", follow_up_count: 0, next_action_date: daysFromNow(0),
    notes: "Relocating to Austin for a role at Dell. First apartment on her own.",
    created_at: thisMonth(24),
  },
  {
    id: "demo-2", is_demo: true, crm_status: "new", lead_type: "long",
    first_name: "jalen", last_name: "brooks", phone: "5125550178", email: "jalen.b@example.com",
    city: "Austin", neighborhoods: "East Austin, Mueller", desired_rent: "$1,300-$1,500",
    property_type: "Apartment", beds: "1", baths: "1", move_date: thisMonth(28),
    credit_score: 694, credit_history: "Clean", eviction_court: "No", criminal_background: "None",
    source: "instagram", follow_up_count: 0, next_action_date: daysFromNow(-1),
    notes: "Found us on Instagram. First-time renter — needs guidance on the process.",
    created_at: thisMonth(23),
  },
  {
    id: "demo-3", is_demo: true, crm_status: "new", lead_type: "long",
    first_name: "priya", last_name: "nair", phone: "5125550111", email: "priya.n@example.com",
    city: "Austin", neighborhoods: "All of Austin", desired_rent: "$1,800-$2,100",
    property_type: "Apartment", beds: "2", baths: "2", move_date: thisMonth(27),
    credit_score: 792, credit_history: "Clean", eviction_court: "No", criminal_background: "None",
    source: "referral", follow_up_count: 0, next_action_date: daysFromNow(1),
    notes: "Referred by a past client. Excellent file — approvals will be easy.",
    created_at: thisMonth(22),
  },

  // ── Contacted (2) ──
  {
    id: "demo-4", is_demo: true, crm_status: "contacted", lead_type: "long",
    first_name: "devon", last_name: "carter", phone: "5125550120", email: "devon.c@example.com",
    city: "Austin", neighborhoods: "All of Austin", desired_rent: "$1,200-$1,400",
    property_type: "Apartment", beds: "1", baths: "1", move_date: thisMonth(26),
    credit_score: 640, credit_history: "Clean", eviction_court: "No", criminal_background: "None",
    source: "facebook", follow_up_count: 0, next_action_date: daysFromNow(0),
    notes: "Facebook lead. Credit-friendly file — needs 600-minimum communities.",
    created_at: thisMonth(20),
  },
  {
    id: "demo-5", is_demo: true, crm_status: "contacted", lead_type: "long",
    first_name: "marcus", last_name: "reed", phone: "5125550155", email: "marcus.r@example.com",
    city: "Austin", neighborhoods: "South Austin, Zilker", desired_rent: "$1,500-$1,700",
    property_type: "Apartment", beds: "1", baths: "1", move_date: thisMonth(28),
    credit_score: 726, credit_history: "Clean", eviction_court: "No", criminal_background: "None",
    source: "website", follow_up_count: 0, next_action_date: daysFromNow(1),
    notes: "Self-employed — qualifies on bank statements, not pay stubs.",
    created_at: thisMonth(19),
  },

  // ── Searching (3) ──
  {
    id: "demo-6", is_demo: true, crm_status: "searching", lead_type: "long",
    first_name: "sarah", last_name: "kim", phone: "5125550133", email: "sarah.k@example.com",
    city: "Cedar Park", neighborhoods: "Cedar Park", desired_rent: "$1,500-$1,700",
    property_type: "Apartment", beds: "2", baths: "1", move_date: thisMonth(28),
    credit_score: 662, credit_history: "Broken Lease", broken_lease_age: "2 years",
    eviction_court: "No", criminal_background: "None",
    source: "website", follow_up_count: 0, next_action_date: daysFromNow(0),
    notes: "Second-chance applicant — broken lease 2 years ago; stable since.",
    created_at: thisMonth(17),
  },
  {
    id: "demo-7", is_demo: true, crm_status: "searching", lead_type: "long",
    first_name: "miguel", last_name: "torres", phone: "2105550190", email: "miguel.t@example.com",
    city: "San Antonio", neighborhoods: "Stone Oak, La Cantera/The Rim", desired_rent: "$1,600-$1,900",
    property_type: "Apartment", beds: "2", baths: "2", move_date: thisMonth(28),
    credit_score: 715, credit_history: "Clean", eviction_court: "No", criminal_background: "None",
    source: "google", follow_up_count: 0, next_action_date: daysFromNow(2),
    notes: "Active-duty with PCS orders. Qualifies on BAH — needs a military clause.",
    created_at: thisMonth(16),
  },
  {
    id: "demo-8", is_demo: true, crm_status: "searching", lead_type: "long",
    first_name: "sofia", last_name: "reyes", phone: "2105550122", email: "sofia.r@example.com",
    city: "San Antonio", neighborhoods: "All of San Antonio", desired_rent: "$1,700-$2,000",
    property_type: "Apartment", beds: "3", baths: "2", move_date: thisMonth(28),
    credit_score: 705, credit_history: "Clean", eviction_court: "No", criminal_background: "None",
    source: "facebook", follow_up_count: 0, next_action_date: daysFromNow(1),
    notes: "Family of four — needs a 3-bed near good schools; watching move-in cost.",
    created_at: thisMonth(15),
  },

  // ── List Sent (3) ──
  {
    id: "demo-9", is_demo: true, crm_status: "list_sent", lead_type: "long",
    first_name: "emily", last_name: "watson", phone: "5125550166", email: "emily.w@example.com",
    city: "Austin", neighborhoods: "Downtown Austin", desired_rent: "$2,500-$3,000",
    property_type: "High-Rise", beds: "2", baths: "2", move_date: thisMonth(28),
    credit_score: 788, credit_history: "Clean", eviction_court: "No", criminal_background: "None",
    source: "instagram", follow_up_count: 1, next_action_date: daysFromNow(0),
    notes: "Luxury renter — sent a premium downtown list; budget flexible for finishes.",
    created_at: thisMonth(14),
  },
  {
    id: "demo-10", is_demo: true, crm_status: "list_sent", lead_type: "long",
    first_name: "kevin", last_name: "o'brien", phone: "5125550177", email: "kevin.o@example.com",
    city: "Austin", neighborhoods: "Downtown Austin", desired_rent: "$2,000-$2,300",
    property_type: "High-Rise", beds: "1", baths: "1", move_date: thisMonth(28),
    credit_score: 761, credit_history: "Clean", eviction_court: "No", criminal_background: "None",
    source: "tiktok", follow_up_count: 1, next_action_date: daysFromNow(-1),
    notes: "High-rise client — wants a downtown tower with skyline views, high floor.",
    created_at: thisMonth(13),
  },
  {
    id: "demo-11", is_demo: true, crm_status: "list_sent", lead_type: "long",
    first_name: "hannah", last_name: "lee", phone: "5125550144", email: "hannah.l@example.com",
    city: "Austin", neighborhoods: "North Austin, Domain", desired_rent: "$1,600-$1,800",
    property_type: "Apartment", beds: "1", baths: "1", move_date: thisMonth(28),
    credit_score: 733, credit_history: "Clean", eviction_court: "No", criminal_background: "None",
    source: "website", follow_up_count: 2, next_action_date: daysFromNow(-1),
    notes: "Comparing three options from the list; wants to tour before her lease ends.",
    created_at: thisMonth(12),
  },

  // ── Ready to Tour (2) ──
  {
    id: "demo-12", is_demo: true, crm_status: "ready_to_tour", lead_type: "long",
    first_name: "carlos", last_name: "mendez", phone: "5125550188", email: "carlos.m@example.com",
    city: "Austin", neighborhoods: "East Austin", desired_rent: "$1,600-$1,800",
    property_type: "Apartment", beds: "1", baths: "1", move_date: thisMonth(28),
    credit_score: 728, credit_history: "Clean", eviction_court: "No", criminal_background: "None",
    source: "referral", follow_up_count: 0, next_action_date: daysFromNow(1),
    notes: "Narrowed to two favorites — tours being set up for this weekend.",
    created_at: thisMonth(11),
  },
  {
    id: "demo-13", is_demo: true, crm_status: "ready_to_tour", lead_type: "long",
    first_name: "aisha", last_name: "rahman", phone: "5125550109", email: "aisha.r@example.com",
    city: "Austin", neighborhoods: "East Austin, Mueller", desired_rent: "$1,600-$1,800",
    property_type: "Apartment", beds: "1", baths: "1", move_date: thisMonth(28),
    credit_score: 752, credit_history: "Clean", eviction_court: "No", criminal_background: "None",
    source: "instagram", follow_up_count: 0, next_action_date: daysFromNow(0),
    notes: "Locked in on East Austin — wants weekday-evening tours.",
    created_at: thisMonth(11),
  },

  // ── Done Touring (2) ──
  {
    id: "demo-14", is_demo: true, crm_status: "done_touring", lead_type: "long",
    first_name: "ashley", last_name: "nguyen", phone: "5125550199", email: "ashley.n@example.com",
    city: "Austin", neighborhoods: "Mueller", desired_rent: "$1,700-$1,900",
    property_type: "Apartment", beds: "1", baths: "1", move_date: thisMonth(28),
    credit_score: 755, credit_history: "Clean", eviction_court: "No", criminal_background: "None",
    source: "tiktok", follow_up_count: 0, next_action_date: daysFromNow(0),
    notes: "Tour completed — deciding between her top two communities.",
    created_at: thisMonth(10),
  },
  {
    id: "demo-15", is_demo: true, crm_status: "done_touring", lead_type: "long",
    first_name: "marcus", last_name: "hill", phone: "5125550118", email: "marcus.h@example.com",
    city: "Austin", neighborhoods: "South Austin", desired_rent: "$1,500-$1,700",
    property_type: "Apartment", beds: "1", baths: "1", move_date: thisMonth(28),
    credit_score: 740, credit_history: "Clean", eviction_court: "No", criminal_background: "None",
    source: "facebook", follow_up_count: 0, next_action_date: daysFromNow(1),
    notes: "Finished tours; negotiating a look-and-lease special before applying.",
    created_at: thisMonth(9),
  },

  // ── Applied (3) ──
  {
    id: "demo-16", is_demo: true, crm_status: "applied", lead_type: "long",
    first_name: "tyler", last_name: "james", phone: "5125550101", email: "tyler.j@example.com",
    city: "Austin", neighborhoods: "South Congress (SoCo)", desired_rent: "$1,800-$2,000",
    property_type: "Apartment", beds: "2", baths: "2", move_date: thisMonth(28),
    credit_score: 771, credit_history: "Clean", eviction_court: "No", criminal_background: "None",
    source: "website", follow_up_count: 0, next_action_date: daysFromNow(2),
    notes: "Waiting on application — approval expected any day. Strong file.",
    created_at: thisMonth(8),
  },
  {
    id: "demo-17", is_demo: true, crm_status: "applied", lead_type: "long",
    first_name: "olivia", last_name: "park", phone: "5125550107", email: "olivia.p@example.com",
    city: "Austin", neighborhoods: "North Austin", desired_rent: "$1,500-$1,700",
    property_type: "Apartment", beds: "1", baths: "1", move_date: thisMonth(28),
    credit_score: 769, credit_history: "Clean", eviction_court: "No", criminal_background: "None",
    source: "referral", follow_up_count: 0, next_action_date: daysFromNow(2),
    notes: "Applied at her top choice — clean history, easy approval.",
    created_at: thisMonth(8),
  },
  {
    id: "demo-18", is_demo: true, crm_status: "applied", lead_type: "long",
    first_name: "jordan", last_name: "blake", phone: "5125550104", email: "jordan.b@example.com",
    city: "Austin", neighborhoods: "East Austin", desired_rent: "$1,400-$1,600",
    property_type: "Apartment", beds: "1", baths: "1", move_date: thisMonth(28),
    credit_score: 681, credit_history: "Clean", eviction_court: "No", criminal_background: "None",
    source: "youtube", follow_up_count: 0, next_action_date: daysFromNow(1),
    notes: "Applied with a co-signer to strengthen the file — waiting on their docs.",
    created_at: thisMonth(7),
  },

  // ── Closed (3) ──
  {
    id: "demo-19", is_demo: true, crm_status: "closed", lead_type: "long",
    first_name: "bianca", last_name: "flores", phone: "5125550102", email: "bianca.f@example.com",
    city: "Austin", neighborhoods: "Downtown Austin", desired_rent: "$1,900-$2,100",
    property_type: "Apartment", beds: "1", baths: "1", move_date: thisMonth(15),
    credit_score: 783, credit_history: "Clean", eviction_court: "No", criminal_background: "None",
    source: "referral", follow_up_count: 0, closed_at: thisMonth(12),
    notes: "Closed — signed a 12-month lease. Cash rebate sent to the client.",
    created_at: thisMonth(2),
  },
  {
    id: "demo-20", is_demo: true, crm_status: "closed", lead_type: "long",
    first_name: "greg", last_name: "underwood", phone: "5125550103", email: "greg.u@example.com",
    city: "Pflugerville", neighborhoods: "Pflugerville", desired_rent: "$1,600-$1,800",
    property_type: "Apartment", beds: "2", baths: "2", move_date: thisMonth(10),
    credit_score: 738, credit_history: "Clean", eviction_court: "No", criminal_background: "None",
    source: "tiktok", follow_up_count: 0, closed_at: thisMonth(9),
    notes: "Returning client — used the free-movers perk on his second lease with us.",
    created_at: thisMonth(1),
  },
  {
    id: "demo-21", is_demo: true, crm_status: "closed", lead_type: "long",
    first_name: "nina", last_name: "petrova", phone: "5125550106", email: "nina.p@example.com",
    city: "Austin", neighborhoods: "Downtown Austin", desired_rent: "$1,800-$2,000",
    property_type: "Apartment", beds: "1", baths: "1", move_date: thisMonth(18),
    credit_score: 774, credit_history: "Clean", eviction_court: "No", criminal_background: "None",
    source: "website", follow_up_count: 0, closed_at: thisMonth(14),
    notes: "Closed on a downtown 1-bed — smooth approval and quick turnaround.",
    created_at: thisMonth(3),
  },

  // ── Archived (2) — monthly Closed cleanup wins ──
  {
    id: "demo-22", is_demo: true, crm_status: "archived", archive_reason: "closed", lead_type: "long",
    first_name: "andre", last_name: "wells", phone: "5125550113", email: "andre.w@example.com",
    city: "Austin", neighborhoods: "North Austin", desired_rent: "$1,500-$1,700",
    property_type: "Apartment", beds: "1", baths: "1",
    credit_score: 742, credit_history: "Clean", eviction_court: "No", criminal_background: "None",
    source: "referral", follow_up_count: 0, closed_at: thisMonth(5),
    notes: "Closed earlier this month — archived in the monthly cleanup.",
    created_at: thisMonth(1),
  },
  {
    id: "demo-23", is_demo: true, crm_status: "archived", archive_reason: "closed", lead_type: "long",
    first_name: "daniel", last_name: "okafor", phone: "5125550114", email: "daniel.o@example.com",
    city: "Austin", neighborhoods: "South Austin", desired_rent: "$1,600-$1,800",
    property_type: "Apartment", beds: "1", baths: "1",
    credit_score: 758, credit_history: "Clean", eviction_court: "No", criminal_background: "None",
    source: "tiktok", follow_up_count: 0, closed_at: thisMonth(4),
    notes: "Closed earlier this month — archived in the monthly cleanup.",
    created_at: thisMonth(1),
  },
]

export const DEMO_ALL_LEADS: any[] = DEMO_LEADS

// Manual Next Actions — give the Agenda a mix of overdue / today / upcoming.
export const DEMO_NEXT_ACTIONS: any[] = [
  { id: 9001, lead_id: "demo-11", title: "FU1", due_at: daysFromNow(-1), priority: "high", notes: "Nudge for favorites", completed: false, created_at: thisMonth(12) },
  { id: 9002, lead_id: "demo-12", title: "Setup Tour", due_at: daysFromNow(1), priority: "high", notes: "Book weekend tours", completed: false, created_at: thisMonth(11) },
  { id: 9003, lead_id: "demo-14", title: "Follow Up", due_at: daysFromNow(0), priority: "medium", notes: "Which community won?", completed: false, created_at: thisMonth(10) },
  { id: 9004, lead_id: "demo-16", title: "Check App", due_at: daysFromNow(2), priority: "medium", notes: "Confirm approval", completed: false, created_at: thisMonth(8) },
]

// Favorite communities for the mid-funnel leads.
export const DEMO_FAVORITES: any[] = [
  { id: 8001, lead_id: "demo-12", property_name: "The Foundry", property_address: "1200 E 6th St, Austin", property_url: "https://example.com/the-foundry", created_at: thisMonth(11) },
  { id: 8002, lead_id: "demo-12", property_name: "Skyline Lofts", property_address: "500 Comal St, Austin", property_url: "https://example.com/skyline", created_at: thisMonth(11) },
  { id: 8003, lead_id: "demo-14", property_name: "Mueller Row", property_address: "4550 Mueller Blvd, Austin", property_url: "https://example.com/mueller-row", created_at: thisMonth(10) },
  { id: 8004, lead_id: "demo-9", property_name: "The Independent", property_address: "301 West Ave, Austin", property_url: "https://example.com/independent", created_at: thisMonth(14) },
]

// AI Insights briefs — one per sample client, each telling a different story.
function brief(idNum: number, insights: string[], last: string, syncDay = 0): AiClientBrief {
  return {
    id: `brief-demo-${idNum}`, lead_id: idNum as any,
    insights, last_conversation: last,
    message_count: 6 + idNum, last_message_rowid: null, last_message_date: daysFromNow(syncDay),
    last_synced_at: daysFromNow(syncDay), created_at: thisMonth(6), updated_at: daysFromNow(syncDay),
  }
}

const DEMO_BRIEFS: Record<string, AiClientBrief> = {
  "demo-1": brief(1, [
    "Relocating to Austin for a new position at Dell.",
    "First apartment on her own.",
    "Wants modern communities with a gym.",
    "Budget under $1,700. Prefers newer construction.",
  ], "Client loved the first two properties. Asked if we could find something with a larger kitchen before scheduling tours."),
  "demo-2": brief(2, [
    "Found us through an Instagram reel.",
    "First-time renter — needs help understanding the process.",
    "Targeting East Austin near the nightlife.",
    "Flexible on move date, firm on a $1,500 ceiling.",
  ], "Asked what documents he needs to get approved and how tours work.", -1),
  "demo-3": brief(3, [
    "Referred by a past client she works with.",
    "Excellent credit (792) — approvals will be easy.",
    "Wants a 2-bed so a roommate can join later.",
    "Not in a rush; wants the right long-term fit.",
  ], "Said she trusts our recommendation and is ready whenever we send options.", 1),
  "demo-4": brief(4, [
    "Came in from a Facebook ad.",
    "Credit is on the lower side (640) — needs 600-friendly communities.",
    "Open to anywhere in Austin for the right price.",
    "Wants to keep rent near $1,300.",
  ], "Asked which communities approve with a 640 score and no extra deposit."),
  "demo-5": brief(5, [
    "Self-employed — income shows on bank statements, not pay stubs.",
    "Needs communities that accept 12 months of statements.",
    "Strong reserves; low risk once documentation clears.",
    "Wants South Austin, walkable to coffee shops.",
  ], "Sending over his last three bank statements to pre-qualify.", 1),
  "demo-6": brief(6, [
    "Broken lease from two years ago on record.",
    "Needs second-chance / no-eviction-only communities.",
    "Otherwise stable income and clean recent history.",
    "Move date is firm for the 28th.",
  ], "Relieved we found three second-chance options — wants to see them this week."),
  "demo-7": brief(7, [
    "Active-duty with PCS orders to the area.",
    "Qualifies with BAH — needs military-clause leases.",
    "Timeline is tight around his report date.",
    "Prefers Stone Oak near the base.",
  ], "Confirmed his BAH amount and asked about military break-lease clauses.", 2),
  "demo-8": brief(8, [
    "Moving with two kids — needs a family-friendly 3-bed.",
    "Open to anywhere in San Antonio with good schools.",
    "Budget-conscious; watching total move-in cost.",
    "Wants in-unit laundry and a small yard.",
  ], "Asked us to prioritize communities zoned for the best elementary schools.", 1),
  "demo-9": brief(9, [
    "Luxury renter — wants a high-end downtown community.",
    "Budget is flexible above $2,500 for the right finishes.",
    "Priorities: concierge, rooftop pool, covered parking.",
    "Very decisive once she sees the right unit.",
  ], "Loved the premium list — asked to fast-track tours at her top two towers."),
  "demo-10": brief(10, [
    "Specifically wants a downtown high-rise with skyline views.",
    "Prefers a higher floor with floor-to-ceiling windows.",
    "Comfortable at $2,000–$2,300 for the view.",
    "Works from home — needs strong building internet.",
  ], "Asked which towers have units above the 20th floor available.", -1),
  "demo-11": brief(11, [
    "Comparing three communities from the list we sent.",
    "Weighing amenities against a slightly higher rent.",
    "Wants to tour before her lease is up in three weeks.",
    "Leaning toward the one closest to her office.",
  ], "Asked for a side-by-side of the three on price and pet fees.", -1),
  "demo-12": brief(12, [
    "Narrowed to two favorites in East Austin.",
    "Ready to sign quickly for the right unit.",
    "Has a small dog — pet policy matters.",
    "Tours being set up for this weekend.",
  ], "Confirmed Saturday tours at The Foundry and Skyline Lofts.", 1),
  "demo-13": brief(13, [
    "Locked in on East Austin near the train.",
    "Wants a 1-bed with a dedicated work nook.",
    "Budget $1,600–$1,800, flexible for in-unit laundry.",
    "Available to tour on weekday evenings.",
  ], "Asked us to schedule two tours after 6pm this week."),
  "demo-14": brief(14, [
    "Toured three communities and loved two.",
    "Deciding between Mueller Row and a downtown option.",
    "Move date is firm before month-end.",
    "Worried about the price gap between her top two.",
  ], "Asked for an updated quote on Mueller Row before she decides."),
  "demo-15": brief(15, [
    "Finished tours and is leaning toward one community.",
    "Trying to negotiate a look-and-lease special.",
    "Ready to apply once the concession is confirmed.",
    "Strong file — approval won't be an issue.",
  ], "Waiting to hear if the community will waive the admin fee.", 1),
  "demo-16": brief(16, [
    "Application submitted — approval expected any day.",
    "Strong 771 credit; low risk of falling through.",
    "Already asking about move-in logistics and the rebate.",
    "Wants to schedule movers as soon as he's approved.",
  ], "Said he submitted everything and is waiting to hear back.", -2),
  "demo-17": brief(17, [
    "Applied at her top choice this week.",
    "Clean history and solid income — easy approval.",
    "Wants a quick move-in if approved.",
    "Asked about renter's insurance requirements.",
  ], "Confirmed her application is in and asked about next steps.", -1),
  "demo-18": brief(18, [
    "Applied with a co-signer to strengthen the file.",
    "Waiting on the co-signer's documents to finish.",
    "First-year professional building credit.",
    "Eager, but needs the co-signer to move fast.",
  ], "Nudging his co-signer to upload their pay stubs today.", 1),
  "demo-19": brief(19, [
    "Closed — signed a 12-month lease downtown.",
    "Cash rebate has been sent to the client.",
    "Great experience; likely to refer friends.",
    "Asked about the referral program.",
  ], "Thanked us for the rebate and said she'll send referrals our way.", -3),
  "demo-20": brief(20, [
    "Returning client on his second lease with us.",
    "Used the free-movers perk on this move.",
    "Trusts our picks — minimal back-and-forth.",
    "Happy to be a reference for new clients.",
  ], "Confirmed his move date and thanked us for the free movers.", -4),
  "demo-21": brief(21, [
    "Closed on a downtown 1-bed she loved.",
    "Smooth approval and quick turnaround.",
    "Move-in scheduled for early next month.",
    "Interested in our rebate on her next renewal.",
  ], "Signed the lease and asked when the rebate posts.", -2),
  "demo-22": brief(22, [
    "Closed earlier this month — lease signed.",
    "Archived in the monthly cleanup.",
    "Low-maintenance client throughout the process.",
    "Good candidate for a renewal reminder later.",
  ], "Confirmed move-in and wrapped up — archived after closing.", -5),
  "demo-23": brief(23, [
    "Closed earlier this month on a South Austin unit.",
    "Archived during the monthly Closed cleanup.",
    "Referred by a coworker; smooth process.",
    "Left a five-star review after moving in.",
  ], "Moved in successfully and left a great review — archived.", -6),
}

export function getDemoBrief(leadId: string | number): AiClientBrief | null {
  return DEMO_BRIEFS[String(leadId)] ?? null
}

export function isDemoLeadId(leadId: string | number | null | undefined): boolean {
  return typeof leadId === "string" && leadId.startsWith("demo-")
}
