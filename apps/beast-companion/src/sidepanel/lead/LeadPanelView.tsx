import { useState } from "react";
import type { LeadSummaryDTO, NextActionDTO } from "@bc/companion-shared";
import { formatWorkflowActionLabel, formatLastActionLabel, isFollowUpAction, isContactFollowUpAction, formatDateDisplay, formatDueDateTime, isPastDue, formatPersonName, formatPhone, formatUnitDisplay } from "@bc/companion-shared";
import { SectionCard, Field, StageBadge, StatusPill, Button } from "./primitives";

/**
 * The loaded lead panel, split so the identity header can stay visible while the
 * hamburger drawer overlays only the body beneath it (see PanelApp).
 *
 * - LeadIdentityHeader — client name, stage, phone, Call/Text. Always visible.
 * - LeadPanelBody — Next Action, Search Criteria, Credit Screening, Invoice
 *   (Closed). This is what the drawer covers.
 *
 * DEMO SAFETY: every control is inert; it only calls onDemo() (a transient note).
 * The expanded-workspace features (AI Assistant, Last Conversation, Favorites,
 * Notes, AI Insights) intentionally stay in Locator Beast.
 */

type OnDemo = (label: string) => void;

// "+ Add Task" is HIDDEN for now (manual tasks deferred). The whole Add Task
// implementation — this button, its onAddTask wiring, the ProductionPanel sheet,
// the add-task verb, createManualTask, and the tests — is PRESERVED intact; this
// flag is the single on/off switch. Set to `true` to show it again.
const SHOW_ADD_TASK = false;

function fullName(l: LeadSummaryDTO) {
  // Display formatting only — the stored first/last name are never modified.
  return [formatPersonName(l.firstName), formatPersonName(l.lastName)].filter(Boolean).join(" ") || "Unnamed Lead";
}

/**
 * Sanitized-preview clock. Today/Tomorrow must be decided on the workspace's
 * calendar days, never on the viewer's machine zone or UTC — so the preview
 * pins one consistent zone (the Phase 3.5 workspace default, America/Chicago).
 * Phase 3.5 replaces this constant with the authoritative user/workspace time
 * zone; the shared formatter already takes a `timeZone`, so only this value
 * changes.
 */
const PREVIEW_TIME_ZONE = "America/Chicago";

/** Next-Action due, via the ONE shared formatter (identical to the CRM). Formats
 *  in the saved locator zone (`tz`), falling back to the workspace default when
 *  the payload didn't carry one. */
function fmtDue(iso: string | null | undefined, tz: string) {
  if (!iso) return "—";
  return formatDueDateTime(iso, { timeZone: tz });
}

/**
 * A saved value is "meaningful" only when it is present and non-blank. This is
 * the single gate for conditional rendering: uncollected fields are omitted
 * entirely — never shown as blank, "$0", a placeholder dash, or "Not specified".
 */
function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return true;
}

/** Compact USD for the read-only Invoice Details rows (mirrors the CRM section). */
function invMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

interface DisplayRow {
  label: string;
  value: string | null | undefined;
}

/**
 * A collapsible field section that renders ONLY the rows with a meaningful
 * saved value, in the caller's canonical order, and hides itself entirely when
 * no row has data. The lead's saved submission is the source of truth — a row
 * shows because THIS lead has that value, independent of whether the field is
 * still enabled on the current SmartLead Form.
 */
function FieldSection({
  title,
  rows,
  shaded,
  defaultOpen,
}: {
  title: string;
  rows: DisplayRow[];
  shaded?: boolean;
  defaultOpen?: boolean;
}) {
  const visible = rows.filter((r) => hasValue(r.value));
  if (visible.length === 0) return null;
  return (
    <SectionCard title={title} shaded={shaded} defaultOpen={defaultOpen}>
      {visible.map((r) => (
        <Field key={r.label} label={r.label} value={r.value} />
      ))}
    </SectionCard>
  );
}

