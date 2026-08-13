import { useEffect, useState, type CSSProperties } from "react";
import type { LeadSummaryDTO, NextActionDTO } from "@bc/companion-shared";
import { formatPersonName, buildIntroSmsBody, buildFollowUpSmsBody, isFollowUpAction, formatWorkflowActionLabel } from "@bc/companion-shared";
import { PanelApp } from "./PanelApp";
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
  agentName?: string | null;
  // Saved locator IANA timezone — Companion formats Due/Completed times in this
  // zone so it matches the CRM regardless of the device's zone.
  timeZone?: string | null;
};

const ACTIVE_CLIENT_KEY = "lb-active-client";

function isActivePayload(v: unknown): v is ActiveClientPayload {
  const p = v as ActiveClientPayload | null | undefined;
  return !!p && !!p.lead && p.lead.id !== undefined && p.lead.id !== null;
}

export function ProductionPanel() {
  const [connection, setConnection] = useState<CompanionConnection>(DISCONNECTED);
  const [active, setActive] = useState<ActiveClientPayload | null>(null);
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

  // ── Active client from the CRM bridge (Phase 2, read-only) ────────────────
  useEffect(() => {
    const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
    if (!store) return;

    try {
      store.get(ACTIVE_CLIENT_KEY, (res: Record<string, unknown>) => {
        const p = res?.[ACTIVE_CLIENT_KEY];
        setActive(isActivePayload(p) ? p : null);
      });
    } catch {
      /* storage unavailable — no active client */
    }

    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== "local" || !changes[ACTIVE_CLIENT_KEY]) return;
      const next = changes[ACTIVE_CLIENT_KEY].newValue;
      setActive(isActivePayload(next) ? next : null);
    };
    const sc = (globalThis as unknown as { chrome?: any }).chrome?.storage?.onChanged;
    sc?.addListener(onChanged);
    return () => sc?.removeListener(onChanged);
  }, []);

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

  // The confirmation name comes from the CAPTURED pending contact, so it never
  // changes when the active client switches (Bug 2).
  // ← Back to CRM — focus the EXISTING Locator Beast CRM tab (the one hosting the
  // active-client bridge, which must already be open). Navigation only: never
  // opens a duplicate, never changes the active client, and never completes or
  // advances any workflow. Platform-agnostic — this is about the CRM, not
  // whichever list-building platform is configured.
  const onBackToCrm = () => focusExistingCrmTab();

  const pendingName = pendingContact?.name ?? "this client";

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <PanelApp
        connection={effectiveConnection}
        state={active ? "loaded" : "no-client"}
        lead={active?.lead ?? null}
        nextActions={active?.nextActions ?? []}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onContact={onContact}
        onContactLead={onContactLead}
        onBuildList={onBuildList}
        onCompleteBuildList={onCompleteBuildList}
        onSendList={onSendList}
        onSendFollowUp={onSendFollowUp}
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

const CRM_TAB_URL_PATTERNS = [
  "*://locatorbeast.com/admin/*",
  "*://www.locatorbeast.com/admin/*",
  "http://localhost:3000/admin/*",
  "http://127.0.0.1:3000/admin/*",
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
// that supplied the active client), including localhost dev. FALLBACK (that tab is
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
