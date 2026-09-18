/**
 * @bc/companion-shared — shared domain types, runtime-validated (Zod) Companion
 * API + bridge contracts, and design tokens shared by the Locator Beast web app
 * and the Beast Companion extension.
 *
 * Phase 2 foundation: types, validation schemas, and tokens ONLY. No runtime
 * behavior, no DB access, no UI. Consumers wire it via the `@bc/*` path alias.
 */

// Domain — stages
export {
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LEAD_STAGE_TONE,
  isLeadStage,
} from "./leads/stages";
export type { LeadStage, BadgeTone } from "./leads/stages";

// Domain — tour completion status vs. client outcome
export {
  TOUR_STATUSES,
  TOUR_OUTCOMES,
  TOUR_OUTCOME_LABELS,
  isTourOutcome,
  tourStatusForOutcome,
} from "./leads/tourOutcome";
export type { TourStatus, TourOutcome } from "./leads/tourOutcome";

// Domain — application status (durable outcome of a submitted application)
export {
  APPLICATION_STATUSES,
  APPLICATION_OUTCOMES,
  APPLICATION_OUTCOME_LABELS,
  APPLICATION_FAVORITE_STATE,
  APPLICATION_LAST_ACTION_LABELS,
  isApplicationStatus,
} from "./leads/applicationOutcome";
export type { ApplicationStatus, ApplicationOutcome } from "./leads/applicationOutcome";

// Internal DB row shapes (mapped to the contract server-side; not the public surface)
export type {
  LeadRow,
  LeadNextActionRow,
  LeadId,
  NextActionId,
  LeadPriority,
} from "./leads/db-types";

// Public Companion API contract (Zod schemas + inferred types)
export {
  leadStageSchema,
  prioritySchema,
  leadIdSchema,
  nextActionIdSchema,
  searchCriteriaSchema,
  creditScreeningSchema,
  nextActionSchema,
  workflowStateSchema,
  invoiceSummarySchema,
  leadSummarySchema,
  leadDetailSchema,
  favoriteSchema,
  recommendationSchema,
  advanceStageInput,
  setFollowUpInput,
  doneForNowInput,
  archiveInput,
  restoreInput,
  createNextActionInput,
  updateNextActionInput,
  completeNextActionInput,
  leadSearchQuery,
  mutationResultSchema,
  leadSearchResultSchema,
} from "./leads/contract";
export type {
  NextActionDTO,
  LeadSummaryDTO,
  InvoiceSummaryDTO,
  LeadDetailDTO,
  FavoriteDTO,
  RecommendationDTO,
  MutationResultDTO,
  LeadSearchResultDTO,
} from "./leads/contract";

// Same-window bridge + presence handshake contracts
export {
  BRIDGE_NAMESPACE,
  BRIDGE_EVENT_NAME,
  PRODUCTION_ORIGINS,
  DEV_ORIGINS,
  isAllowedOrigin,
  mutationEventKind,
  announceMsg,
  ackMsg,
  disconnectMsg,
  activeClientMsg,
  openForLeadMsg,
  mutationEventMsg,
  bridgeMessage,
  parseBridgeMessage,
} from "./bridge/messages";
export type { BridgeMessage, MutationEventKind } from "./bridge/messages";

// Design tokens
export {
  MIDNIGHT,
  SHAPE,
  BADGE_TONES,
  paletteToCssVars,
} from "./tokens/tokens";
export type { CrmPalette, BadgeToneStyle } from "./tokens/tokens";

// Google rating display math (shared by the CRM card + Companion Current Property)
export { starFillPercent, formatRating } from "./format/rating";

// Display-only address formatting — drop trailing ", USA"/", United States"
// (shared by the CRM property card + Companion Current Property)
export { displayAddress } from "./format/address";
export { propertyWebsiteHref } from "./format/url";

// Date display formatting (timezone-safe, MM/DD/YYYY)
export { formatDateDisplay } from "./format/date";

// Next-Action due date/time formatting (Today/Tomorrow • time; shared with the CRM)
export { formatDueDateTime, isPastDue } from "./format/dueDate";
export type { DueDateFormatOptions } from "./format/dueDate";

// Schedule Tour autofill — the self-contained page filler + its typed contract
// (the CRM/Companion assemble the values; chrome.scripting injects the filler).
export { autofillTourForm } from "./autofill/formFill";
export {
  collectTourSelectionCandidates,
  decideSelection,
  parseDateValue,
  parseTimeValue,
  isMoveContext,
  isHoursContext,
  isTourContext,
  type DetectedSelection,
  type SelectionCandidate,
} from "./autofill/detectSelection";
export type {
  AutofillPayload, AutofillClient, AutofillLocator, AutofillResult,
  AutofillFieldReport, AutofillFieldKey, AutofillFieldAction,
} from "./autofill/types";

// 12h↔24h time-selection helpers (shared by the CRM DateTimePicker + the Beast
// Companion Tour Time picker so a chosen hour/minute/AM-PM maps to "HH:mm" the
// same way on both surfaces)
export { to24Hour, from24Hour, formatTimeLabel, DEFAULT_TIME_PARTS, DEFAULT_TIME_VALUE } from "./format/time";
export type { Period, TimeParts } from "./format/time";

// Person-name + phone display formatting (mirrors the CRM helpers; raw values
// are never modified — display/copy only)
export { formatPersonName, greetingName, displayFirstName, displayLastName, displayFullName } from "./format/name";
export type { PreferredNameParts } from "./format/name";
export { formatPhone } from "./format/phone";

// Read-only unit-number display ("3456" → "#3456"); raw value is never modified.
export { formatUnitDisplay } from "./format/unit";

