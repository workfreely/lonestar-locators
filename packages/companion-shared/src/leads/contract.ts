/**
 * Public Companion API contract — runtime-validated with Zod. This is the STABLE
 * surface the extension talks to; it is intentionally a camelCase projection, not
 * the raw `leads` row (server maps row → this). Validate at every API boundary.
 *
 * Outcome/disposition fields appear ONLY as OPTIONAL extension points, per the
 * approved decision to preserve current behavior — do not make them required or
 * build UI for them in this refactor.
 */

import { z } from "zod";
import { LEAD_STAGES } from "./stages";

export const leadStageSchema = z.enum(LEAD_STAGES);
export const prioritySchema = z.enum(["low", "medium", "high"]);

/** Lead id may be a numeric bigint or a demo string id. */
export const leadIdSchema = z.union([z.number(), z.string().min(1)]);
export const nextActionIdSchema = z.union([z.number(), z.string().min(1)]);

// ── Sub-objects ──────────────────────────────────────────────────────────────
export const rangeSchema = z.object({
  min: z.number().nullish(),
  max: z.number().nullish(),
});

export const searchCriteriaSchema = z.object({
  city: z.string().nullish(),
  interest: z.string().nullish(), // inferred market for short leads
  budgetText: z.string().nullish(), // preserves the "$1,149 – $1,958" display form
  budget: rangeSchema.nullish(),
  // Monthly Household Income — the SmartLead Form's canonical range string,
  // stored verbatim (value === label), e.g. "$4,000 – $6,000 / month". Nullish
  // when the form did not collect it; the row is then omitted (never blank/$0).
  income: z.string().nullish(),
  propertyType: z.string().nullish(),
  /** Structured Must-Have Amenities (canonical option values, max 3). Empty when the
   *  client never supplied any — the Companion's Amenities row then stays hidden. */
  mustHaveAmenities: z.array(z.string()).nullish(),
  beds: z.string().nullish(),
  baths: z.string().nullish(),
  moveDate: z.string().nullish(),
  desiredAreas: z.string().nullish(),
  /** Commute / Destination — the client-facing LABEL of the place they need to be
   *  near ("Fort Sam"). The canonical Google place_id stays server-side: the
   *  Companion displays this destination, it does not route from it. Nullish when
   *  the locator hasn't set one, and the row is then omitted. */
  commuteDestination: z.string().nullish(),
  source: z.string().nullish(),
});

/** One criterion's movement within a single Client History entry. Pre-formatted
 *  display strings — an audit record keeps saying what it said. "" means the
 *  criterion had no value on that side (a seeded form value has from: ""). */
export const criteriaChangeSchema = z.object({
  label: z.string(),
  from: z.string(),
  to: z.string(),
});

/** ONE meaningful client-profile update, which may carry several field changes —
 *  "within 20 minutes of Lackland AFB" sets a destination AND a maximum, and is
 *  one thing that happened, so it is one entry. */
export const clientHistoryEntrySchema = z.object({
  occurredAt: z.string(),
  /** "form" | "edit_client" | "conversation" — the machine code. */
  source: z.string(),
  /** Already-resolved heading ("Lead Form" / "Manual Edit" / "Client
   *  Conversation") so the panel needs no source→label table. */
  sourceLabel: z.string(),
  changes: z.array(criteriaChangeSchema),
});

export const creditScreeningSchema = z.object({
  creditScore: z.string().nullish(),
  creditHistory: z.string().nullish(),
  brokenLeaseAge: z.string().nullish(),
  evictionAge: z.string().nullish(),
  criminalBackground: z.string().nullish(),
  felonyAge: z.string().nullish(),
  misdemeanorAge: z.string().nullish(),
});

