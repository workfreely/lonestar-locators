import { useEffect, useState, type CSSProperties } from "react";
import type { LeadSummaryDTO, NextActionDTO, FavoriteDTO, RecommendationDTO } from "@bc/companion-shared";
import type { CurrentProperty } from "@/types";
import { formatPersonName, buildIntroSmsBody, buildFollowUpSmsBody, isFollowUpAction, formatWorkflowActionLabel, DEFAULT_TIME_VALUE } from "@bc/companion-shared";
import { PanelApp } from "./PanelApp";
import { TourTimeField } from "./lead/TourTimeField";
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
  // Saved locator IANA timezone — Companion formats Due/Completed times in this
  // zone so it matches the CRM regardless of the device's zone.
  timeZone?: string | null;
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
// the locator is viewing (Smart Apartment Data), NOT the selected CRM client.

function isActivePayload(v: unknown): v is ActiveClientPayload {
  const p = v as ActiveClientPayload | null | undefined;
  return !!p && !!p.lead && p.lead.id !== undefined && p.lead.id !== null;
}

function isCurrentProperty(v: unknown): v is CurrentProperty {
  const p = v as CurrentProperty | null | undefined;
  return !!p && typeof p.propertyId === "string" && typeof p.propertyName === "string" && p.propertyName.length > 0;
}

