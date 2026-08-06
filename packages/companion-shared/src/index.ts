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
  leadSummarySchema,
  leadDetailSchema,
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
  LeadDetailDTO,
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

// Theme registry (all CRM themes, semantic tokens, safe Midnight fallback)
export {
  THEME_IDS,
  DEFAULT_THEME_ID,
  THEME_REGISTRY,
  isThemeId,
  resolveThemeId,
  themeIdSchema,
  semanticToCssVars,
} from "./tokens/themes";
export type { ThemeId, SemanticTokens } from "./tokens/themes";