export const nextActionSchema = z.object({
  id: nextActionIdSchema,
  leadId: leadIdSchema,
  title: z.string(),
  dueAt: z.string().nullish(),
  priority: prioritySchema,
  notes: z.string().nullish(),
  completed: z.boolean(),
  completedAt: z.string().nullish(),
  propertyName: z.string().nullish(),
  /**
   * Resting status label for this open action, when it differs from the default
   * Pending/Overdue derivation — e.g. a New lead's Follow Up that came from a
   * "No Answer" ("No Answer") or a sent text ("Waiting for Reply"). Overdue still
   * wins when the due date passes (decided in the panel from dueAt). Nullish for
   * ordinary actions, which stay Pending/Overdue.
   */
  statusLabel: z.string().nullish(),
  /**
   * The canonical workflow identity (setup_tour, check_application, follow_up_1 …), or null for a
   * manual task the locator created.
   *
   * It must be DECLARED here or it does not exist: zod strips unknown keys, which is exactly how
   * completedVia was silently discarded above. The panel uses it to decide whether a task's title
   * may be edited — on identity, never on the display label, which is translated for humans and is
   * not what any workflow rule matches on.
   */
  actionKey: z.string().nullish(),
  /**
   * Is this the LOCATOR'S OWN reminder rather than a step of the leasing workflow?
   *
   * Derived server-side, because it cannot be inferred here. actionKey alone is not enough: the
   * DTO also emits SYNTHETIC workflow entries — the computed stage action, and the aggregated
   * guest-card row — which carry no action_key and would otherwise be indistinguishable from a
   * manual task. Sniffing their id prefixes in the panel would be guessing at a fact the server
   * already knows.
   *
   * Nullish for forward/backward compatibility; absent is read as "not manual", which keeps an
   * older payload behaving exactly as it does today.
   */
  isManual: z.boolean().nullish(),
  /** Optional extension point — reserved, not collected today. */
  outcome: z.string().nullish(),
});
export type NextActionDTO = z.infer<typeof nextActionSchema>;

export const workflowStateSchema = z.object({
  followUpCount: z.number().default(0),
  nextActionDate: z.string().nullish(),
  firstContactAt: z.string().nullish(),
});

/**
 * Last Action — the most recently successfully COMPLETED workflow action (title
 * + when). Null for a brand-new lead where nothing has been completed yet (do
 * NOT fabricate one). Derived canonically (see lib/companion/leadToDto), never
 * from UI state; a "No Answer" attempt is NOT a completion and never appears here.
 */
export const lastActionSchema = z.object({
  title: z.string(),
  completedAt: z.string().nullish(),
  /** The property this completed action was for (Tour Scheduled / Guest Card
   *  Sent snapshot its Favorite name). Null for non-property actions (Contact
   *  Lead, follow-ups, …) so the panel appends "· {property}" only when real. */
  propertyName: z.string().nullish(),
  /**
   * HOW it was completed — "manual" (a person) or "followup_agent" (an acknowledged automated
   * send). Null for a row completed before lead_next_actions.completed_via existed, and the
   * panel then shows no method at all rather than guessing one.
   *
   * It must be declared here or it does not exist: zod strips unknown keys, so leadToDto was
   * setting this field and the schema was silently discarding it before the Companion ever saw
   * it. That is why the approved Automated indicator never appeared.
   */
  completedVia: z.string().nullish(),
});
export type LastActionDTO = z.infer<typeof lastActionSchema>;

/** Read-only invoice/commission summary for a Closed lead — the SAME canonical
 *  leads.invoice_* data the CRM Invoice Details section shows, projected for the
 *  Companion's read-only view. Populated only when the lead is Closed and has
 *  collected invoice data; null otherwise. The Companion never writes it. */
export const invoiceSummarySchema = z.object({
  contactName: z.string().nullish(),
  contactTitle: z.string().nullish(),
  notes: z.string().nullish(),
  propertyName: z.string().nullish(),
  unitNumber: z.string().nullish(),
  leaseStartDate: z.string().nullish(),
  leaseTerm: z.string().nullish(),
  baseRent: z.number().nullish(),
  commissionPct: z.number().nullish(),
  brokerSplitPct: z.number().nullish(),
  totalInvoice: z.number().nullish(),
  expectedCommission: z.number().nullish(),
  rebateType: z.string().nullish(),
  rebateAmount: z.number().nullish(),
  submitted: z.boolean().nullish(),
  commissionPaid: z.boolean().nullish(),
});
export type InvoiceSummaryDTO = z.infer<typeof invoiceSummarySchema>;

/** The safe lead projection the panel renders. No workspace_id, no soft-delete
 *  bookkeeping beyond what the UI needs. */
