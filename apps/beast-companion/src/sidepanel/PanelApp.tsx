import { useEffect, useRef, useState } from "react";
import type { LeadSummaryDTO, NextActionDTO, FavoriteDTO, RecommendationDTO, ThemeId } from "@bc/companion-shared";
import type { CurrentProperty } from "@/types";
import { LeadIdentityHeader, LeadPanelBody } from "./lead/LeadPanelView";
import { PanelStateView, type PanelState } from "./lead/PanelStates";
import { ClientPropertiesNav, type CompanionView } from "./ClientPropertiesNav";
import { PropertiesView } from "./properties/PropertiesView";
import { CompanionMenu } from "./menu/CompanionMenu";
import { applyTheme } from "./applyTheme";
import { DISCONNECTED, type CompanionConnection } from "./connection";
import { isThemeId } from "@bc/companion-shared";
import "./lead/panel.css";

// Shared LOCAL canonical theme key (chrome.storage.local) — mirrors the content
// script's CANONICAL_KEY so the CRM and the Companion stay in sync. Stage T2 will
// layer the account preference (profiles.theme) on top of this local canonical.
const THEME_STORE_KEY = "lb-theme";

type MenuMode = "closed" | "popover" | "templates";

/**
 * The Companion's single interface, rendered in the native side panel.
 *
 * Layout: toolbar (hamburger) · identity header (visible when loaded) · body.
 * The hamburger toggles a COMPACT ANCHORED popover beneath it (not a full-height
 * drawer): click opens, click again / outside-click / Escape closes. The client
 * panel + its scroll/section state stay mounted behind the popover. Message
 * Templates opens a dedicated subview — the only view with a back arrow.
 *
 * Chrome's native side-panel X remains the sole close for the whole Companion.
 */
