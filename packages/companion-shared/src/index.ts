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

// Date display formatting (timezone-safe, MM/DD/YYYY)
export { formatDateDisplay } from "./format/date";

// Next-Action due date/time formatting (Today/Tomorrow • time; shared with the CRM)
export { formatDueDateTime, isPastDue } from "./format/dueDate";
export type { DueDateFormatOptions } from "./format/dueDate";

// 12h↔24h time-selection helpers (shared by the CRM DateTimePicker + the Beast
// Companion Tour Time picker so a chosen hour/minute/AM-PM maps to "HH:mm" the
// same way on both surfaces)
export { to24Hour, from24Hour, formatTimeLabel, DEFAULT_TIME_PARTS, DEFAULT_TIME_VALUE } from "./format/time";
export type { Period, TimeParts } from "./format/time";

// Person-name + phone display formatting (mirrors the CRM helpers; raw values
// are never modified — display/copy only)
export { formatPersonName } from "./format/name";
export { formatPhone } from "./format/phone";

// Read-only unit-number display ("3456" → "#3456"); raw value is never modified.
export { formatUnitDisplay } from "./format/unit";

// Canonical New-lead intro SMS body (prefilled first-outreach text; NOT contact)
export { buildIntroSmsBody } from "./format/introSms";
export { buildFollowUpSmsBody } from "./format/followUpSms";

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
  formatWorkflowActionLabel,
  workflowActionCompactLabel,
  formatLastActionLabel,
} from "./labels/workflowActions";

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