export const leadSummarySchema = z.object({
  id: leadIdSchema,
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  phone: z.string().nullish(),
  /** Client email (leads.email). Display/autofill only — used to prefill a
   *  tour/contact form's email field. Nullish when the lead has no email. */
  email: z.string().nullish(),
  stage: leadStageSchema,
  isArchived: z.boolean().default(false),
  archiveReason: z.string().nullish(),
  /** Pre-formatted canonical archive-reason label (e.g. "👻 Ghosted / No
   *  Response"), computed CRM-side via the ONE canonical map in
   *  lib/leads/archiveReasons so the Companion never re-derives or duplicates
   *  reason labels. Null for active leads / unmapped reasons. */
  archiveReasonLabel: z.string().nullish(),
  isClosed: z.boolean().default(false),
  /** On Hold — the search is paused (leads.held_at set). Distinct from archived:
   *  crm_status is preserved and the lead resumes to its stage. While held the
   *  Companion suppresses the active Next Action and shows the hold state. */
  isOnHold: z.boolean().default(false),
  /** The hold follow-up/reminder date (leads.hold_follow_up_at, YYYY-MM-DD). Null
   *  when not held. Display only. */
  holdFollowUpAt: z.string().nullish(),
  /** The hold follow-up as a real INSTANT (ISO): 9:00 AM local on hold_follow_up_at,
   *  computed CRM-side via the SAME canonical helper the Agenda uses
   *  (lib/leads/holdWorkflow.holdFollowUpInstant). The panel renders it through the
   *  shared due-date formatter (formatDueDateTime), exactly like the Next Action due,
   *  so the held follow-up date reads identically to the Agenda. Null when not held. */
  holdFollowUpDueAt: z.string().nullish(),
  searchCriteria: searchCriteriaSchema,
  creditScreening: creditScreeningSchema,
  /** CLIENT HISTORY — structured history of the five tracked search criteria,
   *  newest first. DISPLAY ONLY: searchCriteria above remains the current truth
   *  used for matching, and this never feeds it. Not AI Client Insights and not a
   *  conversation summary. Empty/absent for leads with no recorded change yet —
   *  including every lead created before this shipped, whose original form values
   *  were never preserved and are deliberately NOT reconstructed. */
  clientHistory: z.array(clientHistoryEntrySchema).nullish(),
  workflow: workflowStateSchema,
  /** Most recently COMPLETED workflow action (see lastActionSchema). Null when
   *  nothing has been completed yet — the panel then hides the Last Action row. */
  lastAction: lastActionSchema.nullish(),
  /** The lead's current Top Pick — the lead_favorites id of the single leading
   *  property (durable, one-per-lead). Null when none chosen. Application-phase
   *  actions associate with this property, not a generic Favorite. */
  topPickFavoriteId: z.union([z.string(), z.number()]).nullish(),
  /** Durable outcome of the client's submitted application for their Top Pick
   *  (pending | approved | denied | other). Null until a Check Application outcome
   *  is recorded. One application per lead (MVP); property-scoped to the Top Pick. */
  applicationStatus: z.string().nullish(),
  /** Read-only invoice/commission summary (Closed leads only). Same canonical
   *  leads.invoice_* data as the CRM Invoice Details section; null until collected. */
  invoice: invoiceSummarySchema.nullish(),
  /**
   * Client Notes — the client's original FORM-SUBMITTED notes, read-only. Maps to
   * the existing `leads.notes` column (the same data the CRM's Client Notes shows).
   * NOT a new field, and NOT the editable Locator Notes (`leads.locator_notes`).
   */
  clientNotes: z.string().nullish(),
  /**
   * Locator Notes — the AGENT-entered notes (`leads.locator_notes`), read-only.
   * May contain newer agent-confirmed location requirements. Added so Location Fit
   * can consider current agent context, not just the original form.
   */
  locatorNotes: z.string().nullish(),
  /**
   * AI Client Insights — the ≤4 short bullets from `ai_client_briefs.insights`,
   * read-only. Already derived from synced client conversations, so they may carry
   * newer location context. Never generated here — only surfaced for Location Fit.
   */
  aiInsights: z.array(z.string()).nullish(),
});
export type LeadSummaryDTO = z.infer<typeof leadSummarySchema>;
export type CriteriaChangeDTO = z.infer<typeof criteriaChangeSchema>;
export type ClientHistoryEntryDTO = z.infer<typeof clientHistoryEntrySchema>;

/** Full detail response: summary + open actions (+ favorites handled separately). */
export const leadDetailSchema = z.object({
  lead: leadSummarySchema,
  nextActions: z.array(nextActionSchema),
});
export type LeadDetailDTO = z.infer<typeof leadDetailSchema>;

/** A saved Favorite Property (lead_favorites) — the ONLY source of properties a
 *  tour can be scheduled against. Read-only projection the Companion renders in
 *  the Schedule Tour property dropdown; `id` is the stable lead_favorites.id that
 *  the scheduled tour (lead_tours.property_id) references. */