export function PanelApp({
  state = "no-client",
  lead,
  nextActions = [],
  favorites = [],
  recommendations = [],
  currentProperty = null,
  onAddRecommendation,
  onAddFavorite,
  onMoveToFavorite,
  onMoveToRecommendation,
  connection = DISCONNECTED,
  onConnect,
  onDisconnect,
  onContact,
  onContactLead,
  onBuildList,
  onCompleteBuildList,
  onSendList,
  onSendFollowUp,
  onScheduleTour,
  onSendGuestCard,
  onTourFollowUp,
  onStartApplication,
  onCheckApplication,
  onConfirmLease,
  onGetInvoiceDetails,
  onSendInvoice,
  onConfirmPayment,
  onSendRebate,
  onAddTask,
  onBackToCrm,
  timeZone,
}: {
  state?: PanelState;
  lead?: LeadSummaryDTO | null;
  nextActions?: NextActionDTO[];
  // THIS active client's saved Favorite Properties (lead_favorites), already in the
  // active-client payload. Read-only; rendered in the Properties view. Never mutated.
  favorites?: FavoriteDTO[];
  // THIS active client's canonical Recommended Properties (lead_recommendations),
  // in the active-client payload. Read-only; rendered in the Properties view.
  recommendations?: RecommendationDTO[];
  // The Smart Apartment Data property currently being viewed (page context, from a
  // separate storage key). Independent of the active client. Null when not on a
  // property-detail page. Read-only display in the Properties view.
  currentProperty?: CurrentProperty | null;
  // Add the detected Current Property to the ACTIVE client's canonical collection
  // (via the Companion → CRM verb bridge). Omitted in fixtures.
  onAddRecommendation?: () => void;
  onAddFavorite?: () => void;
  // Move a SAVED row between the two collections (compact per-row controls).
  onMoveToFavorite?: (propertyUrl?: string | null) => void;
  onMoveToRecommendation?: (propertyUrl?: string | null) => void;
  // Connection is derived from the SW's authenticated state. Production defaults
  // to DISCONNECTED — the panel is authenticated ONLY when this is "connected".
  connection?: CompanionConnection;
  onConnect?: () => void;
  onDisconnect?: () => void;
  // Phase 3 (Slice A) — real Call/Text. Opens sms:/tel: and requests the
  // canonical first-contact cascade via the CRM. Omitted in the dev harness
  // (fixtures), where Call/Text fall back to the inert demo note.
  onContact?: (method: "call" | "text") => void;
  // Phase 3 — the Contact Lead Next Action opens the call/text method chooser
  // (same bottom sheet, "choose-method" phase).
  onContactLead?: () => void;
  // Phase 3 — clicking the "Build List" Next Action opens Smart Apartment Data.
  onBuildList?: () => void;
  // Phase 3 — explicit Build List completion (the "Mark List Built ✓" state).
  onCompleteBuildList?: () => void;
  // Phase 3 — clicking the "Send List" Next Action opens the confirmation sheet.
  onSendList?: () => void;
  // Phase 3 — clicking a Follow-Up launches SMS then opens the confirmation sheet.
  onSendFollowUp?: () => void;
  // Clicking "Schedule Tour" opens the tour-scheduled confirmation sheet (MVP).
  onScheduleTour?: () => void;
  // "Send Guest Card" opens the reused Guest Card composer in the CRM tab.
  onSendGuestCard?: () => void;
  // "Tour Follow-Up" / "Apply" open the canonical CRM outcome / confirm surfaces.
  onTourFollowUp?: () => void;
  onStartApplication?: () => void;
  // "Check Application" opens the canonical CRM application-status outcome modal.
  onCheckApplication?: () => void;
  // "Confirm Lease" opens the CRM "did the client sign?" confirmation.
  onConfirmLease?: () => void;
  // "Get Invoice Details" opens the CRM compact invoice intake.
  onGetInvoiceDetails?: () => void;
  // "Send Invoice" opens the CRM invoice email composer.
  onSendInvoice?: () => void;
  // "Confirm Payment" opens the CRM "did you receive payment?" confirmation.
  onConfirmPayment?: () => void;
  // "Send Rebate" opens the CRM "Send Rebate · {Property}" confirmation (Cash Rebate).
  onSendRebate?: () => void;
  // "+ Add Task" opens the custom-task sheet (title + date/time). Omitted in the
  // dev harness (fixtures), where the button falls back to the inert demo note.
  onAddTask?: () => void;
  // Phase 3 — focus the existing CRM tab from the list-building workflow.
  onBackToCrm?: () => void;
  // Saved locator IANA timezone for Due/Completed formatting (falls back inside
  // LeadPanelBody to the workspace default when absent).
  timeZone?: string | null;
}) {
  const [menu, setMenu] = useState<MenuMode>("closed");
  // Top-level Companion view. Client is the default and shows the existing,
  // unchanged Client experience; Properties shows the Phase-1 visual shell.
  const [activeView, setActiveView] = useState<CompanionView>("client");

  // ── Board → Map: default this panel to Properties ─────────────────────────
  // Map mode is a property-research context, so Current Property, Recommendations
  // and (later) Beast Suggestions are what the agent wants in front of them. This
  // reuses `activeView` above — the SAME tab state the nav drives — so there is no
  // separate Property Explorer tab state to keep in sync.
  //
  // Contextual default, not a lock:
  //   • only a NEW counter value acts, so map rerenders, "Search this area",
  //     pin hover and pin clicks (none of which post a message) change nothing;
  //   • switching back to Client afterwards sticks — the counter does not move
  //     again until the agent leaves Map and returns;
  //   • Map → Board posts nothing, so Client is never forced back;
  //   • the value seen at MOUNT is recorded without acting, so opening the panel
  //     while already in Map does not yank it off the tab the agent chose.
  useEffect(() => {
    const store = chrome?.storage?.local;
    if (!store) return; // dev harness (no extension APIs)
    const KEY = "lb-map-entered";
    let lastSeen: number | null = null;
    store.get(KEY, (res) => {
      lastSeen = typeof res[KEY] === "number" ? (res[KEY] as number) : 0;
    });
    function onChanged(changes: { [key: string]: chrome.storage.StorageChange }, area: string) {
      if (area !== "local" || !changes[KEY]) return;
      const next = changes[KEY].newValue;
      if (typeof next !== "number") return;
      // Until the mount read lands, adopt the value rather than acting on it —
      // otherwise a change arriving in that window would look like a transition.
      if (lastSeen === null) { lastSeen = next; return; }
      if (next === lastSeen) return;
      lastSeen = next;
      setActiveView("properties");
    }
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);
  const [demoNote, setDemoNote] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeId>("midnight");
  const noteTimer = useRef<number | undefined>(undefined);

  function onDemo(label: string) {
    // Neutral "coming soon" copy — a control that isn't wired yet (Add Task, AI
    // Voice, etc.) must never imply the LEAD is a demo. Real leads are fully
    // real; these controls are simply not implemented in this phase.
    setDemoNote(`“${label}” — coming soon`);
    if (noteTimer.current) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setDemoNote(null), 2200);
  }
  function pickTheme(id: ThemeId) {
    const applied = applyTheme(id);
    setTheme(applied);
    // Persist to the shared local canonical so it survives close/reopen and the
    // CRM bridge picks it up. chrome is undefined in the dev harness — no-op there.
    chrome?.storage?.local?.set({ [THEME_STORE_KEY]: applied });
  }

  // Load the persisted theme on mount and react to canonical changes coming from
  // the CRM (via the content-script bridge) or another surface. Compare-before-
  // apply against the DOM attribute so an unchanged value never re-applies/loops.
  useEffect(() => {
    const store = chrome?.storage?.local;
    if (!store) return; // dev harness (no extension APIs) — theme stays in-memory
    store.get(THEME_STORE_KEY, (res) => {
      const t = res[THEME_STORE_KEY];
      if (isThemeId(t) && document.documentElement.getAttribute("data-lb-theme") !== t) {
        setTheme(applyTheme(t));
      }
    });
    function onChanged(changes: { [key: string]: chrome.storage.StorageChange }, area: string) {
      if (area !== "local" || !changes[THEME_STORE_KEY]) return;
      const t = changes[THEME_STORE_KEY].newValue;
      if (isThemeId(t) && document.documentElement.getAttribute("data-lb-theme") !== t) {
        setTheme(applyTheme(t));
      }
    }
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  // Escape closes the menu (popover or subview).
  useEffect(() => {
    if (menu === "closed") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu("closed");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const connected = connection.status === "connected";
  // The lead panel is authenticated data — only shown when truly connected.
  const isLoaded = connected && state === "loaded" && !!lead;
  const handleConnect = () => onConnect?.();
  const handleDisconnect = () => onDisconnect?.();

  return (
    <div className="bc-panel">
      {/* Compact dark toolbar — hamburger is the menu toggle. */}
      <header className="bc-toolbar">
        <button
          type="button"
          className="bc-icon-btn"
          onClick={() => setMenu((m) => (m === "closed" ? "popover" : "closed"))}
          aria-haspopup="menu"
          aria-expanded={menu === "popover"}
          aria-label={menu === "closed" ? "Open menu" : "Close menu"}
          title="Menu"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* Client / Properties navigation — directly below the hamburger, directly
          above the client identity. Shown only when a client is loaded. */}
      {isLoaded && <ClientPropertiesNav active={activeView} onChange={setActiveView} />}

      {/* Client identity — the SAME header for both views; on Properties it renders
          COMPACT (name + stage only) to reclaim vertical space. Client tab is full. */}
      {isLoaded && (
        <LeadIdentityHeader
          lead={lead!}
          onDemo={onDemo}
          onContact={onContact}
          compact={activeView === "properties"}
        />
      )}

      {/* Body — stays mounted behind the menu, so scroll + section state persist. */}
      <div className="bc-below">
        <div className="bc-below-scroll">
          {!connected ? (
            // Pre-authenticated: never show lead data. Explain the user must connect.
            <PanelStateView
              state={connection.status === "connecting" ? "connecting" : "not-connected"}
              onConnect={handleConnect}
            />
          ) : isLoaded ? (
            activeView === "client" ? (
              <LeadPanelBody
                lead={lead!}
                nextActions={nextActions}
                onDemo={onDemo}
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
                timeZone={timeZone}
              />
            ) : (
              <PropertiesView
                lead={lead!}
                favorites={favorites}
                recommendations={recommendations}
                currentProperty={currentProperty}
                onAddRecommendation={onAddRecommendation}
                onAddFavorite={onAddFavorite}
                onMoveToFavorite={onMoveToFavorite}
                onMoveToRecommendation={onMoveToRecommendation}
              />
            )
          ) : (
            <PanelStateView state={state === "loaded" ? "no-client" : state} onConnect={handleConnect} />
          )}
        </div>
      </div>

      {menu !== "closed" && (
        <CompanionMenu
          mode={menu}
          onClose={() => setMenu("closed")}
          onOpenTemplates={() => setMenu("templates")}
          onBack={() => setMenu("closed")}
          onDemo={onDemo}
          theme={theme}
          onPickTheme={pickTheme}
          connection={connection}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
        />
      )}

      {demoNote && (
        <div className="lp-demo-toast" role="status">
          {demoNote}
        </div>
      )}
    </div>
  );
}