export function LeadIdentityHeader({
  lead,
  onDemo,
  onContact,
  compact = false,
}: {
  lead: LeadSummaryDTO;
  onDemo: OnDemo;
  // Phase 3 (Slice A). When provided (production), Call/Text open sms:/tel: and
  // run the canonical first-contact cascade via the CRM. When omitted (fixtures),
  // they fall back to the inert demo note — the visual design is unchanged.
  onContact?: (method: "call" | "text") => void;
  // Compact mode (Properties tab): show ONLY the client name + stage badge — hide
  // Archive, phone, and Call/Text to reclaim vertical space. The Client tab keeps
  // the full header (compact stays false there). Same component, no duplication.
  compact?: boolean;
}) {
  // Copy-the-phone affordance — mirrors the CRM lead panel exactly: the Copy
  // control is revealed on hover/focus of the phone row (and always shown on
  // touch, where there is no hover), copies the formatted number to the
  // clipboard, then flips to "✓ Copied" for 1500ms. This is a REAL clipboard
  // action (harmless, and what the request asks for) — unlike Call/Text/Archive,
  // which stay inert during the sanitized presentation phase.
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Display value only — the raw `lead.phone` in the DTO is preserved unchanged
  // for future Call/Text (tel:/sms:). Copy copies the formatted number the user sees.
  const phoneDisplay = formatPhone(lead.phone);

  async function copyPhone() {
    if (!lead.phone) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(phoneDisplay);
      } else {
        const ta = document.createElement("textarea");
        ta.value = phoneDisplay;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedPhone(true);
      window.setTimeout(() => setCopiedPhone(false), 1500);
    } catch (err) {
      console.error("Copy phone failed:", err);
    }
  }

  return (
    <header className="lp-header">
      {/* Top row: name + stage together on the left (stage sits immediately
          after the name and wraps gracefully at 360px); Archive on the right.
          The Archive icon lives here — Chrome's native side-panel X is the sole
          close control, so there is no second internal X. */}
      <div className="lp-header-top">
        <div className="lp-id-row">
          <h1 className="lp-name" title={fullName(lead)}>
            {fullName(lead)}
          </h1>
          <StageBadge stage={lead.stage} />
        </div>
        {/* Archive — hidden on the compact Properties header. Inert during the
            sanitized presentation phase; live integration will wire this to the
            SAME authorized archive op the CRM lead card uses. */}
        {!compact && (
          <button
            type="button"
            className="lp-archive"
            onClick={() => onDemo("Archive Lead")}
            aria-label="Archive Lead"
            title="Archive Lead"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="2.5" y="3.5" width="19" height="5" rx="1.2" />
              <path d="M4.5 8.5V19a1.5 1.5 0 001.5 1.5h12a1.5 1.5 0 001.5-1.5V8.5" />
              <path d="M10 12.5h4" />
            </svg>
          </button>
        )}
      </div>

      {/* Phone + Call/Text — hidden on the compact Properties header (reclaims
          vertical space). The Client tab keeps them (compact === false). */}
      {!compact && lead.phone && (
        <div className="lp-phone-row">
          <span className="lp-phone">{phoneDisplay}</span>
          <button
            type="button"
            className={`lp-copy${copiedPhone ? " is-copied" : ""}`}
            onClick={copyPhone}
            aria-label={copiedPhone ? "Phone number copied" : "Copy phone number"}
          >
            {copiedPhone ? "✓ Copied" : "Copy"}
          </button>
        </div>
      )}

      {!compact && (
        <div className="lp-comm-row">
          <Button
            variant="soft"
            full
            onClick={() => (onContact ? onContact("call") : onDemo("Call Client"))}
            ariaLabel="Call Client"
          >
            <span aria-hidden>📞</span> Call Client
          </Button>
          <Button
            variant="soft"
            full
            onClick={() => (onContact ? onContact("text") : onDemo("Text Client"))}
            ariaLabel="Text Client"
          >
            <span aria-hidden>💬</span> Text Client
          </Button>
        </div>
      )}
    </header>
  );
}