export const favoriteSchema = z.object({
  id: z.union([z.number(), z.string()]),
  propertyName: z.string(),
  propertyAddress: z.string().nullish(),
  /** Property photo (property_catalog.property_image_url), resolved read-side.
   *  Shown as the Favorite/Tour-card thumbnail; null → the clean placeholder. */
  propertyImageUrl: z.string().nullish(),
  propertyUrl: z.string().nullish(),
  /** The property's REAL website (property_catalog.website_url), resolved read-side.
   *  The only URL a name/thumbnail link may open — never propertyUrl (Google Maps). */
  websiteUrl: z.string().nullish(),
  /** Google Places star rating (0.0–5.0), resolved read-side from
   *  property_catalog by the property's Place ID (never stored on lead_favorites).
   *  Null when the property is uncatalogued or unrated; the card omits it then. */
  googleRating: z.number().nullish(),
  /** Why this Favorite cannot currently move back to Recommendations (Top Pick,
   *  scheduled tour, open property-scoped action), or null when the move is allowed.
   *  Resolved server-side where the tours/actions live; the CRM re-checks on receipt. */
  moveBlockedReason: z.string().nullish(),
});
export type FavoriteDTO = z.infer<typeof favoriteSchema>;

/** A canonical Recommended Property (lead_recommendations) for THIS client — the
 *  properties Locator Beast recommends, distinct from the locator's saved
 *  Favorites. Read-only projection the Companion renders; same shape as
 *  FavoriteDTO. `id` is the stable lead_recommendations.id. */
export const recommendationSchema = z.object({
  id: z.union([z.number(), z.string()]),
  propertyName: z.string(),
  propertyAddress: z.string().nullish(),
  propertyUrl: z.string().nullish(),
  /** The property's REAL website (property_catalog.website_url), resolved read-side.
   *  The only URL a name/thumbnail link may open — never propertyUrl (Google Maps). */
  websiteUrl: z.string().nullish(),
  /** Google Places star rating (0.0–5.0), resolved read-side from
   *  property_catalog by the property's Place ID (never stored on
   *  lead_recommendations). Null when uncatalogued/unrated; the card omits it. */
  googleRating: z.number().nullish(),
});
export type RecommendationDTO = z.infer<typeof recommendationSchema>;

// ── Request DTOs (validate on the server) ────────────────────────────────────
export const advanceStageInput = z.object({
  leadId: leadIdSchema,
  toStage: leadStageSchema,
});

export const setFollowUpInput = z.object({
  leadId: leadIdSchema,
  step: z.number().int().min(0).max(4),
});

export const doneForNowInput = z.object({
  leadId: leadIdSchema,
  days: z.number().int().min(1),
});

export const archiveInput = z.object({ leadId: leadIdSchema });
export const restoreInput = z.object({ leadId: leadIdSchema });

export const createNextActionInput = z.object({
  leadId: leadIdSchema,
  title: z.string().min(1),
  dueAt: z.string(),
  priority: prioritySchema.default("medium"),
  notes: z.string().nullish(),
});

export const updateNextActionInput = z.object({
  actionId: nextActionIdSchema,
  title: z.string().min(1),
  dueAt: z.string(),
  priority: prioritySchema,
  notes: z.string().nullish(),
});

export const completeNextActionInput = z.object({
  actionId: nextActionIdSchema,
  /** Optional disposition — reserved extension point; ignored by the current
   *  server implementation (parity). */
  outcome: z.string().nullish(),
});

export const leadSearchQuery = z.object({
  query: z.string().default(""),
  limit: z.number().int().min(1).max(50).default(20),
});

// ── Response DTOs ────────────────────────────────────────────────────────────
/** Result of a mutation — the server returns the fields the caller must reflect
 *  (updated lead + any workflow-engine-created action) so the UI can update
 *  optimistically and the bridge can broadcast a minimal event. */
export const mutationResultSchema = z.object({
  ok: z.boolean(),
  lead: leadSummarySchema.nullish(),
  createdAction: nextActionSchema.nullish(),
  workflowAction: nextActionSchema.nullish(),
  error: z.string().nullish(),
});
export type MutationResultDTO = z.infer<typeof mutationResultSchema>;

export const leadSearchResultSchema = z.object({
  results: z.array(
    z.object({
      id: leadIdSchema,
      firstName: z.string().nullish(),
      lastName: z.string().nullish(),
      stage: leadStageSchema,
      phone: z.string().nullish(),
    }),
  ),
});
export type LeadSearchResultDTO = z.infer<typeof leadSearchResultSchema>;
