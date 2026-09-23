/**
 * Runtime validation for everything Beast Companion accepts from outside itself.
 *
 * The content scripts listen on `window` inside the CRM page. Any script running
 * in that page — a third-party tag, an injected script, another extension — can
 * post a message that LOOKS like ours. Structural checks alone are not enough:
 * a forged payload could otherwise write attacker-chosen "client" data into the
 * panel, or wedge it with a huge string.
 *
 * So every accepted message must satisfy, in order:
 *   1. event.origin === window.location.origin  (exact, not a prefix or suffix)
 *   2. event.source === window                  (rejects iframes)
 *   3. a known envelope: { source: "lb-companion", type: <known> }
 *   4. a schema check on the payload, with hard caps on free text
 *
 * Unknown types are rejected rather than ignored-and-forwarded, so adding a new
 * message type is a deliberate act here, not an accident somewhere else.
 */

export const MSG_SOURCE = "lb-companion";

/** Every message type the content scripts will accept. Anything else is dropped. */
export const INBOUND_TYPES = ["active-client", "current-property", "changed", "signed-out", "enrich-property-result", "share-link-result"] as const;
export type InboundType = (typeof INBOUND_TYPES)[number];

/**
 * Caps on untrusted text. Client notes are genuinely long-form, so the limit is
 * generous — it exists to stop a multi-megabyte string exhausting the session
 * quota, not to truncate real content.
 */
export const MAX_TEXT = 20_000;
export const MAX_PAYLOAD_BYTES = 512 * 1024; // 512 KB
export const MAX_ARRAY = 500;

/** Exact-origin check. Never use startsWith/includes — "evil-locatorbeast.com" passes those. */
export function isSameOrigin(event: MessageEvent): boolean {
  try {
    return event.origin === window.location.origin;
  } catch {
    return false;
  }
}

/** Origin + source together: the two checks that must precede any schema work. */
export function isTrustedMessageEvent(event: MessageEvent): boolean {
  return event.source === window && isSameOrigin(event);
}

export function isKnownEnvelope(d: unknown): d is { source: string; type: InboundType; payload?: unknown } {
  if (!d || typeof d !== "object") return false;
  const m = d as { source?: unknown; type?: unknown };
  if (m.source !== MSG_SOURCE) return false;
  return typeof m.type === "string" && (INBOUND_TYPES as readonly string[]).includes(m.type);
}

/** Reject absurd payloads before they are stored. Cheap guard, bounded cost. */
export function isWithinSizeLimit(payload: unknown): boolean {
  try {
    const s = JSON.stringify(payload);
    if (typeof s !== "string") return false;
    return s.length <= MAX_PAYLOAD_BYTES;
  } catch {
    return false; // circular or non-serialisable — not something we accept
  }
}

function textOk(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.length <= MAX_TEXT);
}

function arrayOk(v: unknown): boolean {
  return v === undefined || v === null || (Array.isArray(v) && v.length <= MAX_ARRAY);
}

/**
 * Active-client payload schema. Deliberately shallow: the panel renders defensively
 * and the CRM is the authority on shape. What we enforce is that the record is
 * identifiable (a lead id), attributable (an owner), size-bounded, and that its
 * free-text and list fields cannot be used as a denial-of-service lever.
 */
export function isValidActiveClientPayload(
  payload: unknown,
): payload is { lead: { id: unknown }; owner: string } & Record<string, unknown> {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;

  const lead = p.lead as Record<string, unknown> | undefined;
  if (!lead || typeof lead !== "object") return false;
  const id = lead.id;
  if (id === undefined || id === null) return false;
  if (typeof id !== "string" && typeof id !== "number") return false;

  // Owner binding is mandatory: an unattributable record can never be safely read
  // back, so it is rejected at the door rather than stored and filtered later.
  if (typeof p.owner !== "string" || p.owner.length === 0 || p.owner.length > 200) return false;

  if (!textOk(lead.firstName) || !textOk(lead.lastName) || !textOk(lead.phone)) return false;
  if (!textOk(lead.clientNotes) || !textOk(lead.locatorNotes)) return false;
  if (!arrayOk(p.nextActions) || !arrayOk(p.favorites) || !arrayOk(p.recommendations)) return false;
  if (!arrayOk(lead.aiInsights)) return false;

  return isWithinSizeLimit(payload);
}