export function LeadPanelBody({
  lead,
  nextActions,
  onDemo,
  onContactLead,
  onBuildList,
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
  timeZone,
}: {
  lead: LeadSummaryDTO;
  nextActions: NextActionDTO[];
  onDemo: OnDemo;
  // Saved locator IANA timezone for Due/Completed formatting.
  timeZone?: string | null;
  // Phase 3: the Contact Lead Next Action opens the call/text method chooser
  // (the shared contact bottom sheet). It performs no contact itself.
  onContactLead?: () => void;
  // Clicking the "Build List" Next Action opens the tool chooser (Smart Apartment
  // Data or Locator Beast) and, once a tool is chosen, advances the lead Contacted
  // → Searching. The button always REOPENS the chooser — it never becomes a "Mark
  // List Built" completion. Completion is the separate confirmation below.
  onBuildList?: () => void;
  // Clicking the "Send List" Next Action opens the confirmation sheet ("Did you
  // send the client's list?"). Confirming runs the canonical Searching → List Sent
  // transition (completes send_list, creates FU1). Opens no SMS/site.
  onSendList?: () => void;
  // Clicking a Follow-Up (FU1/FU2/FU3/Final) launches the client's SMS with the
  // matching template, then opens the "Did you send the follow-up?" sheet.
  // Launching SMS does NOT complete the follow-up — confirming does.
  onSendFollowUp?: () => void;
  // Clicking "Schedule Tour" opens the "Did you schedule the tour for {name}?"
  // confirmation sheet. MVP handoff — opening completes nothing; only "Yes,
  // Scheduled" does. (Later this opens the real tour scheduler first.)
  onScheduleTour?: () => void;
  // "Send Guest Card" — opens the reused Guest Card composer (in the CRM tab) for
  // the scheduled property. Omitted in fixtures (falls back to the demo note).
  onSendGuestCard?: () => void;
  // "Tour Follow-Up" — opens the canonical outcome modal in the CRM tab for the
  // surfaced property's tour. "Apply" — opens the application-submitted confirm.
  onTourFollowUp?: () => void;
  onStartApplication?: () => void;
  // "Check Application" — opens the canonical "What's the application status?"
  // outcome modal in the CRM tab for the Top Pick's application.
  onCheckApplication?: () => void;
  // "Confirm Lease" — opens the "did the client sign?" confirm in the CRM tab.
  onConfirmLease?: () => void;
  // "Get Invoice Details" — opens the compact invoice intake in the CRM tab.
  onGetInvoiceDetails?: () => void;
  // "Send Invoice" — opens the invoice email composer in the CRM tab.
  onSendInvoice?: () => void;
  // "Confirm Payment" — opens the "did you receive payment?" confirm in the CRM tab.
  onConfirmPayment?: () => void;
  // "Send Rebate" — opens the "Send Rebate · {Property}" confirm in the CRM tab
  // (Cash Rebate only). The extension has no payment logic of its own.
  onSendRebate?: () => void;
  // "+ Add Task" — opens the custom-task sheet (title + date/time) for THIS
  // client. Omitted in fixtures, where the button falls back to the demo note.
  onAddTask?: () => void;
}) {
  const tz = timeZone ?? PREVIEW_TIME_ZONE;
  const openAction = nextActions.find((a) => !a.completed) ?? null;
  // Status is derived from the DUE TIMESTAMP, never a priority flag — a future
  // due (e.g. Tomorrow) can never read as "Overdue". Overdue = the due instant
  // has already passed; otherwise it is still Pending.
  const overdue = openAction ? isPastDue(openAction.dueAt) : false;
  const sc = lead.searchCriteria;
  const cs = lead.creditScreening;
  // Last Action — the most recently completed workflow action (canonical, from
  // the DTO). Null for a brand-new lead → the row is hidden, never fabricated.
  const lastAction = lead.lastAction ?? null;
  // Property context shown inline on the Last Action line ("Tour Scheduled ·
  // The Foundry"). Sourced from the completed action's OWN snapshot (never
  // fabricated). SAFETY (multi-tour): suppress it when the currently-surfaced
  // Next Action names a DIFFERENT property — so we never imply the last action
  // was on the property the surfaced Guest Card actually belongs to.
  const lastActionProperty =
    lastAction?.propertyName &&
    (!openAction?.propertyName || openAction.propertyName === lastAction.propertyName)
      ? lastAction.propertyName
      : null;

  // Two-state Build List: clicking "Build List" opens the tool chooser (Smart
  // The Build List button always opens the tool chooser (Smart Apartment Data or
  // Locator Beast). Completion is the separate "Was the list sent?" confirmation,
  // and Back-to-CRM lives in the Search Mode header now — so this card no longer
  // tracks a launched/flipped state itself.
  const isBuildList = (openAction?.title ?? "").trim().toLowerCase() === "build list";
  // Contact Lead is a prominent Next Action INDICATOR — the real execution
  // controls are Call/Text Client in the header, so its button performs no
  // ambiguous contact action (no auto call/text choice).
  const isContactLead = (openAction?.title ?? "").trim().toLowerCase() === "contact lead";
  const isSendList = (openAction?.title ?? "").trim().toLowerCase() === "send list";
  // Both the post-List-Sent FU ladder and the pre-list Contact FU chase use the
  // SAME "Send Follow-Up" button + confirmation UX (onSendFollowUp routes to the
  // correct template builder by sequence). No new prompt or placement.
  const isFollowUp = isFollowUpAction(openAction?.title) || isContactFollowUpAction(openAction?.title);
  const isSetupTour = (openAction?.title ?? "").trim().toLowerCase() === "setup tour";
  const isGuestCard = (openAction?.title ?? "").trim().toLowerCase() === "email guest card";
  const isTourFollowUp = (openAction?.title ?? "").trim().toLowerCase() === "tour follow-up";
  const isApply = (openAction?.title ?? "").trim().toLowerCase() === "apply";
  const isCheckApp = (openAction?.title ?? "").trim().toLowerCase() === "check app";
  const isConfirmLease = (openAction?.title ?? "").trim().toLowerCase() === "confirm lease";
  const isGetInvoice = (openAction?.title ?? "").trim().toLowerCase() === "get invoice details";
  const isSendInvoice = (openAction?.title ?? "").trim().toLowerCase() === "send invoice";
  const isConfirmPayment = (openAction?.title ?? "").trim().toLowerCase() === "confirm payment";
  const isSendRebate = (openAction?.title ?? "").trim().toLowerCase() === "send rebate";
  // Renewal Follow-Up (canonical lease_follow_up) is scheduled months out — while it
  // isn't due yet its Status reads "Scheduled" rather than "In Progress"; once the
  // due date arrives the existing overdue handling takes over.
  const isRenewalFollowUp = formatWorkflowActionLabel(openAction?.title ?? "") === "Renewal Follow-Up";
  const scheduled = !!openAction && !overdue && isRenewalFollowUp;

  return (
    <div className="lp-body">
      {/* ── Last Action + Next Action card ──
          "What did I do last?" (Last Action, top) then "what do I do next?"
          (Next Action, below the divider) — mirrors the CRM Lead Panel's approved
          treatment. Last Action is hidden entirely when nothing is completed. */}
      <div className="lp-card">
        {lastAction && (
          <>
            <div className="lp-card-cols">
              <span className="lp-eyebrow">Last Action</span>
            </div>
            {/* Last Action value, with its timestamp stacked directly beneath it
                (not pushed to the far right). Next Action's Status pill layout is
                unchanged. Presentation only — same values. */}
            <div style={{ marginTop: 15 }}>
              <div
                style={{ fontSize: 14, fontWeight: 600, color: "var(--lb-text, #e6ebf5)" }}
                title={`${formatLastActionLabel(lastAction.title)}${lastActionProperty ? ` · ${lastActionProperty}` : ""}`}
              >
                {formatLastActionLabel(lastAction.title)}
                {lastActionProperty && <span className="lp-last-prop"> · {lastActionProperty}</span>}
              </div>
              {lastAction.completedAt && (
                <div className="lp-completed">
                  Completed: <span className="lp-completed-val">{fmtDue(lastAction.completedAt, tz)}</span>
                </div>
              )}
            </div>
            <div
              style={{
                // 18px above the divider (below Last Action); +8px below it so the
                // NEXT ACTION / STATUS row breathes a little more (subtle).
                margin: "18px 0 20px",
                // Same single divider, only slightly stronger so it reads as one
                // card with two sections (not two cards). Thin + subtle.
                borderTop: "1px solid color-mix(in srgb, var(--lb-border, rgba(255,255,255,0.12)) 70%, var(--lb-text-muted, #9aa4b2) 30%)",
              }}
            />
          </>
        )}
        {lead.isOnHold ? (
          /* On Hold — the search is paused (crm_status preserved). Like archived,
             the active Next Action is suppressed; instead we show the hold state +
             follow-up date. Distinct from archived: this is temporary and the lead
             resumes to its stage. Presentation only — no workflow data is mutated;
             Resume/Reschedule happen in the CRM (board Inactive → On Hold / Agenda). */
          <>
            <div className="lp-card-cols">
              <span className="lp-eyebrow">On Hold</span>
            </div>
            <div style={{ marginTop: 15 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--lb-text, #e6ebf5)" }}>
                {lead.holdFollowUpDueAt ? `Follow up · ${fmtDue(lead.holdFollowUpDueAt, tz)}` : "Paused"}
              </div>
            </div>
          </>
        ) : lead.isArchived ? (
          /* Archived leads intentionally have no active Next Action. Replace the
             Next Action / Status / due area with the canonical Archive Reason
             (DTO-provided label from lib/leads/archiveReasons), and render no
             "+ Add Task". Last Action above stays exactly as derived. This is a
             presentation state only — no Next Action/workflow data is mutated. */
          <>
            <div className="lp-card-cols">
              <span className="lp-eyebrow">Archive Reason</span>
            </div>
            <div style={{ marginTop: 15 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--lb-text, #e6ebf5)" }}>
                {lead.archiveReasonLabel ?? "Archived"}
              </div>
            </div>
          </>
        ) : (
          <>
        <div className="lp-card-cols">
          <span className="lp-eyebrow">Next Action</span>
          <span className="lp-eyebrow">Status</span>
        </div>
        {openAction ? (
          <>
            <div className="lp-action-row">
              {isBuildList && onBuildList ? (
                // The Build List button always REOPENS the tool chooser (Smart
                // Apartment Data or Locator Beast) — it never becomes a "Mark List
                // Built" completion. Completion is a separate contextual
                // confirmation ("Was {name}'s list sent?") rendered below, so the
                // locator can reopen/continue building at any time.
                <Button
                  variant="solid"
                  onClick={() => onBuildList()}
                  title="Choose how to build the list — Smart Apartment Data or Locator Beast"
                >
                  {formatWorkflowActionLabel(openAction.title)}
                </Button>
              ) : isContactLead ? (
                // Entry into the shared contact flow: opens the "call or text?"
                // chooser. Performs no contact itself — no auto Call/Text, no
                // stage change, no "coming soon" toast.
                <Button
                  variant="solid"
                  onClick={() => onContactLead?.()}
                  title="Call or text this lead"
                >
                  {formatWorkflowActionLabel(openAction.title)}
                </Button>
              ) : isSendList && onSendList ? (
                // Opens the "Did you send the client's list?" confirmation sheet.
                // Performs nothing itself — no SMS, no site, no stage change until
                // the locator confirms "Yes, Sent".
                <Button
                  variant="solid"
                  onClick={() => onSendList()}
                  title="Mark the list sent — completes Send List and advances to List Sent"
                >
                  {formatWorkflowActionLabel(openAction.title)}
                </Button>
              ) : isFollowUp && onSendFollowUp ? (
                // Launches the client's SMS with the follow-up template, then opens
                // the "Did you send the follow-up?" sheet. Launching SMS does NOT
                // complete the follow-up — confirming does.
                <Button
                  variant="solid"
                  onClick={() => onSendFollowUp()}
                  title="Text this follow-up, then confirm it was sent"
                >
                  {formatWorkflowActionLabel(openAction.title)}
                </Button>
              ) : isSetupTour && onScheduleTour ? (
                // Opens the "Did you schedule the tour for {name}?" confirmation
                // sheet. MVP: no scheduler surface yet, so it opens the confirm
                // directly. Opening completes nothing — only "Yes, Scheduled" does.
                <Button
                  variant="solid"
                  onClick={() => onScheduleTour()}
                  title="Confirm the tour was scheduled"
                >
                  {formatWorkflowActionLabel(openAction.title)}
                </Button>
              ) : isGuestCard && onSendGuestCard ? (
                // Opens the reused Guest Card composer in the CRM tab for THIS
                // scheduled property. Nothing sends until the agent reviews + sends.
                <Button
                  variant="solid"
                  onClick={() => onSendGuestCard()}
                  title="Review and send this property's guest card"
                >
                  {formatWorkflowActionLabel(openAction.title)}
                </Button>
              ) : isTourFollowUp && onTourFollowUp ? (
                // Opens the canonical "How did the tour go?" outcome modal in the
                // CRM tab for THIS property's tour (same workflow as the Workspace).
                <Button
                  variant="solid"
                  onClick={() => onTourFollowUp()}
                  title="Record how this property's tour went"
                >
                  {formatWorkflowActionLabel(openAction.title)}
                </Button>
              ) : isApply && onStartApplication ? (
                // Opens the "did the client submit?" confirmation in the CRM tab.
                <Button
                  variant="solid"
                  onClick={() => onStartApplication()}
                  title="Confirm the client submitted their application"
                >
                  {formatWorkflowActionLabel(openAction.title)}
                </Button>
              ) : isCheckApp && onCheckApplication ? (
                // Opens the canonical "What's the application status?" outcome modal
                // in the CRM tab for the Top Pick's application (same workflow).
                <Button
                  variant="solid"
                  onClick={() => onCheckApplication()}
                  title="Record the application status"
                >
                  {formatWorkflowActionLabel(openAction.title)}
                </Button>
              ) : isConfirmLease && onConfirmLease ? (
                // Opens the "did the client sign their lease?" confirm in the CRM tab
                // for the Top Pick. "Yes, Lease Signed" advances the lead to Closed.
                <Button
                  variant="solid"
                  onClick={() => onConfirmLease()}
                  title="Confirm the client signed their lease"
                >
                  {formatWorkflowActionLabel(openAction.title)}
                </Button>
              ) : isGetInvoice && onGetInvoiceDetails ? (
                // Opens the compact invoice intake in the CRM tab for the Closed
                // lead's Top Pick (same canonical invoice_* fields + completion).
                <Button
                  variant="solid"
                  onClick={() => onGetInvoiceDetails()}
                  title="Collect the lease/commission details for the invoice"
                >
                  {formatWorkflowActionLabel(openAction.title)}
                </Button>
              ) : isSendInvoice && onSendInvoice ? (
                // Opens the invoice email composer in the CRM tab for the Top Pick
                // (prefilled from the saved invoice; confirm sent to complete).
                <Button
                  variant="solid"
                  onClick={() => onSendInvoice()}
                  title="Email the invoice to the property"
                >
                  {formatWorkflowActionLabel(openAction.title)}
                </Button>
              ) : isConfirmPayment && onConfirmPayment ? (
                // Opens the "did you receive the commission payment?" confirm in the
                // CRM tab for the Top Pick. Yes marks Commission Paid.
                <Button
                  variant="solid"
                  onClick={() => onConfirmPayment()}
                  title="Confirm the commission payment was received"
                >
                  {formatWorkflowActionLabel(openAction.title)}
                </Button>
              ) : isSendRebate && onSendRebate ? (
                // Opens the "Send Rebate · {Property}" confirm in the CRM tab for the
                // Top Pick (Cash Rebate only). Mark Rebate Sent completes it.
                <Button
                  variant="solid"
                  onClick={() => onSendRebate()}
                  title="Confirm the client rebate was sent"
                >
                  {formatWorkflowActionLabel(openAction.title)}
                </Button>
              ) : (
                <Button
                  variant="solid"
                  onClick={() => onDemo(formatWorkflowActionLabel(openAction.title))}
                  title={`Open — ${formatWorkflowActionLabel(openAction.title)} (coming soon)`}
                >
                  {formatWorkflowActionLabel(openAction.title)}
                </Button>
              )}
              <StatusPill tone={overdue ? "danger" : scheduled ? "muted" : openAction.statusLabel ? "accent" : "muted"}>
                {overdue ? "Overdue" : scheduled ? "Scheduled" : openAction.statusLabel ?? "In Progress"}
              </StatusPill>
            </div>
            <div className="lp-due">
              Due: <span className="lp-due-val">{fmtDue(openAction.dueAt, tz)}</span>
            </div>
            {/* The old in-card "← Back to CRM" link was removed — Back to CRM now
                lives in the Search Mode header (shown while the active tab is a Smart
                Apartment Data page), so it no longer clutters the Next Action card. */}
          </>
        ) : null}
        {SHOW_ADD_TASK && (
        <div style={{ marginTop: 12 }}>
          <Button variant="dashed" full onClick={() => (onAddTask ? onAddTask() : onDemo("Add Task"))}>
            + Add Task
          </Button>
        </div>
        )}
          </>
        )}
      </div>

      {/* ── Search Criteria ── (canonical order; each row shows only when the
          lead actually has that saved value. Income = the SmartLead Form's
          "Monthly Household Income" range, rendered verbatim (incl. "/ month"),
          directly after Budget.) */}
      <FieldSection
        key={`search-criteria-${lead.id}`}
        title="Search Criteria"
        shaded
        defaultOpen={false}
        rows={[
          { label: sc.interest ? "Interest" : "City", value: sc.interest || sc.city },
          { label: "Budget", value: sc.budgetText },
          { label: "Income", value: sc.income },
          { label: "Property Type", value: sc.propertyType },
          { label: "Beds / Baths", value: sc.beds || sc.baths ? `${sc.beds || "—"} / ${sc.baths || "—"}` : null },
          { label: "Move Date", value: hasValue(sc.moveDate) ? formatDateDisplay(sc.moveDate) : null },
          { label: "Desired Areas", value: sc.desiredAreas },
          { label: "Source", value: sc.source },
        ]}
      />

      {/* ── Credit Screening ── (same rule; whole section hides if the lead has
          no screening data at all) */}
      <FieldSection
        key={`credit-screening-${lead.id}`}
        title="Credit Screening"
        defaultOpen={false}
        rows={[
          { label: "Credit Score", value: cs.creditScore },
          { label: "Credit History", value: cs.creditHistory },
          { label: "Broken Lease", value: hasValue(cs.brokenLeaseAge) ? `${cs.brokenLeaseAge} ago` : null },
          { label: "Eviction", value: hasValue(cs.evictionAge) ? `${cs.evictionAge} ago` : null },
          { label: "Criminal Background", value: cs.criminalBackground },
        ]}
      />

      {/* ── Client Notes ── (read-only, client's form-submitted notes; same
          existing data as the CRM's Client Notes = leads.notes. Locator Notes
          stays in the LB workspace.)
          Rendered ONLY when this lead actually submitted notes — no "No notes
          submitted." placeholder; an uncollected notes field hides the whole
          section. Collapsed by default and keyed by lead id so the state
          persists while THIS client stays active (and across popover open/close,
          since the body never unmounts) but resets for a new client. */}
      {hasValue(lead.clientNotes) && (
        <SectionCard key={`client-notes-${lead.id}`} title="Client Notes" defaultOpen={false}>
          <p className="lp-notes">{lead.clientNotes}</p>
        </SectionCard>
      )}

      {/* ── Invoice Details (Closed only) ── read-only projection of the SAME
          canonical leads.invoice_* data the CRM section shows; only rows with a
          value render (hidden entirely until the agent collects details). */}
      {lead.isClosed && lead.invoice && (
        <FieldSection
          key={`invoice-${lead.id}`}
          title="Invoice Details"
          defaultOpen={false}
          rows={[
            { label: "Contact", value: [lead.invoice.contactName, lead.invoice.contactTitle].filter(Boolean).join(" · ") || null },
            { label: "Property", value: lead.invoice.propertyName },
            { label: "Unit", value: hasValue(lead.invoice.unitNumber) ? formatUnitDisplay(lead.invoice.unitNumber) : null },
            { label: "Lease Start", value: hasValue(lead.invoice.leaseStartDate) ? formatDateDisplay(lead.invoice.leaseStartDate!) : null },
            { label: "Lease Term (Months)", value: lead.invoice.leaseTerm },
            { label: "Base Rent", value: lead.invoice.baseRent != null ? invMoney(lead.invoice.baseRent) : null },
            { label: "Commission", value: lead.invoice.commissionPct != null ? `${lead.invoice.commissionPct}%` : null },
            { label: "Total Invoice", value: lead.invoice.totalInvoice != null ? invMoney(lead.invoice.totalInvoice) : null },
            { label: "Broker Split", value: lead.invoice.brokerSplitPct != null ? `${lead.invoice.brokerSplitPct}%` : null },
            { label: "Expected Commission", value: lead.invoice.expectedCommission != null ? invMoney(lead.invoice.expectedCommission) : null },
            { label: "Client Rebate", value: lead.invoice.rebateType ? `${lead.invoice.rebateType}${lead.invoice.rebateAmount != null ? ` · ${invMoney(lead.invoice.rebateAmount)}` : ""}` : null },
            { label: "Invoice Submitted", value: lead.invoice.submitted ? "Yes" : null },
            { label: "Commission Paid", value: lead.invoice.commissionPaid ? "Yes" : null },
            { label: "Notes", value: lead.invoice.notes },
          ]}
        />
      )}

    </div>
  );
}
