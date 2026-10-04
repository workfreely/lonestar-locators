import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Out-of-Office state for the Companion menu — the PANEL end of the round trip
 * relayed by content/outOfOfficeBridge.ts.
 *
 * The panel is never the authority. Every value rendered here came back from the
 * database by way of the authenticated CRM page; nothing is kept locally and
 * nothing is assumed. That is deliberate for this particular control: the whole
 * question it answers is "am I currently away?", and a cached answer that happens
 * to be wrong is worse than no answer, because the locator would stop checking.
 *
 * Consequences of that choice, both intentional:
 *   • state is re-read EVERY time the control opens, so closing and reopening the
 *     panel (or the whole browser) shows what the server actually holds;
 *   • if no CRM tab is open, there is nobody to perform the authenticated call, so
 *     the control reports "unreachable" rather than showing a stale toggle. The
 *     panel holds no locatorbeast.com session and the extension requests no host
 *     permission for it, so this is a real limit of the architecture, not a bug to
 *     paper over — and it is the same limit the Send List share link already has.
 *
 * Every request carries a fresh nonce. Two reasons: chrome.storage.onChanged only
 * fires when a value actually changes, so an identical repeated request would
 * otherwise be silently dropped; and a result is accepted only when its nonce
 * matches the request in flight, so a late answer to a superseded request can
 * never overwrite a newer one.
 */

const REQUEST_KEY = "lb-ooo-request";
const RESULT_KEY = "lb-ooo-result";

/** How long to wait for the CRM page to answer before calling it unreachable.
 *  Generous: the CRM does a network round trip of its own inside this window. */
const TIMEOUT_MS = 8000;

export type OooStatus = "loading" | "ready" | "unreachable" | "saving";

export type OooView = {
  status: OooStatus;
  enabled: boolean;
  until: string | null;
  previewUrl: string | null;
  /** Last failure reported BY the server (not a transport failure). */
  error: string | null;
  refresh: () => void;
  /** Omit `until` to leave the stored return date untouched (the common case for
   *  an On/Off flip); pass null to clear it deliberately. */
  save: (next: { enabled: boolean; until?: string | null }) => void;
};

type Result = {
  nonce: string;
  enabled: boolean;
  until: string | null;
  slug: string | null;
  previewUrl: string | null;
  error: string | null;
};

function store(): chrome.storage.LocalStorageArea | undefined {
  return (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
}

export function useOutOfOffice(open: boolean): OooView {
  const [status, setStatus] = useState<OooStatus>("loading");
  const [enabled, setEnabled] = useState(false);
  const [until, setUntil] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The nonce of the request we are currently waiting for. Null = not waiting, so
  // an unmatched result is ignored rather than applied.
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const send = useCallback(
    (payload: Record<string, unknown>, nextStatus: OooStatus) => {
      const s = store();
      if (!s) {
        // Dev harness — no extension storage, so the round trip cannot happen.
        setStatus("unreachable");
        return;
      }
      const nonce = `${Date.now()}-${Math.random()}`;
      pending.current = nonce;
      setStatus(nextStatus);
      setError(null);
      clearTimer();
      timer.current = setTimeout(() => {
        // Nothing answered. Either no CRM tab is open, or the page is still
        // loading its listeners. Report it instead of leaving a spinner.
        if (pending.current === nonce) {
          pending.current = null;
          setStatus("unreachable");
        }
      }, TIMEOUT_MS);
      s.set({ [REQUEST_KEY]: { ...payload, nonce } });
    },
    [clearTimer],
  );

  const refresh = useCallback(() => send({ op: "read" }, "loading"), [send]);

  const save = useCallback(
    (next: { enabled: boolean; until?: string | null }) =>
      send(
        // "until" is forwarded ONLY when the caller supplied it; the CRM and the
        // route both treat a missing key as "leave the stored date alone".
        "until" in next
          ? { op: "write", enabled: next.enabled, until: next.until ?? null }
          : { op: "write", enabled: next.enabled },
        "saving",
      ),
    [send],
  );

  // Read on open — every open, not just the first.
  useEffect(() => {
    if (!open) {
      pending.current = null;
      clearTimer();
      return;
    }
    refresh();
    return clearTimer;
  }, [open, refresh, clearTimer]);

  // Apply results whose nonce matches the request in flight.
  useEffect(() => {
    if (!open) return;
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local" || !changes[RESULT_KEY]) return;
      const r = changes[RESULT_KEY].newValue as Result | undefined;
      if (!r || typeof r !== "object") return;
      if (!pending.current || r.nonce !== pending.current) return;
      pending.current = null;
      clearTimer();
      // The bridge already validated the shape; these are the values as STORED.
      setEnabled(r.enabled === true);
      setUntil(typeof r.until === "string" ? r.until : null);
      setPreviewUrl(typeof r.previewUrl === "string" ? r.previewUrl : null);
      setError(typeof r.error === "string" ? r.error : null);
      setStatus("ready");
    };
    const onc = (globalThis as unknown as { chrome?: any }).chrome?.storage?.onChanged;
    onc?.addListener?.(onChanged);
    return () => onc?.removeListener?.(onChanged);
  }, [open, clearTimer]);

  return { status, enabled, until, previewUrl, error, refresh, save };
}
