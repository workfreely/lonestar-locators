/**
 * Sensitive-data store — the ONE place Beast Companion keeps client or property
 * information, and the ONE place that decides when it may be kept at all.
 *
 * WHY THIS EXISTS
 * The active-client payload carries regulated screening data (income, credit
 * score and history, broken-lease and eviction age, criminal background) about
 * people who never installed this extension. Previously it went into
 * chrome.storage.LOCAL with no owner, no expiry, and no clear path — it survived
 * sign-out and browser restarts, so the next person to open Chrome on a shared
 * machine saw the previous locator's client.
 *
 * THREE PROTECTIONS, ALL ENFORCED HERE
 *   1. AREA — chrome.storage.session. In-memory, wiped by Chrome when the
 *      browser closes. Never written to disk, so nothing outlives the browser.
 *   2. OWNER BINDING — every record is stamped with the CRM-supplied owner key
 *      ("<userId>:<workspaceId>"). A read by a different owner returns null AND
 *      erases the record, so one account can never see another's client on a
 *      shared browser.
 *   3. EXPIRY — records older than TTL_MS are treated as absent and erased on
 *      read, bounding retention even inside one long browser session.
 *
 * Consent lives in chrome.storage.LOCAL on purpose: it is a non-sensitive user
 * preference that SHOULD persist across restarts, so the disclosure is shown
 * once rather than every browser launch. It is the gate for everything above —
 * see gateAllowsWrite().
 *
 * No networking. This module performs no fetch of any kind, and nothing here
 * reaches the host page DOM.
 */

export const ACTIVE_CLIENT_KEY = "lb-active-client";
export const CURRENT_PROPERTY_KEY = "lb-current-property";
export const CONSENT_KEY = "lb-consent";

/** Sensitive records expire this long after being written. */
export const TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/** Bump when the disclosure text materially changes — forces re-consent. */
export const CONSENT_VERSION = 1;

export type ConsentRecord = { version: number; acceptedAt: number };

type Envelope<T> = { v: 1; owner: string; savedAt: number; payload: T };

type ChromeLike = {
  storage?: {
    session?: any;
    local?: any;
    onChanged?: { addListener: (f: any) => void; removeListener: (f: any) => void };
  };
};

const chromeApi = (): ChromeLike | undefined =>
  (globalThis as unknown as { chrome?: ChromeLike }).chrome;

/** Sensitive records: session area only. Never `local`. */
const sensitiveArea = (): any => chromeApi()?.storage?.session;
/** Consent: local area, so it survives a browser restart. */
const consentArea = (): any => chromeApi()?.storage?.local;

export const SENSITIVE_AREA_NAME = "session";

function isEnvelope<T>(v: unknown): v is Envelope<T> {
  if (!v || typeof v !== "object") return false;
  const e = v as Partial<Envelope<T>>;
  return e.v === 1 && typeof e.owner === "string" && typeof e.savedAt === "number";
}

// ── Consent ────────────────────────────────────────────────────────────────

export async function readConsent(): Promise<ConsentRecord | null> {
  const area = consentArea();
  if (!area) return null;
  try {
    const res = await area.get(CONSENT_KEY);
    const rec = res?.[CONSENT_KEY];
    if (!rec || typeof rec.version !== "number" || typeof rec.acceptedAt !== "number") return null;
    return rec.version === CONSENT_VERSION ? (rec as ConsentRecord) : null;
  } catch {
    return null;
  }
}

export async function hasConsent(): Promise<boolean> {
  return (await readConsent()) !== null;
}

export async function grantConsent(): Promise<void> {
  const area = consentArea();
  if (!area) return;
  try {
    await area.set({ [CONSENT_KEY]: { version: CONSENT_VERSION, acceptedAt: Date.now() } });
  } catch {
    /* storage unavailable — the gate stays closed, which is the safe default */
  }
}

/**
 * Revoke consent AND erase everything sensitive. Revoking must never leave data
 * behind, so the clear is part of the same operation.
 */