/** Identity/short-token fields: present, non-empty, and bounded. */
function idOk(v: unknown, max = 512): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= max;
}

/**
 * A coordinate is either genuinely absent (null/undefined) or a real, in-range
 * number. An out-of-range or non-finite value is treated as a FORGERY rather
 * than quietly nulled: our sender never produces one, so its presence means the
 * message did not come from us, and the whole message is rejected.
 */
function coordOk(v: unknown, limit: number): boolean {
  if (v === null || v === undefined) return true;
  return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit;
}

/**
 * Current-property payload schema — the Property Explorer → Companion handoff.
 *
 * Identity is mandatory (id, name, url) because this record can become a
 * Recommendation, and an unidentifiable property would be unusable there. The
 * geographic fields are optional throughout: a provider that exposes no
 * coordinates is a legitimate case, and the correct representation is absence,
 * never a substituted value.
 */
export function isValidCurrentPropertyPayload(
  payload: unknown,
): payload is {
  propertyId: string
  propertyName: string
  propertyUrl: string
} & Record<string, unknown> {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;

  if (!idOk(p.propertyId) || !idOk(p.propertyName, MAX_TEXT) || !idOk(p.propertyUrl)) return false;
  if (!textOk(p.propertyAddress)) return false;
  if (!coordOk(p.lat, 90) || !coordOk(p.lng, 180)) return false;
  if (p.placeId !== null && p.placeId !== undefined && !idOk(p.placeId)) return false;
  if (p.marketSlug !== null && p.marketSlug !== undefined && !idOk(p.marketSlug, 128)) return false;
  if (
    p.source !== undefined &&
    p.source !== "google_places" &&
    p.source !== "external_property_platform"
  )
    return false;
  // Google rating is optional; when present it must be a finite number on the
  // 0–5 scale. A malformed or out-of-range value is rejected at the door rather
  // than stored and shown.
  if (
    p.googleRating !== null &&
    p.googleRating !== undefined &&
    (typeof p.googleRating !== "number" ||
      !Number.isFinite(p.googleRating) ||
      p.googleRating < 0 ||
      p.googleRating > 5)
  )
    return false;
  // Canonical property_catalog card fields carried on a MAP-PICKED property (parity
  // with the SAD-enriched path). All optional nullable bounded strings; absent is
  // the normal case for a property with no canonical enrichment.
  if (!textOk(p.propertyImageUrlBackup)) return false;
  if (!textOk(p.propertyCurrentSpecial)) return false;
  if (!textOk(p.sendCommission)) return false;
  if (!textOk(p.escortCommission)) return false;
  if (!textOk(p.bonusFlat)) return false;
  if (!textOk(p.catalogVerifiedAt)) return false;

  return isWithinSizeLimit(payload);
}

/**
 * Enrichment-result payload — the CRM's catalog lookup answer for a the external site Current
 * Property (place_id resolution → property_catalog). Carries NO client data: a
 * request nonce plus catalog-derived, display-only fields. `placeId` and the three
 * enrichment fields are each present-and-bounded or explicitly null (unknown stays
 * unknown); `googleRating`, when present, is a finite 0–5 number.
 */