// Canonical New-lead intro SMS body (prefilled first-outreach text; NOT contact)
export { buildIntroSmsBody } from "./format/introSms";
export { buildFollowUpSmsBody, buildContactFollowUpSmsBody } from "./format/followUpSms";

// Editable follow-up MESSAGE TEXT layer (content-only; no workflow coupling).
export {
  type FollowUpTemplateKey,
  DEFAULT_FOLLOW_UP_TEMPLATES,
  TEMPLATE_TOKENS,
  FOLLOW_UP_TOKEN_LABELS,
  TEMPLATE_CHAR_LIMITS,
  AGENT_TEMPLATE_VARIABLES,
  SYSTEM_TEMPLATE_TOKENS,
  renderTemplate,
  buildTextTop3Body,
} from "./format/followUpTemplates";

// Approved agent-variable value derivation + clean missing-value tidy (CP2.5).
export {
  type FollowUpVarInput,
  buildFollowUpTemplateVars,
  tidyRenderedMessage,
} from "./format/followUpVars";

// Workspace-level override shape + validation/merge (persistence layer, CP2).
export {
  type FollowUpOverrides,
  type SanitizeResult,
  type OverrideRejectReason,
  FOLLOW_UP_TEMPLATE_KEYS,
  isFollowUpTemplateKey,
  sanitizeFollowUpOverrides,
  mergeFollowUpTemplates,
} from "./format/followUpOverrides";

// Canonical workflow action identity (stable action_key set, shared CRM↔Companion)
export {
  WORKFLOW_ACTION_KEYS,
  workflowActionKeySchema,
  isWorkflowActionKey,
  ACTION_TYPES,
  actionTypeSchema,
  ACTION_ORIGINS,
  actionOriginSchema,
  ACTION_STATUSES,
  actionStatusSchema,
  CURRENT_WORKFLOW_VERSION,
} from "./leads/actionKeys";
export type { WorkflowActionKey, ActionType, ActionOrigin, ActionStatus } from "./leads/actionKeys";

// Workflow-action display labels (identity stays fu1/fu2/fu3/final_follow_up)
export {
  isFollowUpAction,
  isContactFollowUpAction,
  formatWorkflowActionLabel,
  workflowActionCompactLabel,
  formatLastActionLabel,
} from "./labels/workflowActions";

// Interactive-prompt ownership (Companion ↔ CRM). One workflow event → one
// interactive owner; the non-owning surface shows passive state only.
export {
  type PromptSurface,
  type WorkflowPromptId,
  WORKFLOW_PROMPT_OWNER,
  workflowPromptOwner,
  isCompanionOwned,
  isCrmOwned,
  CRM_INITIATED_CONFIRMATIONS,
  crmMayConfirm,
  companionMayConfirm,
} from "./workflow/promptOwnership";

// Current Client Context — the single resolved client-requirements projection every
// property-intelligence evaluator consumes (resolved once per client, reused per property)
export { resolveClientContext } from "./clientContext";
export type { ClientContext, ClientContextInput } from "./clientContext";

// Location Fit V1 — conservative, deterministic property-vs-client location match
export { evaluateLocationFit } from "./locationFit";
export { cityMismatch, propertyCityName } from "./locationFit";
export type { LocationFitVerdict, LocationFit, LocationFitResult, PropertyLocation } from "./locationFit";

// Approval V1 — management-intelligence risk (Low/Moderate/High/Unverified), evidence-only
export { evaluateApproval } from "./approval";
export type { ApprovalRisk, ApprovalResult } from "./approval";

// Amenities V1 — client amenity requirements vs SAD's own amenity text, evidence-only
export {
  evaluateAmenities,
  MAX_AMENITIES,
  MUST_HAVE_AMENITIES,
  MAX_MUST_HAVE_AMENITIES,
  isMustHaveAmenity,
  mustHaveAmenityLabel,
  mustHaveAmenityShortLabel,
  normalizeMustHaveAmenities,
} from "./amenities";
export type { PropertyAmenities, MustHaveAmenityValue } from "./amenities";

// Specials V1 — concession + rent DISPLAY normalization (interpretation only; the SAD
// specials/base-rent selectors are not confirmed yet, so nothing feeds it in the panel)
export { evaluateSpecials, selectRentConcession, formatSpecialText, formatRent, computeAvgRent, isQualifiedSpecial } from "./specials";
export type { SpecialInput, SpecialsResult, RentConcession } from "./specials";

// Budget V1 — client working budget vs the property's SAD rent range, evidence-only
export { evaluateBudget, resolveClientBudget, parseMoneyRange, budgetTolerance, BUDGET_TOLERANCE } from "./budget";
export type { MoneyRange } from "./budget";

// Phase 2A — grounded recommendation reasons: rank/cap the evidence-gated fragments
// the evaluators already produce (no new scoring, no LLM, never fabricated).
export { collectRecommendationReasons } from "./recommendationReasons";
export type { ReasonEvidence } from "./recommendationReasons";

// Overall Match % — composes the existing Location/Budget/Approval/Amenities signals
export { evaluateMatchScore, MIN_DIMENSIONS } from "./matchScore";
export type { MatchScoreInput, AmenityCoverage } from "./matchScore";
export { matchScoreTone } from "./matchScoreTone";
export type { MatchScoreTone } from "./matchScoreTone";

// Theme registry (all CRM themes, semantic tokens, safe Midnight fallback)
export {
  THEME_IDS,
  DEFAULT_THEME_ID,
  THEME_REGISTRY,
  THEME_SWATCHES,
  themeLabel,
  isThemeId,
  resolveThemeId,
  themeIdSchema,
  semanticToCssVars,
} from "./tokens/themes";
export type { ThemeId, SemanticTokens } from "./tokens/themes";