export async function revokeConsent(): Promise<void> {
  const area = consentArea();
  try {
    await area?.remove(CONSENT_KEY);
  } catch {
    /* best effort */
  }
  await clearSensitive();
}

// ── The write gate ─────────────────────────────────────────────────────────

/**
 * The single admission check for sensitive writes. Consent gates the BRIDGE
 * itself: without it nothing is stored, so there is no hidden-but-present data.
 */
export async function gateAllowsWrite(): Promise<boolean> {
  return (await hasConsent()) && !!sensitiveArea();
}

// ── Sensitive read / write ─────────────────────────────────────────────────

export async function writeSensitive<T>(key: string, owner: string, payload: T): Promise<boolean> {
  if (!owner) return false;
  if (!(await gateAllowsWrite())) return false;
  const area = sensitiveArea();
  const envelope: Envelope<T> = { v: 1, owner, savedAt: Date.now(), payload };
  try {
    await area.set({ [key]: envelope });
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a record for `owner`. Returns null — and ERASES the stored record — when
 * consent is absent, the owner differs, or the record has expired. Erase-on-read
 * is what makes an account switch self-healing without a sign-out signal.
 */
export async function readSensitive<T>(key: string, owner: string | null): Promise<T | null> {
  const area = sensitiveArea();
  if (!area) return null;
  if (!(await hasConsent())) {
    await clearSensitive();
    return null;
  }
  try {
    const res = await area.get(key);
    const env = res?.[key];
    if (!isEnvelope<T>(env)) return null;
    if (Date.now() - env.savedAt > TTL_MS) {
      await area.remove(key);
      return null;
    }
    if (owner !== null && env.owner !== owner) {
      await area.remove(key);
      return null;
    }
    return env.payload;
  } catch {
    return null;
  }
}

/** Unwrap an onChanged newValue, applying the same owner + expiry rules. */
export function unwrapEnvelope<T>(newValue: unknown, owner: string | null): T | null {
  if (!isEnvelope<T>(newValue)) return null;
  if (Date.now() - newValue.savedAt > TTL_MS) return null;
  if (owner !== null && newValue.owner !== owner) return null;
  return newValue.payload;
}

/** The owner stamped on a stored record, for adopting the current session's owner. */
export function envelopeOwner(newValue: unknown): string | null {
  return isEnvelope(newValue) ? newValue.owner : null;
}

/**
 * The owner of the CURRENT session, read from the stored active-client record.
 *
 * Pages that are not the CRM (a supported apartment-research site) never see the
 * signed-in identity, so they cannot stamp their own writes. They borrow the
 * owner the CRM already established. When there is none — no client selected
 * yet, or the record expired — property capture simply does not write, because
 * an unattributable record could later surface under the wrong account.
 */
export async function getSessionOwner(): Promise<string | null> {
  const area = sensitiveArea();
  if (!area) return null;
  if (!(await hasConsent())) return null;
  try {
    const res = await area.get(ACTIVE_CLIENT_KEY);
    const env = res?.[ACTIVE_CLIENT_KEY];
    if (!isEnvelope(env)) return null;
    if (Date.now() - env.savedAt > TTL_MS) return null;
    return env.owner;
  } catch {
    return null;
  }
}

/** Erase every sensitive record. Used by sign-out, revoke, and Clear stored data. */
export async function clearSensitive(): Promise<void> {
  const area = sensitiveArea();
  if (!area) return;
  try {
    await area.remove([ACTIVE_CLIENT_KEY, CURRENT_PROPERTY_KEY]);
  } catch {
    /* best effort */
  }
}

/**
 * Erase ONE sensitive record. Used for an explicit clear (e.g. the CRM signalled
 * that the transient Current Property is now empty) without touching the others.
 */
export async function removeSensitive(key: string): Promise<void> {
  const area = sensitiveArea();
  if (!area) return;
  try {
    await area.remove(key);
  } catch {
    /* best effort */
  }
}
