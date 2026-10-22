import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { LeadSummaryDTO, NextActionDTO, FavoriteDTO, RecommendationDTO, FollowUpOverrides, AutofillLocator } from "@bc/companion-shared";
import { sanitizeFollowUpOverrides } from "@bc/companion-shared";
import type { CurrentProperty } from "@/types";
import { formatPersonName, buildIntroSmsBody, buildFollowUpSmsBody, buildContactFollowUpSmsBody, isFollowUpAction, isContactFollowUpAction, formatWorkflowActionLabel, companionMayConfirm, DEFAULT_TIME_VALUE } from "@bc/companion-shared";
import { PanelApp } from "./PanelApp";
import { runAutofillForScheduler, reinjectAutofillIntoTab, detectTourSelectionInTab, type AutofillOutcome } from "./autofill/runAutofill";
import { useTourMode } from "./tour/useTourMode";
import type { AutofillPayload } from "@bc/companion-shared";
import { TourTimeField } from "./lead/TourTimeField";
import { DateField } from "./menu/DateField";
import { DISCONNECTED, type CompanionConnection } from "./connection";

/**
 * Production side-panel wrapper.
 *
 * Two independent signals feed the panel:
 *
 * 1) SW connection status — the eventual token-authenticated identity, derived
 *    EXCLUSIVELY from the background service worker (never a token over the wire).
 *    The SW auth client isn't built yet, so get-status doesn't resolve and this
 *    stays disconnected.
 *
 * 2) Active client (Phase 2, read-only) — the CRM is already authenticated in its
 *    own tab and pushes the selected client's read-only DTO through the content-
 *    script bridge into chrome.storage.local["lb-active-client"]. We read it on
 *    mount and subscribe to changes. While an active client is present, the panel
 *    is effectively "connected" to the live CRM and renders that client.
 *
 * Persistence: chrome.storage survives the side panel closing/reopening, so
 * reopening restores the last active client. The CRM never clears it, so closing
 * the CRM workspace leaves Companion showing the last client.
 */

type ActiveClientPayload = {
  lead: LeadSummaryDTO;
  nextActions?: NextActionDTO[];
  // THIS client's saved Favorite Properties — the only properties a tour can be
  // scheduled against (Schedule Tour requires one).
  favorites?: FavoriteDTO[];
  // THIS client's canonical Recommended Properties (lead_recommendations).
  recommendations?: RecommendationDTO[];
  agentName?: string | null;
  // The signed-in locator's contact identity for Schedule Tour autofill (fills the
  // message/comments field only — never the client contact fields). Null when
  // unresolved. Sent by the CRM's buildActiveClientPayload.
  locator?: AutofillLocator | null;
  // The locator's uploaded profile photo — shown (display-only) in the menu's
  // connection block next to the agent name; null → initials fallback.
  agentAvatarUrl?: string | null;
  // Workspace follow-up message TEXT overrides (content only) — the Companion
  // renders the same custom wording the CRM does. Absent → in-code defaults.
  followUpTemplates?: FollowUpOverrides;
  // Saved locator IANA timezone — Companion formats Due/Completed times in this
  // zone so it matches the CRM regardless of the device's zone.
  timeZone?: string | null;
  // Per-client Automated Texts: account authorization + this lead's enrollment.
  // Absent/unauthorized → the Companion offers no control (private rollout).
  automatedTexting?: { authorized: boolean; enrolled: boolean };
};

import {
  ACTIVE_CLIENT_KEY,
  CURRENT_PROPERTY_KEY,
  SENSITIVE_AREA_NAME,
  envelopeOwner,
  readSensitive,
  removeSensitive,
  unwrapEnvelope,
} from "@/utils/sensitiveStore";
// Separate from the active client on purpose: Current Property follows the webpage
// the locator is viewing (the external property site), NOT the selected CRM client.

function isActivePayload(v: unknown): v is ActiveClientPayload {
  const p = v as ActiveClientPayload | null | undefined;
  return !!p && !!p.lead && p.lead.id !== undefined && p.lead.id !== null;
}

// Map the active client (+ locator) to the Schedule Tour autofill payload. Client
// fields fill the prospect inputs; the locator goes ONLY to the message/comments
// field (composed inside the page filler). Move date + bedrooms come from the
// lead's search criteria. All best-effort — missing fields are simply skipped.
function buildAutofillPayload(active: ActiveClientPayload): AutofillPayload {
  const lead = active.lead;
  const sc = lead.searchCriteria ?? ({} as LeadSummaryDTO["searchCriteria"]);
  return {
    client: {
      firstName: lead.firstName ?? null,
      lastName: lead.lastName ?? null,
      email: lead.email ?? null,
      phone: lead.phone ?? null,
      moveDate: sc.moveDate ?? null,
      bedrooms: sc.beds ?? null,
    },
    locator: active.locator ?? null,
  };
}

function isCurrentProperty(v: unknown): v is CurrentProperty {
  const p = v as CurrentProperty | null | undefined;
  return !!p && typeof p.propertyId === "string" && typeof p.propertyName === "string" && p.propertyName.length > 0;
}

// A Current Property needs catalog enrichment when it has no Google Place ID and no
// rating yet — i.e. a external-site-detected property (a Map property already carries both).
// A name is required to resolve. Pure; module-scope so effects need no extra deps.
function needsExternalEnrich(cp: CurrentProperty | null): cp is CurrentProperty {
  return !!cp && !cp.placeId && cp.googleRating == null && !!(cp.propertyName ?? "").trim();
}

// Stable per-property cache key: the external site's own id when present, else name|address.
function externalEnrichKey(cp: CurrentProperty): string {
  return cp.propertyId
    ? `id:${cp.propertyId}`
    : `na:${(cp.propertyName ?? "").trim()}|${(cp.propertyAddress ?? "").trim()}`;
}

// Agent-level Companion preference keys (chrome.storage.local — same store as the
// Theme). Booleans; absent/false = OFF. NOT per-client.
const PREF_TEXT_TOP3_KEY = "lb-pref-text-top-3";
const PREF_VOICE_SCRIPT_KEY = "lb-pref-ai-voice-script";

/**
 * The task types a locator may pick for a NEW reminder.
 *
 * A short list rather than a free text box, so these rows stay recognisable at a glance and the
 * "what kind of thing is this" question has one answer. Checked against the workflow matchers: none
 * is a canonical action_key, none equals any stage's automatic label, so none can be mistaken for
 * workflow identity or suppress an automatic action. The specifics go in Notes.
 */
const TASK_TITLE_OPTIONS = ["Follow Up", "Confirm", "Call", "Text", "Email"] as const;
const DEFAULT_TASK_TITLE = "Follow Up";

/**
 * A stored UTC instant → the locator's LOCAL wall-clock date + time, in THEIR saved zone.
 *
 * The exact inverse of the localTourToUtc the CRM applies when saving, so an edit that changes
 * nothing round-trips to the same instant. Deliberately the locator's zone and never the browser's:
 * a locator travelling, or a Companion open on a second machine, must still see and set the time
 * the client was promised. Intl is used directly rather than importing the app's date helpers —
 * the Companion bundles only @bc/companion-shared, and moving that helper into the shared package
 * to reuse it here would touch the tour flow this change has no business in.
 */