export function isValidEnrichResultPayload(
  payload: unknown,
): payload is {
  nonce: string
  placeId: string | null
  googleRating: number | null
  propertyImageUrl: string | null
  propertyImageUrlBackup: string | null
  websiteUrl: string | null
  currentSpecial: string | null
  sendCommission: string | null
  escortCommission: string | null
  bonusFlat: string | null
  verifiedAt: string | null
} {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  if (!idOk(p.nonce, 128)) return false;
  if (p.placeId !== null && !idOk(p.placeId)) return false;
  if (p.propertyImageUrl !== null && !idOk(p.propertyImageUrl, MAX_TEXT)) return false;
  if (p.propertyImageUrlBackup !== null && p.propertyImageUrlBackup !== undefined && !idOk(p.propertyImageUrlBackup, MAX_TEXT)) return false;
  if (p.websiteUrl !== null && !idOk(p.websiteUrl, MAX_TEXT)) return false;
  // Canonical card fields (present-and-bounded or null/undefined). currentSpecial is
  // verbatim master text (can be long) → MAX_TEXT; commission + verifiedAt are short.
  if (p.currentSpecial !== null && p.currentSpecial !== undefined && !idOk(p.currentSpecial, MAX_TEXT)) return false;
  if (p.sendCommission !== null && p.sendCommission !== undefined && !idOk(p.sendCommission)) return false;
  if (p.escortCommission !== null && p.escortCommission !== undefined && !idOk(p.escortCommission)) return false;
  if (p.bonusFlat !== null && p.bonusFlat !== undefined && !idOk(p.bonusFlat)) return false;
  if (p.verifiedAt !== null && p.verifiedAt !== undefined && !idOk(p.verifiedAt)) return false;
  if (
    p.googleRating !== null &&
    (typeof p.googleRating !== "number" ||
      !Number.isFinite(p.googleRating) ||
      p.googleRating < 0 ||
      p.googleRating > 5)
  )
    return false;
  return isWithinSizeLimit(payload);
}

/**
 * Share-link-result payload — the CRM's answer to a Send List share request. Carries
 * NO client PII: a request nonce, the resolved lead id, and the snapshot's stable
 * client URL (or an error string). `shareId`/`url` are present-and-bounded or null;
 * `reused` is a boolean; `error` is null on success or a short bounded string. The
 * URL must be an https/http locatorbeast /r/<token> link — never a data:/javascript:
 * scheme — so a forged result can't turn Preview/Copy into an arbitrary-URL launcher.
 */
export function isValidShareLinkResultPayload(
  payload: unknown,
): payload is {
  nonce: string
  leadId: string | number
  shareId: string | null
  url: string | null
  listNumber: number | null
  reused: boolean
  error: string | null
} {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  if (!idOk(p.nonce, 128)) return false;
  if (p.leadId === undefined || p.leadId === null) return false;
  if (typeof p.leadId !== "string" && typeof p.leadId !== "number") return false;
  if (p.shareId !== null && !idOk(p.shareId)) return false;
  if (p.url !== null) {
    if (!idOk(p.url, MAX_TEXT)) return false;
    // Only http(s) URLs are acceptable targets for window.open / clipboard.
    if (!/^https?:\/\//i.test(p.url)) return false;
  }
  if (p.listNumber !== null && typeof p.listNumber !== "number") return false;
  if (typeof p.reused !== "boolean") return false;
  if (p.error !== null && !idOk(p.error, 512)) return false;
  return isWithinSizeLimit(payload);
}

/** Theme messages carry no client data — only a short, bounded identifier. */
export function isValidThemePayload(payload: unknown): payload is string {
  return typeof payload === "string" && payload.length > 0 && payload.length <= 64;
}

/**
 * Same-extension sender check for chrome.runtime messages.
 *
 * The manifest declares no `externally_connectable`, so web pages cannot reach
 * this listener at all — but asserting sender.id keeps that true if the manifest
 * ever changes. Messages from our own content scripts carry sender.id === our id
 * and a sender.tab; the side panel carries the id with no tab. Both are allowed.
 */
export function isSameExtensionSender(sender: { id?: string } | undefined): boolean {
  const rt = (globalThis as unknown as { chrome?: { runtime?: { id?: string } } }).chrome?.runtime;
  const self = rt?.id;
  if (!self) return false;
  return sender?.id === self;
}
