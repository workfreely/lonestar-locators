import { useState } from "react";
import type { LeadSummaryDTO, NextActionDTO } from "@bc/companion-shared";
import { formatWorkflowActionLabel, isFollowUpAction, formatDateDisplay, formatDueDateTime } from "@bc/companion-shared";
import { SectionCard, Field, StageBadge, StatusPill, Button } from "./primitives";

/**
 * The loaded lead panel, split so the identity header can stay visible while the
 * hamburger drawer overlays only the body beneath it (see PanelApp).
 *
 * - LeadIdentityHeader — client name, stage, phone, Call/Text. Always visible.
 * - LeadPanelBody — Next Action, Search Criteria, Credit Screening, Invoice
 *   (Closed), Messaging Tools. This is what the drawer covers.
 *
 * DEMO SAFETY: every control is inert; it only calls onDemo() (a transient note).
 * The expanded-workspace features (AI Assistant, Last Conversation, Favorites,
 * Notes, AI Insights) intentionally stay in Locator Beast.
 */

type OnDemo = (label: string) => void;

function fullName(l: LeadSummaryDTO) {
  return [l.firstName, l.lastName].filter(Boolean).join(" ") || "Unnamed Lead";
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

/** Next-Action due, via the ONE shared formatter (identical to the CRM). */
function fmtDue(iso?: string | null) {
  if (!iso) return "—";
  return formatDueDateTime(iso, { timeZone: PREVIEW_TIME_ZONE });
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

export function LeadIdentityHeader({ lead, onDemo }: { lead: LeadSummaryDTO; onDemo: OnDemo }) {
  // Copy-the-phone affordance — mirrors the CRM lead panel exactly: the Copy
  // control is revealed on hover/focus of the phone row (and always shown on
  // touch, where there is no hover), copies the formatted number to the
  // clipboard, then flips to "✓ Copied" for 1500ms. This is a REAL clipboard
  // action (harmless, and what the request asks for) — unlike Call/Text/Archive,
  // which stay inert during the sanitized presentation phase.
  const [copiedPhone, setCopiedPhone] = useState(false);

  async function copyPhone() {
    if (!lead.phone) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(lead.phone);
      } else {
        const ta = document.createElement("textarea");
        ta.value = lead.phone;
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
        {/* Inert during the sanitized presentation phase — no state change, no
            API, no simulated archive. Live integration will wire this to the
            SAME authorized archive op the CRM lead card uses. */}
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
      </div>

      {lead.phone && (
        <div className="lp-phone-row">
          <span className="lp-phone">{lead.phone}</span>
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

      <div className="lp-comm-row">
        <Button variant="soft" full onClick={() => onDemo("Call Client")} ariaLabel="Call Client (demo)">
          <span aria-hidden>📞</span> Call Client
        </Button>
        <Button variant="soft" full onClick={() => onDemo("Text Client")} ariaLabel="Text Client (demo)">
          <span aria-hidden>💬</span> Text Client
        </Button>
      </div>
    </header>
  );
}

export function LeadPanelBody({
  lead,
  nextActions,
  onDemo,
}: {
  lead: LeadSummaryDTO;
  nextActions: NextActionDTO[];
  onDemo: OnDemo;
}) {
  const openAction = nextActions.find((a) => !a.completed) ?? null;
  const sc = lead.searchCriteria;
  const cs = lead.creditScreening;

  return (
    <div className="lp-body">
      {/* ── Next Action card ── */}
      <div className="lp-card">
        <div className="lp-card-cols">
          <span className="lp-eyebrow">Next Action</span>
          <span className="lp-eyebrow">Status</span>
        </div>
        {openAction ? (
          <>
            <div className="lp-action-row">
              <Button
                variant="solid"
                onClick={() => onDemo(formatWorkflowActionLabel(openAction.title))}
                title={`Open — ${formatWorkflowActionLabel(openAction.title)} (demo)`}
              >
                {formatWorkflowActionLabel(openAction.title)}
              </Button>
              <StatusPill tone={lead.workflow.followUpCount > 0 ? "accent" : "muted"}>
                {openAction.priority === "high" ? "Overdue" : "Pending"}
              </StatusPill>
            </div>
            {openAction.propertyName && <div className="lp-action-prop">{openAction.propertyName}</div>}
            <div className="lp-due">
              Due: <span className="lp-due-val">{fmtDue(openAction.dueAt)}</span>
            </div>
          </>
        ) : (
          <p className="lp-muted">No open action — add the next step below.</p>
        )}
        <Button variant="dashed" full onClick={() => onDemo("Add Task")}>
          + Add Task
        </Button>
      </div>

      {/* ── Search Criteria ── (canonical order; each row shows only when the
          lead actually has that saved value. Income = the SmartLead Form's
          "Monthly Household Income" range, rendered verbatim (incl. "/ month"),
          directly after Budget.) */}
      <FieldSection
        title="Search Criteria"
        shaded
        defaultOpen
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
        title="Credit Screening"
        defaultOpen
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

      {/* ── Invoice Details (Closed only) ── */}
      {lead.isClosed && (
        <SectionCard title="Invoice Details" defaultOpen={false}>
          <p className="lp-muted">
            Post-close lease &amp; commission record. (Demo — fields load from Locator Beast in a later phase.)
          </p>
        </SectionCard>
      )}

      {/* ── Messaging Tools ── */}
      <SectionCard title="Messaging Tools" defaultOpen={false}>
        <div className="lp-grid-2">
          <Button variant="ghost" onClick={() => onDemo("Text Top 3")}>
            Text Top 3
          </Button>
          <Button variant="ghost" onClick={() => onDemo("AI Voice Script")}>
            AI Voice Script
          </Button>
        </div>
        {openAction && isFollowUpAction(openAction.title) && (
          <div style={{ marginTop: "10px" }}>
            <Button
              variant="ghost"
              full
              onClick={() => onDemo(`Send ${formatWorkflowActionLabel(openAction.title)}`)}
              title={`Send ${formatWorkflowActionLabel(openAction.title)} (template coming soon)`}
            >
              Send {formatWorkflowActionLabel(openAction.title)}
            </Button>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