export function ProductionPanel() {
  const [connection, setConnection] = useState<CompanionConnection>(DISCONNECTED);
  const [active, setActive] = useState<ActiveClientPayload | null>(null);
  // The Smart Apartment Data property currently being viewed (page context, not a
  // saved collection). Independent of `active` so switching clients never clears it.
  const [currentProperty, setCurrentProperty] = useState<CurrentProperty | null>(null);
  // Pending contact confirmation ("Were you able to contact …?"). Null = hidden.
  // Immutable pending-contact context — captured when contact is INITIATED and
  // resolved against THIS captured identity, never the live active client (Bug 2).
  // Two phases of the SAME bottom sheet:
  //   "choose-method"  → "Would you like to call or text {name}?" (Contact Lead)
  //   "confirm-result" → "Were you able to contact {name}?"       (after launch)
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

  // Send List confirmation ("Did you send the client's list?"). Null = hidden.
  // Captures the lead identity at click time so confirming resolves against THIS
  // lead, never a later active client (same immutability rule as pendingContact).
  const [sendListConfirm, setSendListConfirm] = useState<null | {
    leadId: string | number;
    name: string;
  }>(null);

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
      setTaskTitle("");
      setTaskDate("");
      setTaskTime("");
    }
  }, [activeLeadId, addTaskConfirm]);

  const rt = () => (globalThis as unknown as { chrome?: any }).chrome?.runtime;
  const onConnect = () => rt()?.sendMessage?.({ type: "companion:start-connect" });
  const onDisconnect = () => {
    rt()?.sendMessage?.({ type: "companion:disconnect" });
    setConnection(DISCONNECTED);
  };

  // An active client means the live CRM is connected and pushing read-only data.
  // Prefer that over the (not-yet-built) SW connection so the client renders.
  const effectiveConnection: CompanionConnection = active
    ? { status: "connected", name: active.agentName ?? "Locator Beast", workspace: "Locator Beast CRM" }
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
  const introSmsBodyFor = (lead: LeadSummaryDTO | null | undefined): string | undefined => {
    if (!lead || String(lead.stage) !== "new") return undefined;
    const locatorFirstName = (active?.agentName ?? "").trim().split(/\s+/)[0] ?? "";
    return buildIntroSmsBody({
      firstName: formatPersonName(lead.firstName) || "",
      locatorFirstName,
      propertyType: lead.searchCriteria?.propertyType,
      beds: lead.searchCriteria?.beds,
      moveDate: lead.searchCriteria?.moveDate,
    });
  };

  // Header Call Client / Text Client: method is already known, so skip the
  // chooser and go straight to launch + the "Were you able to contact?" result.
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

  // "Yes, Contacted" records first contact (canonical cascade — advances New →
  // Contacted, creates Build List). "No Answer" logs a contact_attempt to the
  // timeline WITHOUT advancing the stage (the lead stays New, Contact Lead
  // retained). "Cancel" does nothing. Both non-cancel outcomes route through the
  // authenticated CRM bridge (the panel has no session of its own).
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

  // Text path — "Did you send the text?" → "Yes, Sent". Posts the canonical
  // "text-sent" verb to the CRM (panel → chrome.storage → content script → CRM),
  // which runs the SAME pending-outreach cascade the Kanban-drag modal uses:
  // a "Follow Up" next action + a text_sent timeline event → Status "Waiting for
  // Reply". A sent text is NOT "Yes, Contacted" — the CRM handler never runs
  // recordFirstContact, so the lead stays New (no New → Contacted, no Build List).
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

  // Build List START (the "Build List" click). Two things happen: (1) open/focus
  // Smart Apartment Data, and (2) advance the workflow Contacted → Searching on
  // the authenticated CRM. build_list is NOT completed and Send List is NOT
  // created yet — build_list stays the open Next Action and the control flips to
  // "Mark List Built". Prefer an existing SAD tab (host access via the manifest
  // content-script match lets tabs.query filter by URL — no new permission);
  // otherwise open a new one.
  const onBuildList = () => {
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

    // (1) Open/focus SAD.
    const SAD_URL = "https://app.smartapartmentdata.com/";
    const tabs = (globalThis as unknown as { chrome?: any }).chrome?.tabs;
    const windows = (globalThis as unknown as { chrome?: any }).chrome?.windows;
    if (!tabs?.query) {
      window.open(SAD_URL, "_blank");
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
          tabs.create({ url: SAD_URL });
        }
      }
    );
  };

  // Explicit Build List completion → the canonical Contacted → Searching
  // transition runs on the authenticated CRM (completes the build_list row,
  // creates Send List, pins the card to the top of Searching). Opening SAD was
  // only the START; this is the completion.
  const onCompleteBuildList = () => {
    const lead = active?.lead;
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store && lead && lead.id !== undefined && lead.id !== null) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: lead.id,
          verb: "complete-build-list",
        },
      });
    }
  };

  // Send List → open the confirmation sheet. Opens NO SMS/site and changes
  // nothing until the locator confirms "Yes, Sent" (captures the lead identity now
  // so the confirm resolves against THIS lead, not a later active client).
  const onSendList = () => {
    const lead = active?.lead;
    if (!lead || lead.id === undefined || lead.id === null) return;
    setSendListConfirm({ leadId: lead.id, name: formatPersonName(lead.firstName) || "this client" });
  };

  // "Yes, Sent" → the canonical Searching → List Sent transition runs on the
  // authenticated CRM (completes send_list, resets follow-ups, creates the single
  // FU1). Cancel just closes the sheet (handled inline). Uses the captured id.
  const confirmSendList = () => {
    const c = sendListConfirm;
    setSendListConfirm(null);
    if (!c) return;
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: c.leadId,
          verb: "complete-send-list",
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
    const open = (active?.nextActions ?? []).find((a) => !a.completed && isFollowUpAction(a.title));
    if (!open) return;
    const name = formatPersonName(lead.firstName) || "this client";
    launchCommunication("text", lead.phone, buildFollowUpSmsBody(open.title, name));
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

  // "+ Add Task" → open the task sheet for THIS client. Captures the lead id NOW
  // (client-switch guard closes it if the active client changes). Task Time
  // defaults to 9:00 AM (same as Schedule Tour); title + date open blank.
  const onAddTask = () => {
    const lead = active?.lead;
    if (!lead || lead.id === undefined || lead.id === null) return;
    const name = formatPersonName(lead.firstName) || "this client";
    setTaskTitle("");
    setTaskDate("");
    setTaskTime(DEFAULT_TIME_VALUE);
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
    setAddTaskConfirm(null);
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (store) {
      store.set({
        "lb-workflow-verb": {
          nonce: `${Date.now()}-${Math.random()}`,
          leadId: c.leadId,
          verb: "add-task",
          title,
          taskDate,
          taskTime,
        },
      });
    }
    setTaskTitle("");
    setTaskDate("");
    setTaskTime("");
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
          property: currentProperty,
        },
      });
    }
  };
  const onAddRecommendation = () => addCurrentPropertyToCollection("add-recommendation");
  const onAddFavorite = () => addCurrentPropertyToCollection("add-favorite");

  // Move a SAVED row between the two collections without the property being open in
  // SAD. Reuses the same verb bridge and the same CRM handler as the buttons above —
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
        currentProperty={currentProperty}
        onAddRecommendation={onAddRecommendation}
        onAddFavorite={onAddFavorite}
        onMoveToFavorite={onMoveToFavorite}
        onMoveToRecommendation={onMoveToRecommendation}
        onRemoveRecommendation={onRemoveRecommendation}
        onClearCurrentProperty={onClearCurrentProperty}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onContact={onContact}
        onContactLead={onContactLead}
        onBuildList={onBuildList}
        onCompleteBuildList={onCompleteBuildList}
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
        onBackToCrm={onBackToCrm}
        timeZone={active?.timeZone ?? null}
      />

      {pendingContact && (
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
                  Did you send the text to {pendingName}?
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
                  Were you able to contact {pendingName}?
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

      {sendListConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm list sent"
          onClick={() => setSendListConfirm(null)}
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
              Did you send {sendListConfirm.name}'s list?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button type="button" onClick={confirmSendList} style={SHEET_PRIMARY_BTN}>
                Yes, Sent
              </button>
              <button type="button" onClick={() => setSendListConfirm(null)} style={SHEET_CANCEL_BTN}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {followUpConfirm && (
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
            <p style={SHEET_QUESTION_STYLE}>
              Did you send the {formatWorkflowActionLabel(followUpConfirm.title)} text to {followUpConfirm.name}?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button type="button" onClick={confirmFollowUp} style={SHEET_PRIMARY_BTN}>
                Yes, Sent
              </button>
              <button type="button" onClick={() => setFollowUpConfirm(null)} style={SHEET_CANCEL_BTN}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {scheduleTourConfirm && (
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
            <p style={SHEET_QUESTION_STYLE}>Add a task for {addTaskConfirm.name}</p>
            {/* Task title + local date/time. Same Done/Apply time control and
                whole-field native date picker as Schedule Tour. Nothing is saved
                until "Add Task" (title + date + time all required; time pre-filled). */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
              <label style={SHEET_FIELD_LABEL}>
                Task *
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="e.g. Call to confirm budget"
                  autoFocus
                  style={SHEET_INPUT_STYLE}
                />
              </label>
              <label style={SHEET_FIELD_LABEL}>
                Due Date *
                <input
                  type="date"
                  value={taskDate}
                  onChange={(e) => setTaskDate(e.target.value)}
                  onClick={openNativePicker}
                  style={SHEET_INPUT_STYLE}
                />
              </label>
              <label style={SHEET_FIELD_LABEL}>
                Due Time *
                <TourTimeField value={taskTime} onChange={setTaskTime} />
              </label>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                onClick={confirmAddTask}
                disabled={!taskTitle.trim() || !taskDate || !taskTime}
                style={{ ...SHEET_PRIMARY_BTN, ...((!taskTitle.trim() || !taskDate || !taskTime) ? SHEET_BTN_DISABLED : null) }}
              >
                Add Task
              </button>
              <button type="button" onClick={() => setAddTaskConfirm(null)} style={SHEET_CANCEL_BTN}>
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