function splitLocalDateTime(iso: string | null, timeZone: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || undefined,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const date = `${get("year")}-${get("month")}-${get("day")}`;
    const time = `${get("hour")}:${get("minute")}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date, time } : { date: "", time: "" };
  } catch {
    // An unrecognised zone must not break the sheet — it opens blank, which the save gate treats
    // as "nothing to submit" rather than as a silent change.
    return { date: "", time: "" };
  }
}

export function ProductionPanel() {
  const [connection, setConnection] = useState<CompanionConnection>(DISCONNECTED);
  const [active, setActive] = useState<ActiveClientPayload | null>(null);
  // The the external property site property currently being viewed (page context, not a
  // saved collection). Independent of `active` so switching clients never clears it.
  const [currentProperty, setCurrentProperty] = useState<CurrentProperty | null>(null);

  // ── the external site Current Property catalog enrichment (parity with Map properties) ─────
  // A the external site property arrives with name + address but no Google Place ID / rating. We
  // ask the open CRM tab to resolve its place_id (browser Google Places) and look
  // up property_catalog, then merge the catalog-only answer (rating / website /
  // image) into what we display. Cached per property so the same the external site property never
  // re-triggers a Places resolution (debounce); in-flight guard prevents duplicates.
  type ExternalEnrich = {
    placeId: string | null;
    googleRating: number | null;
    propertyImageUrl: string | null;
    propertyImageUrlBackup: string | null;
    websiteUrl: string | null;
    currentSpecial: string | null;
    sendCommission: string | null;
    escortCommission: string | null;
    bonusFlat: string | null;
    verifiedAt: string | null;
  };
  const enrichCacheRef = useRef<Map<string, ExternalEnrich>>(new Map());
  const enrichInflightRef = useRef<Set<string>>(new Set());
  const enrichPendingRef = useRef<Map<string, string>>(new Map()); // nonce → cache key
  const [enrichTick, setEnrichTick] = useState(0);

  // Pending contact confirmation ("Did you call …?" / "Did you text …?"). Null = hidden.
  // Immutable pending-contact context — captured when contact is INITIATED and
  // resolved against THIS captured identity, never the live active client (Bug 2).
  // Two phases of the SAME bottom sheet:
  //   "choose-method"  → "Would you like to call or text {name}?" (Contact Lead)
  //   "confirm-result" → "Did you call {name}?"                    (after launch)
  // Header Call/Text skip straight to "confirm-result" (method already known).
  const [pendingContact, setPendingContact] = useState<null | {
    leadId: string | number;
    name: string;
    phone: string | null | undefined; // captured so the launcher never reads live state
    method: "call" | "text" | null;
    phase: "choose-method" | "confirm-result";
    // Intro SMS body captured at initiation (New leads only) so the chooser's Text
    // launch prefills the message for the SAME lead the phone belongs to, never a
    // later active client. Undefined when not applicable (non-New / no lead).
    introBody?: string | undefined;
  }>(null);

  // Send List share sheet. Null = hidden. Clicking the real Send List action opens
  // this (it never bypasses the milestone — Send List only appears once build_list
  // was completed via "Yes, List Built" and a real send_list action exists). The
  // sheet reuse-or-mints the immutable snapshot for this send cycle and shows Preview
  // List + Copy Link, then the "Did you send…?" confirmation. Preparing or copying
  // NEVER marks the list sent — only "Yes, List Sent" does. Captures the lead identity
  // + request nonce at click time so a later active-client switch cannot mis-resolve.
  const [sendListShare, setSendListShare] = useState<null | {
    leadId: string | number;
    name: string;
    nonce: string;
    phase: "loading" | "ready" | "error";
    shareId: string | null;
    url: string | null;
    reused: boolean;
    copied: boolean;
  }>(null);

  // Build List tool chooser ("How do you want to build {name}'s list?"). Null =
  // hidden. Captures the lead identity at click time (same immutability rule as
  // the confirmations above) so the tool choice resolves against THIS lead. This
  // is only a routing layer in front of the existing Build List action: it opens
  // BEFORE any tool launches, and each choice runs the exact existing flow.
  const [buildListChoice, setBuildListChoice] = useState<null | {
    leadId: string | number;
    name: string;
  }>(null);

  // The active Companion tab, mirrored up from PanelApp so the "Was {name}'s list
  // sent?" bottom sheet only shows on the Client view — never overlaying the
  // Properties tab the agent was just sent to after choosing a build tool.
  const [companionView, setCompanionView] = useState<"client" | "properties">("client");

  // ── Agent-level Companion preferences (menu toggles) ─────────────────────────
  // Both are AGENT/browser-profile preferences (NOT per-client) persisted in
  // chrome.storage.local — the SAME mechanism the Theme selector uses — so they
  // survive client switches, panel close/reopen, and sessions. No schema/DB change.
  // PREFERENCE ONLY for now: neither toggle creates any automatic behavior. Text Top
  // 3 and the Voicemail Script (formerly "AI Voice Script") features/code are
  // preserved; their eventual workflows are a separate product decision.
  const [textTop3On, setTextTop3On] = useState(false);
  const [aiVoiceScriptOn, setAiVoiceScriptOn] = useState(false);
  useEffect(() => {
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (!store) return; // dev harness — prefs stay in-memory (default OFF)
    store.get([PREF_TEXT_TOP3_KEY, PREF_VOICE_SCRIPT_KEY], (res: Record<string, unknown>) => {
      setTextTop3On(res[PREF_TEXT_TOP3_KEY] === true);
      setAiVoiceScriptOn(res[PREF_VOICE_SCRIPT_KEY] === true);
    });
    function onChanged(changes: { [k: string]: chrome.storage.StorageChange }, area: string) {
      if (area !== "local") return;
      if (changes[PREF_TEXT_TOP3_KEY]) setTextTop3On(changes[PREF_TEXT_TOP3_KEY].newValue === true);
      if (changes[PREF_VOICE_SCRIPT_KEY]) setAiVoiceScriptOn(changes[PREF_VOICE_SCRIPT_KEY].newValue === true);
    }
    (globalThis as unknown as { chrome?: any }).chrome?.storage?.onChanged?.addListener(onChanged);
    return () => (globalThis as unknown as { chrome?: any }).chrome?.storage?.onChanged?.removeListener(onChanged);
  }, []);
  const onToggleTextTop3 = () => {
    setTextTop3On((v) => {
      const next = !v;
      (globalThis as unknown as { chrome?: any }).chrome?.storage?.local?.set({ [PREF_TEXT_TOP3_KEY]: next });
      return next;
    });
  };
  const onToggleAiVoiceScript = () => {
    setAiVoiceScriptOn((v) => {
      const next = !v;
      (globalThis as unknown as { chrome?: any }).chrome?.storage?.local?.set({ [PREF_VOICE_SCRIPT_KEY]: next });
      return next;
    });
  };

  // ── Deadline-aware snooze for the "Ready to send {name}'s list?" prompt ──────
  // "Not Yet" must not dismiss forever, and must not let the agent snooze past the
  // Build List deadline. State persists in chrome.storage.local (survives reloads +
  // client switches), keyed by `${leadId}:${buildListActionId}` so a rebuilt list
  // (new build_list row) starts a fresh cadence. Cadence: first Not Yet → ~2h,
  // second Not Yet → wait until ~1h before due, then stop (Agenda overdue takes
  // over). Each record: { notYetCount, snoozeUntil(epochMs), stopped }.
  const listBuiltSnoozeRef = useRef<Record<string, { notYetCount: number; snoozeUntil: number; stopped: boolean }>>({});
  const [, bumpSnoozeVersion] = useState(0); // re-render when a record loads/changes
  const [, bumpNowTick] = useState(0);        // re-render each minute so a snooze can expire

  // Follow-up confirmation ("Did you send the follow-up?"). Null = hidden.
  // Captures the lead id AND the exact follow-up action identity at SMS-launch
  // time so changing active clients can never complete the wrong client's action.
  const [followUpConfirm, setFollowUpConfirm] = useState<null | {
    leadId: string | number;
    actionId: string | number;
    title: string;
    name: string;
  }>(null);

  // Schedule Tour confirmation ("Did you schedule the tour for {name}?"). Null =
  // hidden. Captures the lead id + open setup_tour identity at click time so a
  // later active-client switch cannot complete the wrong client's action.
  const [scheduleTourConfirm, setScheduleTourConfirm] = useState<null | {
    leadId: string | number;
    actionId: string | number | null;
    name: string;
  }>(null);
  // The selected Favorite Property (lead_favorites.id) + tour's local wall-clock.
  // Captured in the sheet before confirming; a tour can ONLY be scheduled for an
  // existing Favorite, so property is required alongside date/time.
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [tourDate, setTourDate] = useState<string>(""); // "YYYY-MM-DD"
  const [tourTime, setTourTime] = useState<string>(""); // "HH:mm"

  // "+ Add Task" — a custom manual task for the active client. Captures the lead
  // identity at open so it always saves to THIS client; the client-switch guard
  // closes it + clears the draft if the active client changes (like Schedule Tour).
  const [addTaskConfirm, setAddTaskConfirm] = useState<null | { leadId: string | number; name: string }>(null);
  const [taskTitle, setTaskTitle] = useState<string>("");
  const [taskDate, setTaskDate] = useState<string>(""); // "YYYY-MM-DD"
  const [taskTime, setTaskTime] = useState<string>(""); // "HH:mm"
  const [taskNotes, setTaskNotes] = useState<string>("");
  // EDIT MODE. Null = the sheet is adding; set = it is editing that existing row. `actionKey` is
  // the workflow identity: non-null means the title is the workflow's, not the locator's, so the
  // field is read-only here AND the server refuses a rename regardless of what this sends.
  const [taskEdit, setTaskEdit] = useState<null | { taskId: string | number; actionKey: string | null }>(null);

  // ── SW connection status (token auth — not yet built) ─────────────────────
  useEffect(() => {
    const rt = (globalThis as unknown as { chrome?: any }).chrome?.runtime;
    if (!rt?.sendMessage) return;

    try {
      rt.sendMessage({ type: "companion:get-status" }, (resp: { connection?: CompanionConnection } | undefined) => {
        if (rt.lastError) return; // SW not ready / no handler yet → stay disconnected
        if (resp?.connection) setConnection(resp.connection);
      });
    } catch {
      /* messaging unavailable — remain disconnected */
    }

    const onMsg = (msg: { type?: string; connection?: CompanionConnection }) => {
      if (msg?.type === "companion:status" && msg.connection) setConnection(msg.connection);
    };
    rt.onMessage?.addListener(onMsg);
    return () => rt.onMessage?.removeListener(onMsg);
  }, []);

  // ── Replay handshake: request a fresh state republish on mount ───────────────
  // This panel renders only behind ConsentGate, so on mount consent is already
  // granted and any replayed write will pass the bridge's consent gate. We ask the
  // background to route a REQUEST_CURRENT_STATE to the active CRM tab; DashboardClient
  // re-publishes active-client + Current Property through the EXISTING bridge, which
  // updates chrome.storage and — via the onChanged listener below — this panel. This
  // fixes "Locator Beast opened first, Companion opened later" without a page refresh.
  // Storage hydration (below) still covers the case where a valid record already
  // exists; the request is an additive nudge, never a substitute.
  useEffect(() => {
    const rt = (globalThis as unknown as { chrome?: any }).chrome?.runtime;
    if (!rt?.sendMessage) return;
    try {
      rt.sendMessage({ type: "REQUEST_CURRENT_STATE" }, () => {
        void rt.lastError; // no receiver (no CRM tab yet) is fine — page-load publish covers it
      });
    } catch {
      /* messaging unavailable — hydration from storage still applies */
    }
  }, []);

  // ── Active client from the CRM bridge (Phase 2, read-only) ────────────────
  useEffect(() => {
    // Sensitive records now live in chrome.storage.SESSION behind an owner +
    // expiry envelope (see utils/sensitiveStore). Reads pass through
    // readSensitive/unwrapEnvelope so a record belonging to a different account,
    // or one past its TTL, is neither rendered nor left in storage.
    //
    // The panel adopts whichever owner the CRM most recently established rather
    // than tracking identity itself: passing null adopts, and every subsequent
    // read is pinned to that owner. An account switch writes a new owner, the
    // pinned comparison fails, and the stale record is erased on read.
    let owner: string | null = null;

    void (async () => {
      const p = await readSensitive<unknown>(ACTIVE_CLIENT_KEY, null);
      setActive(isActivePayload(p) ? p : null);
      const cp = await readSensitive<unknown>(CURRENT_PROPERTY_KEY, null);
      setCurrentProperty(isCurrentProperty(cp) ? cp : null);
    })();

    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== SENSITIVE_AREA_NAME) return;
      if (changes[ACTIVE_CLIENT_KEY]) {
        const raw = changes[ACTIVE_CLIENT_KEY].newValue;
        // Adopt the owner from the newest CRM write, then pin to it.
        const incoming = envelopeOwner(raw);
        if (incoming) owner = incoming;
        const next = unwrapEnvelope<unknown>(raw, owner);
        setActive(isActivePayload(next) ? next : null);
      }
      // Current Property updates independently of the active client (page context).
      if (changes[CURRENT_PROPERTY_KEY]) {
        const nextCp = unwrapEnvelope<unknown>(changes[CURRENT_PROPERTY_KEY].newValue, owner);
        setCurrentProperty(isCurrentProperty(nextCp) ? nextCp : null);
      }
    };
    const sc = (globalThis as unknown as { chrome?: any }).chrome?.storage?.onChanged;
    sc?.addListener(onChanged);
    return () => sc?.removeListener(onChanged);
  }, []);

  // Receive the external site enrichment results (the enrichment bridge writes them to LOCAL
  // storage, separate from the sensitive session store above). Match the nonce we
  // sent, cache by property key, and re-render.
  useEffect(() => {
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage;
    if (!store?.onChanged) return;
    const onLocal = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== "local" || !changes["lb-enrich-result"]) return;
      const res = changes["lb-enrich-result"].newValue as any;
      if (!res || typeof res !== "object" || typeof res.nonce !== "string") return;
      const key = enrichPendingRef.current.get(res.nonce);
      if (!key) return; // stale or not ours
      enrichPendingRef.current.delete(res.nonce);
      enrichInflightRef.current.delete(key);
      const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
      enrichCacheRef.current.set(key, {
        placeId: typeof res.placeId === "string" ? res.placeId : null,
        googleRating: typeof res.googleRating === "number" ? res.googleRating : null,
        propertyImageUrl: str(res.propertyImageUrl),
        propertyImageUrlBackup: str(res.propertyImageUrlBackup),
        websiteUrl: str(res.websiteUrl),
        currentSpecial: str(res.currentSpecial),
        sendCommission: str(res.sendCommission),
        escortCommission: str(res.escortCommission),
        bonusFlat: str(res.bonusFlat),
        verifiedAt: str(res.verifiedAt),
      });
      setEnrichTick((t) => t + 1);
    };
    store.onChanged.addListener(onLocal);
    return () => store.onChanged.removeListener(onLocal);
  }, []);

  // Receive Send List share-link results (the share-link bridge writes them to LOCAL
  // storage). Match the nonce we sent so a stale/other result can't fill this sheet;
  // move the sheet to "ready" with the stable URL, or "error" on failure.
  useEffect(() => {
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage;
    if (!store?.onChanged) return;
    const onLocal = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== "local" || !changes["lb-share-result"]) return;
      const res = changes["lb-share-result"].newValue as any;
      if (!res || typeof res !== "object" || typeof res.nonce !== "string") return;
      setSendListShare((prev) => {
        if (!prev || prev.nonce !== res.nonce) return prev; // stale or not ours
        if (res.error || typeof res.url !== "string") {
          return { ...prev, phase: "error" };
        }
        return {
          ...prev,
          phase: "ready",
          shareId: typeof res.shareId === "string" ? res.shareId : null,
          url: res.url,
          reused: res.reused === true,
        };
      });
    };
    store.onChanged.addListener(onLocal);
    return () => store.onChanged.removeListener(onLocal);
  }, []);

  // Request enrichment for a the external site Current Property — ONCE per property (cache +
  // in-flight guard debounce a repeatedly-detected property so Places isn't spammed).
  useEffect(() => {
    if (!needsExternalEnrich(currentProperty)) return;
    const key = externalEnrichKey(currentProperty);
    if (enrichCacheRef.current.has(key) || enrichInflightRef.current.has(key)) return;
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (!store?.set) return;
    const nonce = `${Date.now()}-${Math.random()}`;
    enrichInflightRef.current.add(key);
    enrichPendingRef.current.set(nonce, key);
    store.set({
      "lb-enrich-request": {
        nonce,
        name: (currentProperty.propertyName ?? "").trim(),
        address: currentProperty.propertyAddress ?? null,
        externalPropertyId: currentProperty.propertyId ?? null,
      },
    });
  }, [currentProperty]);

  // The Current Property AS DISPLAYED: a the external site property merged with its cached catalog
  // enrichment (rating / website / catalog image). Map or already-enriched
  // properties pass through unchanged. Catalog image wins, else the the external site og:image,
  // else the building icon (PropertyThumb). The the external site intelligence rows are untouched.
  const displayCurrentProperty = useMemo<CurrentProperty | null>(() => {
    if (!currentProperty) return null;
    if (!needsExternalEnrich(currentProperty)) return currentProperty;
    const e = enrichCacheRef.current.get(externalEnrichKey(currentProperty));
    if (!e) return currentProperty;
    return {
      ...currentProperty,
      placeId: e.placeId ?? currentProperty.placeId ?? null,
      googleRating: e.googleRating ?? currentProperty.googleRating ?? null,
      websiteUrl: e.websiteUrl ?? currentProperty.websiteUrl ?? null,
      propertyImageUrl: e.propertyImageUrl ?? currentProperty.propertyImageUrl ?? null,
      // Canonical card fields (Step 6) — backup photo, verified special, and locator
      // commission from property_catalog. Locator surface only; never client-facing.
      propertyImageUrlBackup: e.propertyImageUrlBackup ?? currentProperty.propertyImageUrlBackup ?? null,
      propertyCurrentSpecial: e.currentSpecial ?? currentProperty.propertyCurrentSpecial ?? null,
      sendCommission: e.sendCommission ?? currentProperty.sendCommission ?? null,
      escortCommission: e.escortCommission ?? currentProperty.escortCommission ?? null,
      bonusFlat: e.bonusFlat ?? currentProperty.bonusFlat ?? null,
      catalogVerifiedAt: e.verifiedAt ?? currentProperty.catalogVerifiedAt ?? null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- enrichTick forces recompute after an async result fills the ref cache
  }, [currentProperty, enrichTick]);

  // ── Client-context guard for Schedule Tour ────────────────────────────────
  // The contact / send-list / follow-up sheets intentionally CAPTURE their lead
  // identity and resolve against it even after a switch. Schedule Tour is
  // different: it carries a multi-field DRAFT (Favorite + date + time) bound to
  // ONE client's Favorites, so if the active client changes while it's open we
  // must CLOSE it and discard the draft — never float Client A's half-filled
  // sheet over Client B's data. No other Companion sheet does close-on-change, so
  // this guard is Schedule-Tour-specific (audited: nothing canonical to share).
  const activeLeadId = active?.lead?.id ?? null;
  useEffect(() => {
    if (scheduleTourConfirm && String(activeLeadId) !== String(scheduleTourConfirm.leadId)) {
      setScheduleTourConfirm(null);
      setSelectedPropertyId("");
      setTourDate("");
      setTourTime("");
    }
  }, [activeLeadId, scheduleTourConfirm]);

  // Same protection for Add Task — its draft (title + date + time) is bound to ONE
  // client, so a client switch closes it and discards the draft rather than risk
  // saving the task to the wrong client.
  useEffect(() => {
    if (addTaskConfirm && String(activeLeadId) !== String(addTaskConfirm.leadId)) {
      setAddTaskConfirm(null);
      setTaskEdit(null);
      setTaskNotes("");
      setTaskTitle("");
      setTaskDate("");
      setTaskTime("");
    }
  }, [activeLeadId, addTaskConfirm]);

  // Load persisted snooze records once, and re-render every minute so a snooze can
  // expire and the prompt reappear on its own.
  useEffect(() => {
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    store?.get?.("lb-listbuilt-snooze", (res: any) => {
      const v = res?.["lb-listbuilt-snooze"];
      if (v && typeof v === "object") listBuiltSnoozeRef.current = v;
      bumpSnoozeVersion((n) => n + 1);
    });
    const id = setInterval(() => bumpNowTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // The open Build List Next Action for the active lead (the milestone this prompt
  // completes), plus its deadline and a per-build snooze key.
  const buildListAction =
    (active?.nextActions ?? []).find(
      (a) => !a.completed && (a.title ?? "").trim().toLowerCase() === "build list",
    ) ?? null;
  const buildListDueMs = buildListAction?.dueAt ? new Date(buildListAction.dueAt).getTime() : null;
  const buildListSnoozeKey =
    active?.lead?.id != null && buildListAction?.id != null
      ? `${active.lead.id}:${buildListAction.id}`
      : null;
  const buildListSnooze = buildListSnoozeKey
    ? listBuiltSnoozeRef.current[buildListSnoozeKey] ?? { notYetCount: 0, snoozeUntil: 0, stopped: false }
    : null;

  // "Ready to send {name}'s list?" shows only when: the client is mid-build
  // (Searching with an open build_list), they have AT LEAST ONE Recommendation
  // (the canonical list to send), the agent is on the Client tab, the Build List
  // deadline hasn't passed, and it isn't currently snoozed/stopped. Never auto-
  // completes — the agent must confirm.
  const nowMs = Date.now();
  const showReadyToSend =
    !!active?.lead &&
    !!buildListAction &&
    String((active.lead as { stage?: unknown }).stage) === "searching" &&
    (active?.recommendations?.length ?? 0) >= 1 &&
    companionView === "client" &&
    buildListDueMs != null &&
    nowMs < buildListDueMs &&
    buildListSnooze != null &&
    !buildListSnooze.stopped &&
    nowMs >= (buildListSnooze.snoozeUntil ?? 0);

  const rt = () => (globalThis as unknown as { chrome?: any }).chrome?.runtime;
  const onConnect = () => rt()?.sendMessage?.({ type: "companion:start-connect" });

  // Edit Client (menu → CRM). Posts the "edit-client" verb for the ACTIVE lead
  // (panel → chrome.storage → content script → CRM), which opens the CRM's Add
  // Lead modal in edit mode pre-populated with this client. Companion stays
  // read-only — the CRM performs the update. No-op when no client is active.
  const onEditClient = () => {
    const lead = active?.lead;
    if (!lead) return;
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: lead.id,
          verb: "edit-client",
        },
      });
    }
  };

  // Edit Follow-up Templates (menu → CRM). LAUNCHER only: posts the workspace-level
  // "edit-templates" verb (no lead) so the CRM opens its template editor. Companion
  // stays read-only; all editing/saving happens in the CRM.
  const onEditTemplates = () => {
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          verb: "edit-templates",
        },
      });
    }
  };

  // Automated Texts On/Off for the ACTIVE client (Client tab). LAUNCHER only:
  // posts the lead-scoped "automated-texting" verb so the CRM performs the
  // authoritative enrollment flip (service-role write, dual gate). Companion never
  // writes; it optimistically reflects the new state and re-syncs on the next push.
  const onToggleAutomatedTexts = (enabled: boolean) => {
    const leadId = active?.lead?.id ?? null;
    if (leadId == null) return;
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          verb: "automated-texting",
          leadId,
          enabled,
        },
      });
    }
  };

  // An active client means the live CRM is connected and pushing read-only data.
  // Prefer that over the (not-yet-built) SW connection so the client renders.
  const effectiveConnection: CompanionConnection = active
    ? { status: "connected", name: active.agentName ?? "Locator Beast", workspace: "Locator Beast CRM", avatarUrl: active.agentAvatarUrl ?? null }
    : connection;

  // ── Phase 3 (Slice A): Contact ────────────────────────────────────────────
  // A click LAUNCHES the call/text — it does NOT record contact. Recording is
  // gated behind an explicit confirmation, because opening tel:/sms: never
  // proves a conversation happened.
  //
  // Launch order matters: fire the external protocol SYNCHRONOUSLY from this
  // user gesture, before any await/storage, or Chrome may suppress the handoff.
  // The ONE shared communication launcher — used by the header buttons AND the
  // Contact Lead method chooser, so there is a single Call/Text implementation.
  const launchCommunication = (
    method: "call" | "text",
    phone: string | null | undefined,
    body?: string | null,
  ) => {
    const url = dialUrl(method, phone, body); // raw phone → normalized E.164 (+ optional SMS body)
    if (url) launchExternalUrl(url);
  };

  // The ONE canonical New-lead intro SMS, prefilled when texting a still-New lead.
  // Built from the lead's existing dynamic fields + the locator's first name.
  // Returns undefined for non-New leads (or when there's no lead) so the text
  // opens blank there, exactly as before. Prefilling is NOT contact — the Text →
  // Yes, Sent workflow is unchanged.
  // Workspace follow-up TEXT overrides, sanitized on receipt (the payload comes
  // over the same-origin bridge, but re-validate anyway). Absent → in-code
  // defaults, so every message is byte-identical to before.
  const followUpOverrides: FollowUpOverrides = sanitizeFollowUpOverrides(active?.followUpTemplates).overrides;

  const introSmsBodyFor = (lead: LeadSummaryDTO | null | undefined): string | undefined => {
    if (!lead || String(lead.stage) !== "new") return undefined;
    const locatorFirstName = (active?.agentName ?? "").trim().split(/\s+/)[0] ?? "";
    return buildIntroSmsBody({
      firstName: formatPersonName(lead.firstName) || "",
      locatorFirstName,
      propertyType: lead.searchCriteria?.propertyType,
      beds: lead.searchCriteria?.beds,
      baths: lead.searchCriteria?.baths,
      moveDate: lead.searchCriteria?.moveDate,
    }, followUpOverrides);
  };

  // Header Call Client / Text Client: method is already known, so skip the
  // chooser and go straight to launch + the "Did you call …?" result.
  // Captures the lead identity NOW (immutable — survives a later active switch).
  const onContact = (method: "call" | "text") => {
    const lead = active?.lead;
    if (!lead || lead.id === undefined || lead.id === null) return;
    launchCommunication(method, lead.phone, method === "text" ? introSmsBodyFor(lead) : undefined);
    setPendingContact({
      leadId: lead.id,
      name: formatPersonName(lead.firstName) || "this client",
      phone: lead.phone,
      method,
      phase: "confirm-result",
    });
  };

  // Contact Lead Next Action: entry into the SAME flow, but the method is unknown
  // — open the chooser first. No launch yet, no stage change. Identity captured
  // now so the whole interaction stays bound to this client.
  const onContactLead = () => {
    const lead = active?.lead;
    if (!lead || lead.id === undefined || lead.id === null) return;
    setPendingContact({
      leadId: lead.id,
      name: formatPersonName(lead.firstName) || "this client",
      phone: lead.phone,
      method: null,
      phase: "choose-method",
      introBody: introSmsBodyFor(lead), // captured now, for a later Text choice
    });
  };

  // Chooser → Call or Text: launch using the CAPTURED phone (never live state),
  // then transition the SAME sheet to the result confirmation.
  const chooseMethod = (method: "call" | "text") => {
    const pc = pendingContact;
    if (!pc) return;
    launchCommunication(method, pc.phone, method === "text" ? pc.introBody : undefined);
    setPendingContact({ ...pc, method, phase: "confirm-result" });
  };

  const dismissContact = () => setPendingContact(null);

  // "Yes, Contacted" records a reached first contact (canonical cascade — advances
  // New → Contacted, creates Build List). "No Answer" is a completed call attempt:
  // it too advances New → Contacted (Contacted = "≥1 attempt") but its successor is
  // Contact FU1, not Build List. Both outcomes route through the authenticated CRM
  // bridge (the panel has no session of its own); the CRM appliers own the workflow.
  const resolveContact = (outcome: "yes" | "no-answer") => {
    const pc = pendingContact; // captured context — NOT the live active client
    setPendingContact(null);
    if (!pc || !pc.method) return;
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: pc.leadId,
          verb: outcome === "yes" ? "contact" : "contact-attempt",
          method: pc.method,
        },
      });
    }
  };

  // Text path — "Did you text …?" → "Yes, Sent". Posts the canonical
  // "text-sent" verb to the CRM (panel → chrome.storage → content script → CRM),
  // which runs the pending-outreach cascade: a text_sent timeline event + Contact
  // FU1 (Status "Waiting for Reply") and advances New → Contacted (a sent text is a
  // completed attempt). It is NOT a reached contact — the CRM never runs
  // recordFirstContact, so there is NO Build List and NO first_text_sent_at stamp.
  const resolveTextSent = () => {
    const pc = pendingContact; // captured context — NOT the live active client
    setPendingContact(null);
    if (!pc) return;
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: pc.leadId,
          verb: "text-sent",
          method: "text",
        },
      });
    }
  };

  // Build List (the "Build List" click) now opens a small chooser FIRST — "How do
  // you want to build {name}'s list?" — with two options: the external property site and
  // Locator Beast. This is only a routing layer in front of the existing Build
  // List action; nothing launches until the agent picks a tool. Captures the lead
  // identity now so the choice resolves against THIS lead.
  const onBuildList = () => {
    const lead = active?.lead;
    if (!lead || lead.id === undefined || lead.id === null) return;
    setBuildListChoice({ leadId: lead.id, name: formatPersonName(lead.firstName) || "this client" });
  };

  // Move this Companion to its Properties tab — the agent is now building the
  // client's list and working with properties. Reuses the EXACT proven
  // Properties-switch signal the CRM Board→Map bridge uses (the monotonic
  // "lb-map-entered" counter in chrome.storage.local, consumed once per new value
  // by PanelApp's useMainViewTab → "properties"). Bumping it here from the panel
  // is the same effect the content-script bridge produces, so both Build List
  // choices land on Properties consistently. The Locator Beast choice ALSO drives
  // this via the CRM workspace-mode broadcast; a possible extra bump is harmless
  // (both resolve to Properties).
  const switchCompanionToProperties = () => {
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (!store?.get) return;
    const KEY = "lb-map-entered";
    store.get(KEY, (res: any) => {
      const prev = typeof res?.[KEY] === "number" ? res[KEY] : 0;
      store.set({ [KEY]: prev + 1 });
    });
  };

  // the external property site choice — the EXACT existing Build List behavior,
  // unchanged. (1) open/focus the external site, and (2) advance the workflow Contacted →
  // Searching on the authenticated CRM (start-build-list; build_list stays the
  // open Next Action). Prefer an existing the external site tab (host access via the manifest
  // content-script match lets tabs.query filter by URL — no new permission);
  // otherwise open a new one. Like the Locator Beast choice, this also moves the
  // Companion to Properties, since the agent is now building the client's list.
  const chooseSad = () => {
    setBuildListChoice(null);
    // The agent is now building the list → show Properties (consistent with the
    // Locator Beast choice). the external site/matching/stage logic below is untouched.
    switchCompanionToProperties();
    // (2) Advance Contacted → Searching (build_list stays open, no Send List yet).
    const startLead = active?.lead;
    const startStore = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (startStore && startLead && startLead.id !== undefined && startLead.id !== null) {
      startStore.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: startLead.id,
          verb: "start-build-list",
        },
      });
    }

    // (1) Open/focus the external site.
    const EXTERNAL_PROPERTY_SITE_URL = "https://app.smartapartmentdata.com/";
    const tabs = (globalThis as unknown as { chrome?: any }).chrome?.tabs;
    const windows = (globalThis as unknown as { chrome?: any }).chrome?.windows;
    if (!tabs?.query) {
      window.open(EXTERNAL_PROPERTY_SITE_URL, "_blank");
      return;
    }
    tabs.query(
      { url: ["*://app.smartapartmentdata.com/*", "*://*.smartapartmentdata.com/*"] },
      (matches: any[]) => {
        const existing = matches && matches[0];
        if (existing?.id != null) {
          tabs.update(existing.id, { active: true });
          if (existing.windowId != null && windows?.update) windows.update(existing.windowId, { focused: true });
        } else {
          tabs.create({ url: EXTERNAL_PROPERTY_SITE_URL });
        }
      }
    );
  };

  // Locator Beast choice — build the list with the CRM's own property workflow
  // (property-name search / Map / Unleash Beast / recommendations). ONE verb does
  // it all on the authenticated CRM: "open-locator-beast" runs the SAME Contacted
  // → Searching advance as the the external site path AND switches the CRM into the Map
  // workspace, which (via the existing workspace-mode bridge) moves this Companion
  // to Properties. We also bring the CRM tab forward so the agent lands on the
  // Map. No the external site/matching/map/Unleash Beast/recommendation logic is touched.
  const chooseLocatorBeast = () => {
    setBuildListChoice(null);
    const lead = active?.lead;
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store && lead && lead.id !== undefined && lead.id !== null) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: lead.id,
          verb: "open-locator-beast",
        },
      });
    }
    // Bring the Locator Beast CRM tab forward so the agent sees the Map/property
    // workflow (mirrors how the the external site choice focuses its tab). The Companion's own
    // switch to Properties is handled by the CRM's workspace-mode broadcast.
    focusExistingCrmTab();
  };

  // Persist the snooze map (after a Not Yet / a confirm) and re-render.
  const persistListBuiltSnooze = () => {
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    store?.set?.({ "lb-listbuilt-snooze": listBuiltSnoozeRef.current });
    bumpSnoozeVersion((n) => n + 1);
  };

  // "Yes, List Built" (the "Ready to send {name}'s list?" bottom sheet) → the
  // ORIGINAL Build List completion runs on the authenticated CRM: completes the
  // REAL build_list row (real timestamp → Last Action "List Built"), creates ONE
  // real send_list Next Action, and STAYS in Searching. This is the first of two
  // real milestones — sending happens separately at the Send List step.
  const confirmListBuilt = () => {
    const lead = active?.lead;
    if (!lead || lead.id === undefined || lead.id === null) return;
    // Stop this build's prompt from re-showing; the stage/next-action re-broadcast
    // (build_list completed → send_list open) also drops it by construction.
    if (buildListSnoozeKey) {
      listBuiltSnoozeRef.current[buildListSnoozeKey] = { notYetCount: 99, snoozeUntil: 0, stopped: true };
      persistListBuiltSnooze();
    }
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: lead.id,
          verb: "complete-build-list",
        },
      });
    }
  };

  // "Not Yet" — snooze the prompt without dismissing it forever, and never past the
  // Build List deadline. Cadence: 1st → ~2h (capped at ~1h before due); 2nd → wait
  // until ~1h before due (deadline reminder), no more 2h prompts; within the last
  // hour, or a 3rd Not Yet → stop (the Agenda/Next Action overdue behavior is then
  // authoritative). No stage/Last Action/Next Action change.
  const notYetListBuilt = () => {
    if (!buildListSnoozeKey || buildListDueMs == null) return;
    const now = Date.now();
    const deadlineWindow = buildListDueMs - 60 * 60 * 1000; // ~1h before due
    const rec = listBuiltSnoozeRef.current[buildListSnoozeKey] ?? { notYetCount: 0, snoozeUntil: 0, stopped: false };
    if (now >= deadlineWindow) {
      rec.stopped = true;
    } else if (rec.notYetCount === 0) {
      rec.notYetCount = 1;
      rec.snoozeUntil = Math.min(now + 2 * 60 * 60 * 1000, deadlineWindow);
    } else if (rec.notYetCount === 1) {
      rec.notYetCount = 2;
      rec.snoozeUntil = deadlineWindow;
    } else {
      rec.stopped = true;
    }
    listBuiltSnoozeRef.current[buildListSnoozeKey] = rec;
    persistListBuiltSnooze();
  };

  // Send List → open the share sheet and request the snapshot's stable link. This
  // ONLY proceeds when a real open send_list action exists (build_list already
  // completed through "Yes, List Built"): the milestone is never bypassed here. It
  // opens NO SMS/site and does NOT mark the list sent — it asks the CRM to reuse-or-
  // mint the immutable snapshot and return the /r/<token> URL for Preview / Copy Link.
  const onSendList = () => {
    const lead = active?.lead;
    if (!lead || lead.id === undefined || lead.id === null) return;
    const openSend = (active?.nextActions ?? []).find(
      (a) =>
        !a.completed &&
        ((a as { action_key?: string }).action_key === "send_list" ||
          (a.title ?? "").trim().toLowerCase() === "send list"),
    );
    if (!openSend) return; // no real Send List milestone → do nothing
    const nonce = `${Date.now()}-${Math.random()}`;
    setSendListShare({
      leadId: lead.id,
      name: formatPersonName(lead.firstName) || "this client",
      nonce,
      phase: "loading",
      shareId: null,
      url: null,
      reused: false,
      copied: false,
    });
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    store?.set?.({ "lb-share-request": { nonce, leadId: lead.id } });
  };

  // Retry a failed prepare with a FRESH nonce (same captured lead).
  const retrySendListShare = () => {
    setSendListShare((prev) => {
      if (!prev) return prev;
      const nonce = `${Date.now()}-${Math.random()}`;
      const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
      store?.set?.({ "lb-share-request": { nonce, leadId: prev.leadId } });
      return { ...prev, nonce, phase: "loading" };
    });
  };

  // Preview List → open the REAL public client page for this snapshot in a new tab.
  const previewSendListShare = () => {
    const url = sendListShare?.url;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  // Copy Link → copy the EXACT stable URL (from the encrypted-token retrieval path).
  const copySendListShare = () => {
    const url = sendListShare?.url;
    if (!url) return;
    const done = () => setSendListShare((prev) => (prev ? { ...prev, copied: true } : prev));
    try {
      navigator.clipboard?.writeText(url).then(done).catch(done);
    } catch {
      done();
    }
  };

  // "Yes, List Sent" → the canonical Searching → List Sent transition runs on the
  // authenticated CRM (completes send_list, resets follow-ups, creates the single
  // FU1) AND stamps the snapshot's sent_at (via the shareId passed here). "Not Yet"
  // just closes the sheet — the send_list stays open and the snapshot stays available
  // for another Preview / Copy Link (handled inline). Uses the captured identity.
  const confirmSendList = () => {
    const c = sendListShare;
    setSendListShare(null);
    if (!c) return;
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: c.leadId,
          verb: "complete-send-list",
          shareId: c.shareId,
        },
      });
    }
  };

  // Follow-Up → launch the client's SMS with the matching template, then open the
  // confirmation sheet. Launching SMS does NOT complete the follow-up. Captures the
  // lead id + exact open follow-up identity NOW so a later active-client switch
  // cannot complete the wrong client's action.
  const onSendFollowUp = () => {
    const lead = active?.lead;
    if (!lead || lead.id === undefined || lead.id === null) return;
    // Match either sequence: the post-List-Sent FU1–Final ladder OR the pre-list
    // Contact FU1–FU3 chase. Each uses the SAME send/confirm UX; only the template
    // BUILDER differs, chosen by which sequence the open action belongs to.
    const open = (active?.nextActions ?? []).find(
      (a) => !a.completed && (isFollowUpAction(a.title) || isContactFollowUpAction(a.title)),
    );
    if (!open) return;
    const name = formatPersonName(lead.firstName) || "this client";
    // Pre-list Contact FU → the dedicated builder (explicit content-key mapping,
    // never falls through to the post-list Final template). Only Contact FU1
    // personalizes with {first_name}; FU2/FU3 are static.
    const body = isContactFollowUpAction(open.title)
      ? buildContactFollowUpSmsBody(open.title, name, followUpOverrides)
      : buildFollowUpSmsBody(open.title, name, followUpOverrides, {
          agentFirstName: (active?.agentName ?? "").trim().split(/\s+/)[0] ?? "",
          beds: lead.searchCriteria?.beds,
          baths: lead.searchCriteria?.baths,
          propertyType: lead.searchCriteria?.propertyType,
          moveDate: lead.searchCriteria?.moveDate,
        });
    launchCommunication("text", lead.phone, body);
    setFollowUpConfirm({ leadId: lead.id, actionId: open.id, title: open.title, name });
  };

  // "Yes, Sent" → complete the EXACT captured follow-up on the authenticated CRM
  // (completes the row, creates the one move-date-cadenced successor, records the
  // Waiting-for-Reply signal). Cancel just closes the sheet (handled inline).
  const confirmFollowUp = () => {
    const c = followUpConfirm;
    setFollowUpConfirm(null);
    if (!c) return;
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: c.leadId,
          verb: "complete-follow-up",
          actionId: c.actionId,
          title: c.title,
        },
      });
    }
  };

  // Schedule Tour → open the confirmation sheet directly. MVP: there is no tour-
  // scheduling workspace yet, so this is a temporary handoff — it opens NOTHING
  // external and changes nothing until "Yes, Scheduled". (Later, the same action
  // opens the real scheduler first, then reuses this confirmation/completion.)
  // Captures the lead id + exact open setup_tour identity NOW.
  // Make the ENTIRE native date/time field open its OS picker on click — not just
  // the tiny calendar/clock icon (that's why the fields felt "not interactive").
  // showPicker() is the standard control the browser's native inputs already use;
  // guarded because it throws outside a user gesture / where unsupported.
  const openNativePicker = (e: { currentTarget: HTMLInputElement }) => {
    try {
      (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      /* no user gesture / unsupported — the field still works as a normal input */
    }
  };

  const onScheduleTour = () => {
    const lead = active?.lead;
    if (!lead || lead.id === undefined || lead.id === null) return;
    const open = (active?.nextActions ?? []).find(
      (a) => !a.completed && (a.title ?? "").trim().toLowerCase() === "setup tour"
    );
    const name = formatPersonName(lead.firstName) || "this client";
    // Property + Date open blank; Tour Time defaults to 9:00 AM (agent can change
    // it). So the sheet's enable-gate becomes Property + Date (time is pre-filled).
    setSelectedPropertyId("");
    setTourDate("");
    setTourTime(DEFAULT_TIME_VALUE);
    setScheduleTourConfirm({ leadId: lead.id, actionId: open?.id ?? null, name });
  };

  // "Yes, Scheduled" → the canonical Schedule Tour completion runs on the
  // authenticated CRM (inserts the lead_tours appointment, completes the
  // setup_tour row, keeps the lead in Ready to Tour, creates ONE Tour Follow-Up
  // due = tour + 2h). Sends the captured local date/time. Cancel just closes the
  // sheet. Guarded: both date and time must be set before this can fire.
  const confirmScheduleTour = () => {
    const c = scheduleTourConfirm;
    if (!c || !selectedPropertyId || !tourDate || !tourTime) return;
    setScheduleTourConfirm(null);
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: c.leadId,
          verb: "complete-setup-tour",
          actionId: c.actionId ?? undefined,
          propertyId: selectedPropertyId,
          tourDate,
          tourTime,
        },
      });
    }
    setSelectedPropertyId("");
    setTourDate("");
    setTourTime("");
  };

  // ── Tour Mode ─────────────────────────────────────────────────────────────
  // Entered from a Workspace Favorite's Schedule Tour (via the tour-mode bridge).
  // Confirm reuses the SAME canonical complete-setup-tour verb the sheet above
  // writes — with the Tour Mode favorite as the tour's property — so there is no
  // parallel tour system. Exiting always returns to the normal (Client) panel.
  const { tour: tourMode, exit: exitTourMode } = useTourMode(active?.lead?.id ?? null);
  const confirmTourMode = (args: { tourDate: string; tourTime: string }) => {
    const lead = active?.lead;
    if (lead && lead.id != null && tourMode && args.tourDate && args.tourTime) {
      const store = (globalThis as unknown as { chrome?: { storage?: { local?: { set?: (o: unknown) => void } } } }).chrome?.storage?.local;
      store?.set?.({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: lead.id,
          verb: "complete-setup-tour",
          propertyId: tourMode.favoriteId,
          tourDate: args.tourDate,
          tourTime: args.tourTime,
        },
      });
    }
    exitTourMode();
  };

  // ── Autofill: bound to the property scheduler tab, multi-step aware ──────────
  // Clicking "Autofill Tour Form" is ONE intent. Autofill binds to the property
  // tab/origin captured at Tour Mode entry (tourMode.schedulerUrl) — never the
  // active tab — so switching to ChatGPT/Gmail/another property can never redirect
  // it or prompt for that tab's origin. If the multi-step scheduler (PERQ/calendar-
  // first) hasn't rendered the contact fields yet, we ARM a bounded re-inject
  // against that SAME bound tab (no new permission prompts — already granted) so the
  // fields fill once, the moment the locator reaches the contact step.
  // Read-only detected tour date/time (from the bound scheduler tab). Populates the
  // "When is the tour?" fields in TourModeView; the locator reviews + Saves manually.
  const [detectedTour, setDetectedTour] = useState<{ date: string | null; time: string | null } | null>(null);
  const autofillArmRef = useRef<{ intervalId: ReturnType<typeof setInterval>; tabId: number; nonce: string } | null>(null);
  const clearAutofillArm = () => {
    const arm = autofillArmRef.current;
    if (arm) {
      try { clearInterval(arm.intervalId); } catch { /* no-op */ }
    }
    autofillArmRef.current = null;
  };
  // ONE bounded loop for the observation period: keeps re-injecting Autofill until it
  // succeeds (idempotent), AND reads the selected date/time each cycle so a multi-step
  // scheduler's later selection is caught. Stops on tab close, Tour Mode exit/switch,
  // or timeout. Read-only detection never writes to the page.
  const armObservation = (tabId: number, payload: AutofillPayload, alreadyFilled: boolean, nonce: string) => {
    clearAutofillArm(); // repeated clicks never stack observers/intervals
    const startedAt = Date.now();
    const MAX_MS = 5 * 60_000; // give up after 5 min (scheduler abandoned)
    let filled = alreadyFilled;
    const intervalId = setInterval(async () => {
      const arm = autofillArmRef.current;
      if (!arm || arm.intervalId !== intervalId) return; // superseded
      if (Date.now() - startedAt > MAX_MS) { clearAutofillArm(); return; }
      // Bound tab gone → stop everything.
      try { const t = await chrome.tabs.get(tabId); if (!t || t.id == null) { clearAutofillArm(); return; } } catch { clearAutofillArm(); return; }
      // (1) Autofill retry until the contact fields are filled (idempotent; unchanged).
      if (!filled) {
        const res = await reinjectAutofillIntoTab(tabId, payload);
        if (res.status === "no-tab") { clearAutofillArm(); return; }
        if (res.status === "filled") filled = true;
      }
      // (2) Read-only date/time detection — runs the whole period so a later selection
      //     is picked up; updates if the scheduler selection changes.
      const det = await detectTourSelectionInTab(tabId);
      if (det && (det.date || det.time)) {
        setDetectedTour((prev) => {
          const next = { date: det.date ?? prev?.date ?? null, time: det.time ?? prev?.time ?? null };
          return prev && prev.date === next.date && prev.time === next.time ? prev : next;
        });
      }
    }, 2000);
    autofillArmRef.current = { intervalId, tabId, nonce };
  };
  const onAutofillTour = async (): Promise<AutofillOutcome> => {
    if (!active) return { status: "unsupported" };
    clearAutofillArm();
    const schedulerUrl = tourMode?.schedulerUrl ?? null;
    // SECURITY: with no bound scheduler context we do NOT fall back to the active
    // tab — Autofill must never resolve/inject/prompt against whatever tab happens
    // to be focused. No bound URL → safe no-op ("open the scheduler" hint).
    if (!schedulerUrl) return { status: "no-tab" };
    const payload = buildAutofillPayload(active);
    const { outcome, tabId } = await runAutofillForScheduler(schedulerUrl, payload);
    // Bound to the property tab → arm the bounded observation loop (autofill retry +
    // read-only date/time detection), whether fields were present now or not yet.
    if (tabId != null && (outcome.status === "filled" || outcome.status === "no-fields")) {
      armObservation(tabId, payload, outcome.status === "filled", tourMode?.nonce ?? "");
    }
    return outcome;
  };

  // Disarm + clear detection when Tour Mode exits or switches to a different property
  // (the armed nonce no longer matches the active tour), and on unmount. Combined with
  // the loop's own tab-closed + timeout stops, this covers every required cleanup case.
  useEffect(() => {
    const arm = autofillArmRef.current;
    if (arm && arm.nonce !== (tourMode?.nonce ?? "")) { clearAutofillArm(); setDetectedTour(null); }
  }, [tourMode]);
  useEffect(() => () => clearAutofillArm(), []);

  // "+ Add Task" → open the task sheet for THIS client. Captures the lead id NOW
  // (client-switch guard closes it if the active client changes). Task Time
  // defaults to 9:00 AM (same as Schedule Tour); title + date open blank.
  const onAddTask = () => {
    const lead = active?.lead;
    if (!lead || lead.id === undefined || lead.id === null) return;
    const name = formatPersonName(lead.firstName) || "this client";
    // "Follow Up" by default — it is the task a locator reaches for most, it is already a
    // first-class title elsewhere (its own SMS template and the same 💬 the automatic follow-ups
    // use), and it is still a plain text field anyone can overwrite.
    setTaskTitle(DEFAULT_TASK_TITLE);
    setTaskDate("");
    setTaskTime(DEFAULT_TIME_VALUE);
    setTaskNotes("");
    setTaskEdit(null);
    setAddTaskConfirm({ leadId: lead.id, name });
  };

  // Edit the lead's CURRENT open action — the pencil beside the Next Action due date. Opens the
  // SAME sheet, pre-filled, so there is one task dialog rather than two that can drift apart.
  const onEditTask = (taskId?: string | number) => {
    const lead = active?.lead;
    // With an id (the Do-first row) edit THAT task; without one (the pencil) edit the action the
    // Next Action card is showing — picked the same way LeadPanelView picks it.
    const open = (active?.nextActions ?? []).filter((x) => !x.completed);
    const a = taskId === undefined ? (open[0] ?? null) : (open.find((x) => String(x.id) === String(taskId)) ?? null);
    if (!lead || lead.id === undefined || lead.id === null) return;
    if (!a || a.id === undefined || a.id === null) return;
    const name = formatPersonName(lead.firstName) || "this client";
    setTaskTitle(a.title ?? "");
    const { date, time } = splitLocalDateTime(a.dueAt ?? null, active?.timeZone ?? null);
    setTaskDate(date);
    setTaskTime(time || DEFAULT_TIME_VALUE);
    setTaskNotes(a.notes ?? "");
    setTaskEdit({ taskId: a.id, actionKey: a.actionKey ?? null });
    setAddTaskConfirm({ leadId: lead.id, name });
  };

  // "Add Task" → post the canonical add-task verb to the authenticated CRM, which
  // creates the manual lead_next_actions row (createManualTask) and re-posts so the
  // Workspace + Companion reflect the new Next Action. Guarded: title + date + time
  // required (time is pre-filled to 9 AM). Cancel just closes the sheet.
  const confirmAddTask = () => {
    const c = addTaskConfirm;
    const title = taskTitle.trim();
    if (!c || !title || !taskDate || !taskTime) return;
    const editing = taskEdit;
    setAddTaskConfirm(null);
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store) {
      store.set({
        "lb-workflow-verb": editing
          ? {
              nonce: `${Date.now()}-${Math.random()}`,
              leadId: c.leadId,
              verb: "edit-task",
              taskId: editing.taskId,
              // A WORKFLOW action's title is never submitted — not because the field is disabled
              // (that is only what the locator sees) but because sending it at all would be asking
              // for a rename the server is required to refuse. The schedule and notes are the two
              // things that legitimately move.
              ...(editing.actionKey ? {} : { title }),
              taskDate,
              taskTime,
              notes: taskNotes,
            }
          : {
              nonce: `${Date.now()}-${Math.random()}`,
              leadId: c.leadId,
              verb: "add-task",
              title,
              taskDate,
              taskTime,
              notes: taskNotes,
            },
      });
    }
    setTaskTitle("");
    setTaskDate("");
    setTaskTime("");
    setTaskNotes("");
    setTaskEdit(null);
  };

  // The confirmation name comes from the CAPTURED pending contact, so it never
  // changes when the active client switches (Bug 2).
  // ← Back to CRM — focus the EXISTING Locator Beast CRM tab (the one hosting the
  // active-client bridge, which must already be open). Navigation only: never
  // opens a duplicate, never changes the active client, and never completes or
  // advances any workflow. Platform-agnostic — this is about the CRM, not
  // whichever list-building platform is configured.
  const onBackToCrm = () => focusExistingCrmTab();

  // "Send Guest Card" → the Guest Card composer is a full CRM modal (jsPDF/mailto),
  // so open it in the EXISTING CRM tab: focus that tab, then post the open-guest-card
  // verb with THIS property's open guest-card action id. Nothing sends until the
  // agent reviews + sends inside the composer.
  const onSendGuestCard = () => {
    const lead = active?.lead;
    if (!lead || lead.id === undefined || lead.id === null) return;
    const gc = (active?.nextActions ?? []).find(
      (a) => !a.completed && (a.title ?? "").trim().toLowerCase() === "email guest card"
    );
    focusExistingCrmTab();
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: lead.id,
          verb: "open-guest-card",
          actionId: gc?.id ?? null,
        },
      });
    }
  };

  // "Tour Follow-Up" → open the canonical outcome modal in the EXISTING CRM tab
  // for the SURFACED property's open tour_follow_up. Same canonical workflow as the
  // Workspace — the extension has NO Tour Follow-Up business logic of its own.
  const onTourFollowUp = () => {
    const lead = active?.lead;
    if (!lead || lead.id === undefined || lead.id === null) return;
    const tf = (active?.nextActions ?? []).find(
      (a) => !a.completed && (a.title ?? "").trim().toLowerCase() === "tour follow-up"
    );
    focusExistingCrmTab();
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: lead.id,
          verb: "open-tour-follow-up",
          actionId: tf?.id ?? null,
        },
      });
    }
  };

  // "Apply" → open the application-submitted confirmation in the CRM tab.
  const onStartApplication = () => {
    const lead = active?.lead;
    if (!lead || lead.id === undefined || lead.id === null) return;
    const ap = (active?.nextActions ?? []).find(
      (a) => !a.completed && (a.title ?? "").trim().toLowerCase() === "apply"
    );
    focusExistingCrmTab();
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: lead.id,
          verb: "open-apply",
          actionId: ap?.id ?? null,
        },
      });
    }
  };

  // "Check Application" → open the canonical application-status outcome modal in the
  // CRM tab for the Top Pick's open check_application. Same canonical workflow as the
  // Workspace — the extension has NO Check Application business logic of its own.
  const onCheckApplication = () => {
    const lead = active?.lead;
    if (!lead || lead.id === undefined || lead.id === null) return;
    const ca = (active?.nextActions ?? []).find(
      (a) => !a.completed && (a.title ?? "").trim().toLowerCase() === "check app"
    );
    focusExistingCrmTab();
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: lead.id,
          verb: "open-check-application",
          actionId: ca?.id ?? null,
        },
      });
    }
  };

  // "Confirm Lease" → open the "did the client sign?" confirm in the CRM tab for the
  // Top Pick's open confirm_lease. Same canonical workflow as the Workspace — the
  // extension has NO Confirm Lease business logic of its own.
  const onConfirmLease = () => {
    const lead = active?.lead;
    if (!lead || lead.id === undefined || lead.id === null) return;
    const cl = (active?.nextActions ?? []).find(
      (a) => !a.completed && (a.title ?? "").trim().toLowerCase() === "confirm lease"
    );
    focusExistingCrmTab();
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: lead.id,
          verb: "open-confirm-lease",
          actionId: cl?.id ?? null,
        },
      });
    }
  };

  // "Get Invoice Details" → open the compact invoice intake in the CRM tab for the
  // Closed lead's Top Pick. Same canonical workflow as the Workspace — the extension
  // has NO invoice business logic of its own.
  const onGetInvoiceDetails = () => {
    const lead = active?.lead;
    if (!lead || lead.id === undefined || lead.id === null) return;
    const inv = (active?.nextActions ?? []).find(
      (a) => !a.completed && (a.title ?? "").trim().toLowerCase() === "get invoice details"
    );
    focusExistingCrmTab();
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: lead.id,
          verb: "open-invoice-details",
          actionId: inv?.id ?? null,
        },
      });
    }
  };

  // "Send Invoice" → open the invoice email composer in the CRM tab for the Closed
  // lead's Top Pick. Same canonical composer/confirmation as the Workspace — the
  // extension has NO invoice-sending business logic of its own.
  const onSendInvoice = () => {
    const lead = active?.lead;
    if (!lead || lead.id === undefined || lead.id === null) return;
    const inv = (active?.nextActions ?? []).find(
      (a) => !a.completed && (a.title ?? "").trim().toLowerCase() === "send invoice"
    );
    focusExistingCrmTab();
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: lead.id,
          verb: "open-send-invoice",
          actionId: inv?.id ?? null,
        },
      });
    }
  };

  // "Confirm Payment" → open the "did you receive the commission payment?" confirm
  // in the CRM tab for the Closed lead's Top Pick. Same canonical confirmation as the
  // Workspace — the extension has NO payment business logic of its own.
  const onConfirmPayment = () => {
    const lead = active?.lead;
    if (!lead || lead.id === undefined || lead.id === null) return;
    const cp = (active?.nextActions ?? []).find(
      (a) => !a.completed && (a.title ?? "").trim().toLowerCase() === "confirm payment"
    );
    focusExistingCrmTab();
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: lead.id,
          verb: "open-commission-paid",
          actionId: cp?.id ?? null,
        },
      });
    }
  };

  // "Send Rebate" → open the "Send Rebate · {Property}" confirm in the CRM tab for
  // the Closed lead's Top Pick (Cash Rebate only). Same canonical confirmation as the
  // Workspace — the extension has NO payment business logic of its own.
  const onSendRebate = () => {
    const lead = active?.lead;
    if (!lead || lead.id === undefined || lead.id === null) return;
    const sr = (active?.nextActions ?? []).find(
      (a) => !a.completed && (a.title ?? "").trim().toLowerCase() === "send rebate"
    );
    focusExistingCrmTab();
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: lead.id,
          verb: "open-send-rebate",
          actionId: sr?.id ?? null,
        },
      });
    }
  };

  // "+ Recommendation" / "♡ Favorite" on the Current Property — add the ALREADY
  // detected property to the ACTIVE client's canonical collection via the existing
  // verb bridge (no re-scrape, no Companion-side store). The CRM performs the
  // lead_recommendations / lead_favorites insert and re-posts the active client.
  // No-op when there is no active client or no detected property.
  //
  // KNOWN LIMITATION (current architecture): the actual database write is performed
  // by DashboardClient on the Locator Beast CRM/admin page (the only authenticated
  // Supabase context). The verb is delivered via chrome.storage → workflowVerbBridge,
  // which runs ONLY on a CRM/admin tab. So these actions require an OPEN Locator
  // Beast CRM/admin tab; with no CRM tab open the verb is not consumed and no write
  // occurs. CRM-independent writes are a deferred phase (the existing PKCE extension
  // token flow: /api/extension/connect/authorize + /api/extension/token + a new
  // authenticated, ownership-checked companion write route) — intentionally NOT
  // built yet. Do NOT add a hidden/auto-opened CRM tab or read Supabase cookies.
  const addCurrentPropertyToCollection = (verb: "add-recommendation" | "add-favorite") => {
    const lead = active?.lead;
    if (!lead || lead.id === undefined || lead.id === null || !currentProperty) return;
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: lead.id,
          verb,
          // Send the ENRICHED property: a resolved the external site property carries its catalog
          // placeId (so the CRM adopts the ?q=place_id:<id> identity carrier at once)
          // and catalog image. If enrichment hasn't landed yet, this is the raw the external site
          // property and the CRM resolves the place_id in the background instead.
          property: displayCurrentProperty ?? currentProperty,
        },
      });
    }
  };
  const onAddRecommendation = () => addCurrentPropertyToCollection("add-recommendation");
  const onAddFavorite = () => addCurrentPropertyToCollection("add-favorite");

  // Move a SAVED row between the two collections without the property being open in
  // the external site. Reuses the same verb bridge and the same CRM handler as the buttons above —
  // only the identity source differs (a stored row's URL rather than Current Property).
  const moveSavedProperty = (verb: "move-to-favorite" | "move-to-recommendation", propertyUrl?: string | null) => {
    const lead = active?.lead;
    const url = String(propertyUrl ?? "").trim();
    if (!lead || lead.id === undefined || lead.id === null || !url) return;
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (!store) return;
    store.set({
      "lb-workflow-verb": {
        nonce: `${Date.now()}-${Math.random()}`,
        leadId: lead.id,
        verb,
        property: { propertyUrl: url },
      },
    });
  };
  const onMoveToFavorite = (propertyUrl?: string | null) => moveSavedProperty("move-to-favorite", propertyUrl);
  const onMoveToRecommendation = (propertyUrl?: string | null) => moveSavedProperty("move-to-recommendation", propertyUrl);

  // Compact ✕ on a Recommendation — remove the property entirely. Same verb bridge
  // as the moves; the CRM handler deletes the lead_recommendations row and
  // re-broadcasts (synced). A Favorite's ✕ is NOT a delete — it reuses
  // onMoveToRecommendation (move back), so there is no remove-favorite path.
  const removeSavedProperty = (verb: "remove-recommendation", propertyUrl?: string | null) => {
    const lead = active?.lead;
    const url = String(propertyUrl ?? "").trim();
    if (!lead || lead.id === undefined || lead.id === null || !url) return;
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (!store) return;
    store.set({
      "lb-workflow-verb": {
        nonce: `${Date.now()}-${Math.random()}`,
        leadId: lead.id,
        verb,
        property: { propertyUrl: url },
      },
    });
  };
  const onRemoveRecommendation = (propertyUrl?: string | null) => removeSavedProperty("remove-recommendation", propertyUrl);

  // Manual dismiss of the transient Current Property — removes ONLY the
  // lb-current-property record. The storage.onChanged listener above then sets
  // currentProperty → null, so the section returns to its empty state immediately.
  // Same clear path as a market switch; the active client, Recommendations and
  // Favorites live on other keys and are untouched.
  const onClearCurrentProperty = () => {
    void removeSensitive(CURRENT_PROPERTY_KEY);
  };

  const pendingName = pendingContact?.name ?? "this client";

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <PanelApp
        connection={effectiveConnection}
        state={active ? "loaded" : "no-client"}
        lead={active?.lead ?? null}
        nextActions={active?.nextActions ?? []}
        favorites={active?.favorites ?? []}
        recommendations={active?.recommendations ?? []}
        currentProperty={displayCurrentProperty}
        onAddRecommendation={onAddRecommendation}
        onAddFavorite={onAddFavorite}
        onMoveToFavorite={onMoveToFavorite}
        onMoveToRecommendation={onMoveToRecommendation}
        onRemoveRecommendation={onRemoveRecommendation}
        onClearCurrentProperty={onClearCurrentProperty}
        onAutofillTour={active ? onAutofillTour : undefined}
        tourMode={tourMode}
        detectedTour={detectedTour}
        onTourBack={exitTourMode}
        onTourConfirm={confirmTourMode}
        locator={active?.locator ?? null}
        onEditClient={onEditClient}
        canEditClient={!!active?.lead}
        onEditTemplates={onEditTemplates}
        textTop3On={textTop3On}
        aiVoiceScriptOn={aiVoiceScriptOn}
        onToggleTextTop3={onToggleTextTop3}
        onToggleAiVoiceScript={onToggleAiVoiceScript}
        onConnect={onConnect}
        onContact={onContact}
        onContactLead={onContactLead}
        onBuildList={onBuildList}
        onActiveViewChange={setCompanionView}
        onSendList={onSendList}
        onSendFollowUp={onSendFollowUp}
        onScheduleTour={onScheduleTour}
        onSendGuestCard={onSendGuestCard}
        onTourFollowUp={onTourFollowUp}
        onStartApplication={onStartApplication}
        onCheckApplication={onCheckApplication}
        onConfirmLease={onConfirmLease}
        onGetInvoiceDetails={onGetInvoiceDetails}
        onSendInvoice={onSendInvoice}
        onConfirmPayment={onConfirmPayment}
        onSendRebate={onSendRebate}
        onAddTask={onAddTask}
        onEditTask={onEditTask}
        onBackToCrm={onBackToCrm}
        timeZone={active?.timeZone ?? null}
        automatedTexting={active?.automatedTexting}
        onToggleAutomatedTexts={onToggleAutomatedTexts}
      />

      {companionMayConfirm("contact_outcome") && pendingContact && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={pendingContact.phase === "choose-method" ? "Choose contact method" : "Confirm contact"}
          onClick={dismissContact}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "flex-end",
            background: "rgba(0,0,0,0.45)",
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={SHEET_STYLE}>
            {pendingContact.phase === "choose-method" ? (
              <>
                <p style={SHEET_QUESTION_STYLE}>
                  Would you like to call or text {pendingName}?
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button type="button" onClick={() => chooseMethod("call")} style={SHEET_PRIMARY_BTN}>
                    Call
                  </button>
                  <button type="button" onClick={() => chooseMethod("text")} style={SHEET_SECONDARY_BTN}>
                    Text
                  </button>
                  <button type="button" onClick={dismissContact} style={SHEET_CANCEL_BTN}>
                    Cancel
                  </button>
                </div>
              </>
            ) : pendingContact.method === "text" ? (
              <>
                <p style={SHEET_QUESTION_STYLE}>
                  Did you text {pendingName}?
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button type="button" onClick={resolveTextSent} style={SHEET_PRIMARY_BTN}>
                    Yes, Sent
                  </button>
                  <button type="button" onClick={dismissContact} style={SHEET_CANCEL_BTN}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={SHEET_QUESTION_STYLE}>
                  Did you call {pendingName}?
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button type="button" onClick={() => resolveContact("yes")} style={SHEET_PRIMARY_BTN}>
                    Yes, Contacted
                  </button>
                  <button type="button" onClick={() => resolveContact("no-answer")} style={SHEET_SECONDARY_BTN}>
                    No Answer
                  </button>
                  <button type="button" onClick={dismissContact} style={SHEET_CANCEL_BTN}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {companionMayConfirm("build_list_choice") && buildListChoice && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose how to build the list"
          onClick={() => setBuildListChoice(null)}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "flex-end",
            background: "rgba(0,0,0,0.45)",
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={SHEET_STYLE}>
            {/* Same sheet language as the other Companion confirmations (e.g. "Did
                you send {name}'s list?"): a question, then equal primary action
                buttons, with Cancel underneath. The two tools read as ACTIONS —
                both use the blue primary button, not outlined content cards. */}
            <p style={SHEET_QUESTION_STYLE}>
              How do you want to build {buildListChoice.name}'s list?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button type="button" onClick={chooseSad} style={SHEET_PRIMARY_BTN}>
                Property Site
              </button>
              <button type="button" onClick={chooseLocatorBeast} style={SHEET_PRIMARY_BTN}>
                Locator Beast
              </button>
              <button type="button" onClick={() => setBuildListChoice(null)} style={SHEET_CANCEL_BTN}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* "Ready to send {name}'s list?" — the first real milestone (List Built),
          using the SAME bottom-sheet pattern as the Send List / tour confirmations.
          Shown while the client is mid-build with ≥1 Recommendation (Client tab
          only). "Yes, List Built" completes the real build_list and creates the
          Send List step; "Not Yet" snoozes (deadline-aware — never dismisses
          forever, never past the Build List due time). */}
      {companionMayConfirm("list_built") && showReadyToSend && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ready to send list"
          onClick={notYetListBuilt}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "flex-end",
            background: "rgba(0,0,0,0.45)",
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={SHEET_STYLE}>
            <p style={SHEET_QUESTION_STYLE}>
              Ready to send {formatPersonName(active?.lead?.firstName) || "this client"}'s list?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button type="button" onClick={confirmListBuilt} style={SHEET_PRIMARY_BTN}>
                Yes, List Built
              </button>
              <button type="button" onClick={notYetListBuilt} style={SHEET_SECONDARY_BTN}>
                Not Yet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send List share sheet — Preview List + Copy Link for the immutable snapshot,
          then the "Did you send…?" confirmation. Same bottom-sheet pattern as the
          other Companion confirmations. Preparing/copying never marks the list sent;
          only "Yes, List Sent" completes send_list (and stamps sent_at). "Not Yet"
          closes but leaves send_list open and the snapshot available to reopen. */}
      {companionMayConfirm("send_list") && sendListShare && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Send list"
          onClick={() => setSendListShare(null)}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "flex-end",
            background: "rgba(0,0,0,0.45)",
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={SHEET_STYLE}>
            {sendListShare.phase === "loading" ? (
              <p style={{ ...SHEET_QUESTION_STYLE, marginBottom: 0 }}>
                Preparing {sendListShare.name}'s list link…
              </p>
            ) : sendListShare.phase === "error" ? (
              <>
                <p style={SHEET_QUESTION_STYLE}>
                  Couldn't prepare {sendListShare.name}'s list link.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button type="button" onClick={retrySendListShare} style={SHEET_PRIMARY_BTN}>
                    Try Again
                  </button>
                  <button type="button" onClick={() => setSendListShare(null)} style={SHEET_CANCEL_BTN}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={SHEET_QUESTION_STYLE}>
                  Send {sendListShare.name}'s list
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button type="button" onClick={previewSendListShare} style={SHEET_SECONDARY_BTN}>
                    Preview List
                  </button>
                  <button type="button" onClick={copySendListShare} style={SHEET_SECONDARY_BTN}>
                    {sendListShare.copied ? "Link Copied ✓" : "Copy Link"}
                  </button>
                </div>
                <p
                  style={{
                    ...SHEET_QUESTION_STYLE,
                    margin: "14px 0 12px",
                    paddingTop: 14,
                    borderTop: "1px solid var(--lb-border, rgba(255,255,255,0.10))",
                  }}
                >
                  Did you send {sendListShare.name}'s list?
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button type="button" onClick={confirmSendList} style={SHEET_PRIMARY_BTN}>
                    Yes, List Sent
                  </button>
                  <button type="button" onClick={() => setSendListShare(null)} style={SHEET_CANCEL_BTN}>
                    Not Yet
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {companionMayConfirm("post_list_follow_up") && followUpConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm follow-up sent"
          onClick={() => setFollowUpConfirm(null)}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "flex-end",
            background: "rgba(0,0,0,0.45)",
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={SHEET_STYLE}>
            {/* Copy differs by sequence (workflow/completion behavior is identical):
                - Contact Attempts (2nd/3rd/Final) may be a call OR a text, so the
                  prompt asks "Did you make the … contact attempt?" and confirms
                  "Yes, Done".
                - Post-list Follow-Ups are always a sent text, so they keep the
                  "Did you text …?" / "Yes, Sent" wording. */}
            <p style={SHEET_QUESTION_STYLE}>
              {isContactFollowUpAction(followUpConfirm.title)
                ? `Did you make the ${formatWorkflowActionLabel(followUpConfirm.title)
                    .replace(/\s*Contact Attempt$/i, "")
                    .toLowerCase()} contact attempt?`
                : `Did you send the ${formatWorkflowActionLabel(followUpConfirm.title)}?`}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button type="button" onClick={confirmFollowUp} style={SHEET_PRIMARY_BTN}>
                {isContactFollowUpAction(followUpConfirm.title) ? "Yes, Done" : "Yes, Sent"}
              </button>
              <button type="button" onClick={() => setFollowUpConfirm(null)} style={SHEET_CANCEL_BTN}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {companionMayConfirm("schedule_tour") && scheduleTourConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm tour scheduled"
          onClick={() => setScheduleTourConfirm(null)}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "flex-end",
            background: "rgba(0,0,0,0.45)",
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={SHEET_STYLE}>
            {/* Pick the property + local date/time BEFORE confirming. A tour
                prefers a saved Favorite, but lead_tours.property_id is nullable, so
                "Other Property" / "Schedule Without Property" let scheduling proceed
                when the client has no Favorites. Selecting/entering does NOT
                complete the action — only "Yes, Scheduled" does. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
              <label style={SHEET_FIELD_LABEL}>
                Property *
                <select
                  value={selectedPropertyId}
                  onChange={(e) => setSelectedPropertyId(e.target.value)}
                  style={SHEET_INPUT_STYLE}
                >
                  <option value="">Select Favorite Property</option>
                  {(active?.favorites ?? []).map((f) => (
                    <option key={String(f.id)} value={String(f.id)}>
                      {f.propertyName}
                    </option>
                  ))}
                  <option value="__other__">Other Property</option>
                  <option value="__none__">Schedule Without Property</option>
                </select>
              </label>
              <label style={SHEET_FIELD_LABEL}>
                Tour Date *
                <input
                  type="date"
                  value={tourDate}
                  onChange={(e) => setTourDate(e.target.value)}
                  onClick={openNativePicker}
                  style={SHEET_INPUT_STYLE}
                />
              </label>
              <label style={SHEET_FIELD_LABEL}>
                Tour Time *
                {/* Deliberate Done/Apply time picker (shared 12h↔24h logic) — a
                    changed-but-uncommitted draft never leaks into the field. */}
                <TourTimeField value={tourTime} onChange={setTourTime} />
              </label>
            </div>
            <p style={SHEET_QUESTION_STYLE}>
              Did you schedule the tour for {scheduleTourConfirm.name}?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                onClick={confirmScheduleTour}
                disabled={!selectedPropertyId || !tourDate || !tourTime}
                style={{ ...SHEET_PRIMARY_BTN, ...((!selectedPropertyId || !tourDate || !tourTime) ? SHEET_BTN_DISABLED : null) }}
              >
                Yes, Scheduled
              </button>
              <button type="button" onClick={() => setScheduleTourConfirm(null)} style={SHEET_CANCEL_BTN}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {addTaskConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add task"
          onClick={() => setAddTaskConfirm(null)}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "flex-end",
            background: "rgba(0,0,0,0.45)",
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={SHEET_STYLE}>
            <p style={SHEET_QUESTION_STYLE}>
              {taskEdit ? `Edit task for ${addTaskConfirm.name}` : `Add a task for ${addTaskConfirm.name}`}
            </p>
            {/* Task title + local date/time. Same Done/Apply time control and
                whole-field native date picker as Schedule Tour. Nothing is saved
                until "Add Task" (title + date + time all required; time pre-filled). */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
              <label style={SHEET_FIELD_LABEL}>
                Task *
                <select
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  autoFocus={!taskEdit}
                  // An automatic workflow action's name belongs to the workflow: renaming one
                  // resurrects a duplicate stage action and can strand the lead. Disabled here is
                  // the EXPLANATION; the server refuses the rename either way.
                  disabled={!!taskEdit?.actionKey}
                  style={{ ...SHEET_INPUT_STYLE, ...(taskEdit?.actionKey ? { opacity: 0.6 } : null) }}
                >
                  {/* A task saved before these options existed — or a workflow action being
                      re-dated — keeps its own title as a selectable entry, so opening the editor
                      can never silently rewrite what is already stored. */}
                  {taskTitle && !TASK_TITLE_OPTIONS.includes(taskTitle as (typeof TASK_TITLE_OPTIONS)[number]) && (
                    <option value={taskTitle}>{taskTitle}</option>
                  )}
                  {TASK_TITLE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
              {taskEdit?.actionKey ? (
                <p style={{ margin: "-4px 0 0", fontSize: 11.5, lineHeight: 1.35, opacity: 0.7 }}>
                  This is an automatic step — you can move its date and add notes, but its name
                  stays as it is.
                </p>
              ) : null}
              {/* The Companion's OWN calendar, not Chrome's. The native input opened a light
                  picker with up/down steppers that matched nothing else here; this is the same
                  dark, left/right-navigating grid Out of Office already uses — enlarged, and
                  opening UPWARD because this sheet sits at the bottom of the panel.
                  The VALUE contract is unchanged: "YYYY-MM-DD" in, "YYYY-MM-DD" out, so
                  localTourToUtc, splitLocalDateTime and the time field are untouched. DateField
                  composes its dates from LOCAL parts and never serialises a Date, which also
                  removes the off-by-one-day risk the native input carried. */}
              <div style={SHEET_FIELD_LABEL as CSSProperties}>
                Due Date *
                <div style={{ marginTop: 4 }}>
                  <DateField
                    value={taskDate || null}
                    onChange={(next) => setTaskDate(next ?? "")}
                    label="Due Date"
                    placeholder="Pick a date"
                    placement="up"
                    size="lg"
                  />
                </div>
              </div>
              <label style={SHEET_FIELD_LABEL}>
                Due Time *
                <TourTimeField value={taskTime} onChange={setTaskTime} />
              </label>
              <label style={SHEET_FIELD_LABEL}>
                Notes
                <textarea
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  placeholder="Optional — context for this task"
                  rows={2}
                  style={{ ...SHEET_INPUT_STYLE, resize: "vertical", minHeight: 48 }}
                />
              </label>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                onClick={confirmAddTask}
                disabled={!taskTitle.trim() || !taskDate || !taskTime}
                style={{ ...SHEET_PRIMARY_BTN, ...((!taskTitle.trim() || !taskDate || !taskTime) ? SHEET_BTN_DISABLED : null) }}
              >
                {taskEdit ? "Save Changes" : "Add Task"}
              </button>
              <button
                type="button"
                onClick={() => { setAddTaskConfirm(null); setTaskEdit(null); setTaskNotes(""); }}
                style={SHEET_CANCEL_BTN}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Shared bottom-sheet visual language — used by BOTH the method chooser and the
// result confirmation, so the two states are one consistent sheet.
const SHEET_STYLE: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--lb-surface, #14171f)",
  color: "var(--lb-text, #e6ebf5)",
  borderTop: "1px solid var(--lb-border, rgba(255,255,255,0.10))",
  borderRadius: "14px 14px 0 0",
  padding: "16px 14px calc(16px + env(safe-area-inset-bottom, 0px))",
  boxShadow: "0 -8px 24px rgba(0,0,0,0.35)",
};
const SHEET_QUESTION_STYLE: CSSProperties = { margin: "0 0 12px", fontSize: 14, fontWeight: 600, lineHeight: 1.35 };
const SHEET_PRIMARY_BTN: CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1px solid var(--lb-accent, #3b82f6)", background: "var(--lb-accent, #3b82f6)",
  color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer",
};
const SHEET_SECONDARY_BTN: CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1px solid var(--lb-border, rgba(255,255,255,0.14))", background: "transparent",
  color: "inherit", fontWeight: 600, fontSize: 13, cursor: "pointer",
};
const SHEET_CANCEL_BTN: CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 10, border: "none", background: "transparent",
  color: "var(--lb-text-muted, #9aa4b2)", fontWeight: 500, fontSize: 12.5, cursor: "pointer",
};
const SHEET_FIELD_LABEL: CSSProperties = {
  display: "flex", flexDirection: "column", gap: 5,
  fontSize: 12, fontWeight: 600, color: "var(--lb-text-muted, #9aa4b2)",
};
const SHEET_INPUT_STYLE: CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "9px 10px", borderRadius: 9,
  border: "1px solid var(--lb-border, rgba(255,255,255,0.14))",
  background: "var(--lb-inset, rgba(255,255,255,0.04))",
  color: "var(--lb-text, #e6ebf5)", fontSize: 14,
};
const SHEET_BTN_DISABLED: CSSProperties = { opacity: 0.5, cursor: "not-allowed" };

// Normalize a raw phone to an E.164 tel:/sms: URL. 10 digits → +1XXXXXXXXXX;
// 11 digits starting with 1 → +…; otherwise best-effort +digits. Empty if none.
function dialUrl(method: "call" | "text", rawPhone: string | null | undefined, body?: string | null): string {
  const digits = String(rawPhone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const e164 =
    digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : `+${digits}`;
  const base = `${method === "call" ? "tel:" : "sms:"}${e164}`;
  if (method === "text" && body) return `${base}?&body=${encodeURIComponent(body)}`;
  return base;
}

// PRODUCTION ORIGINS ONLY. The dev origins that used to sit here were removed
// for beta distribution so no development-only pattern ships to agents. Local
// development is unaffected: the PRIMARY path below returns to the exact tab id
// the background recorded, which is origin-agnostic and still works on
// localhost. Only this URL-pattern FALLBACK is production-scoped — and on a
// production build the manifest never grants localhost access anyway, so the
// dev entries could never have matched (see scripts/build.mjs, which injects
// the local origins into the manifest for --watch builds only).
const CRM_TAB_URL_PATTERNS = [
  "*://locatorbeast.com/admin/*",
  "*://www.locatorbeast.com/admin/*",
];

// chrome.storage key set by the background: { tabId, windowId } of the CRM tab
// that most recently supplied the Companion active client.
const CRM_TAB_KEY = "lb-crm-tab";

// Focus the EXISTING Locator Beast CRM tab (never opens a duplicate). Shared by
// the ← Back to CRM control and by the call/text launcher (to undo the protocol
// tab's focus steal). Host access via the manifest content-script match lets
// tabs.query filter by URL without a new permission.
//
// PRIMARY: return to the EXACT originating tab the background remembered (the one
// that supplied the active client) — origin-agnostic, so this still works in
// local development. FALLBACK (that tab is
// gone, or none was recorded): the URL-pattern query, first match. Works in both
// dev and prod because the recorded windowId/tabId are origin-agnostic.
function focusExistingCrmTab(): void {
  const chrome = (globalThis as unknown as { chrome?: any }).chrome;
  const tabs = chrome?.tabs;
  const windows = chrome?.windows;
  if (!tabs?.query) return;

  const focusByQuery = () => {
    tabs.query({ url: CRM_TAB_URL_PATTERNS }, (matches: any[]) => {
      const existing = matches && matches[0];
      if (existing?.id != null) {
        tabs.update(existing.id, { active: true });
        if (existing.windowId != null && windows?.update) windows.update(existing.windowId, { focused: true });
      }
      // No CRM tab found (rare — the active-client bridge needs one open): do
      // nothing rather than guess an origin and open a duplicate/wrong tab.
    });
  };

  const store = chrome?.storage?.local;
  if (!store?.get) {
    focusByQuery();
    return;
  }
  store.get(CRM_TAB_KEY, (res: any) => {
    const remembered = res?.[CRM_TAB_KEY];
    if (remembered?.tabId == null) {
      focusByQuery();
      return;
    }
    // Activate the exact remembered tab; if it no longer exists, chrome.tabs.update
    // sets runtime.lastError and we fall back to the URL query.
    tabs.update(remembered.tabId, { active: true }, (tab: any) => {
      if (chrome.runtime?.lastError || !tab) {
        focusByQuery();
        return;
      }
      if (remembered.windowId != null && windows?.update) windows.update(remembered.windowId, { focused: true });
    });
  });
}

// Launch tel:/sms:.
//
// PREFERRED: initiate the external protocol FROM the existing CRM page via the
// content-script bridge (chrome.storage → commLaunchBridge → an <a href="tel:…">
// click on the CRM document). Because the launch happens on the CRM page itself,
// Chrome raises "Open [app]?" over that page — no new tab is created and the CRM
// never disappears, so the dialog can't be dismissed by a tab switch. (The async
// hop loses transient user activation; tel:/sms: are external protocols that do
// not require it — but this needs runtime confirmation. See report + fallback.)
//
// FALLBACK: the known-working protocol-tab launch (chrome.tabs.create({url})).
// It reaches the OS handler and the dialog stays open, but it visually replaces
// the CRM with a blank tab. Used only when the storage bridge is unavailable
// (e.g. the dev harness). To revert entirely, call launchViaProtocolTab here.
// Companion communication launcher.
//
// PATH C (experiment, now active): launch tel:/sms: DIRECTLY from the panel's own
// user gesture. onContact/chooseMethod call this SYNCHRONOUSLY inside the Call/
// Text click handler, so this navigation carries transient user activation — the
// thing the async CRM-page bridge lacked (its content-script anchor click had no
// gesture, so Chrome throttled repeat launches). With activation, every press is
// a fresh, non-throttled launch. Chrome recognizes tel:/sms: as external and
// hands off to the OS WITHOUT navigating the panel document.
function launchExternalUrl(url: string): void {
  launchViaBridge(url);
}

function launchViaPanel(url: string): void {
  // Smallest supported mechanism first: a same-context navigation assignment.
  try {
    window.location.assign(url);
  } catch {
    /* ignore — external-protocol handoff is best-effort */
  }
}

// PRESERVED — the CRM-page comm bridge write (chrome.storage → commLaunchBridge
// content script → anchor on the CRM page). NOT currently used; kept intact so
// Path C reverts to it in one line (launchExternalUrl → launchViaBridge) if the
// panel-side launch fails at runtime. The commLaunchBridge content script is left
// untouched.
function launchViaBridge(url: string): void {
  const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
  if (store) {
    store.set({ "lb-launch-comm": { url, nonce: `${Date.now()}-${Math.random()}` } });
    return;
  }
  launchViaProtocolTab(url);
}
// Reference the now-unused experimental launcher so it isn't flagged unused
// (kept for later removal once everything is stable).
void launchViaPanel;

// Known-working baseline (Version A). Kept as the fallback and one-line revert.
function launchViaProtocolTab(url: string): void {
  const tabs = (globalThis as unknown as { chrome?: any }).chrome?.tabs;
  try {
    if (tabs?.create) {
      tabs.create({ url });
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } catch {
    /* ignore — external-protocol handoff is best-effort */
  }
}
