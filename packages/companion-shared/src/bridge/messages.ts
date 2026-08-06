/**
 * Same-window bridge + presence-handshake message contracts (Zod).
 *
 * HARD RULE: these messages cross an untrusted boundary (DOM CustomEvents /
 * window.postMessage between the Locator Beast page and the extension's content
 * script). They carry ONLY an authorized lead id, an event type, and a
 * version/timestamp — NEVER lead profiles, notes, credit info, or any client
 * PII. The receiving surface treats a message as a signal and re-fetches the
 * authorized data through the Companion API (which re-validates ownership).
 *
 * Every consumer MUST validate: (1) hostname is an allowed Locator Beast origin,
 * (2) the namespace matches, (3) the payload parses against these schemas,
 * (4) lead ownership — server-side on the API refetch. Fail closed otherwise.
 */

import { z } from "zod";
import { leadIdSchema } from "../leads/contract";

/** Versioned namespace — bump on any breaking change to these contracts. */
export const BRIDGE_NAMESPACE = "locatorbeast.companion.v1" as const;

/** DOM event name used for the same-window bridge (CustomEvent type). */
export const BRIDGE_EVENT_NAME = "locatorbeast:companion" as const;

/** Origins allowed to participate. Production is exact; dev is a clearly
 *  separated allowlist (never merged into the production check). */
export const PRODUCTION_ORIGINS = [
  "https://locatorbeast.com",
  "https://www.locatorbeast.com",
] as const;
export const DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
] as const;

export function isAllowedOrigin(origin: string, allowDev = false): boolean {
  if ((PRODUCTION_ORIGINS as readonly string[]).includes(origin)) return true;
  if (allowDev && (DEV_ORIGINS as readonly string[]).includes(origin)) return true;
  return false;
}

const base = {
  ns: z.literal(BRIDGE_NAMESPACE),
  /** performance.now()/Date-based monotonic stamp for ordering/staleness. */
  ts: z.number(),
};

/** The set of mutations the CRM cares about reflecting. */
export const mutationEventKind = z.enum([
  "stage_changed",
  "follow_up_changed",
  "action_created",
  "action_completed",
  "action_updated",
  "archived",
  "restored",
]);
export type MutationEventKind = z.infer<typeof mutationEventKind>;

// ── Presence handshake ───────────────────────────────────────────────────────
// All message schemas are `.strict()`: unknown keys FAIL parsing, so a page can
// never smuggle a client profile/notes/credit field through a bridge event.

/** content script → page: "Companion is available on this window." */
export const announceMsg = z
  .object({
    ...base,
    type: z.literal("companion:announce"),
    version: z.string(), // extension version
    capabilities: z.array(z.string()).default([]),
  })
  .strict();

/** page → content script: "CRM acknowledges; it may switch to Companion mode." */
export const ackMsg = z
  .object({
    ...base,
    type: z.literal("companion:ack"),
    accepted: z.boolean(),
  })
  .strict();

/** content script → page: "Companion is going away — restore the in-app panel." */
export const disconnectMsg = z
  .object({
    ...base,
    type: z.literal("companion:disconnect"),
  })
  .strict();

// ── Active-client + mutation events ──────────────────────────────────────────
/** page → content script → panel: user selected a lead (id only). */
export const activeClientMsg = z
  .object({
    ...base,
    type: z.literal("companion:active-client"),
    leadId: leadIdSchema,
  })
  .strict();

/** page → content script → panel: user gesture asks to OPEN the panel for a
 *  lead (opening the native side panel requires a user gesture). */
export const openForLeadMsg = z
  .object({
    ...base,
    type: z.literal("companion:open-for-lead"),
    leadId: leadIdSchema,
  })
  .strict();

/** either direction: a mutation happened; the other surface should refetch. */
export const mutationEventMsg = z
  .object({
    ...base,
    type: z.literal("companion:mutation"),
    leadId: leadIdSchema,
    event: mutationEventKind,
  })
  .strict();

export const bridgeMessage = z.discriminatedUnion("type", [
  announceMsg,
  ackMsg,
  disconnectMsg,
  activeClientMsg,
  openForLeadMsg,
  mutationEventMsg,
]);
export type BridgeMessage = z.infer<typeof bridgeMessage>;

/** Safe parse helper — returns the validated message or null (never throws into
 *  an event handler). Callers still gate on origin/hostname separately. */
export function parseBridgeMessage(raw: unknown): BridgeMessage | null {
  const parsed = bridgeMessage.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
