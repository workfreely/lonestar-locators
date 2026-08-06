import type { LeadSummaryDTO, NextActionDTO } from "@bc/companion-shared";
import { formatWorkflowActionLabel, isFollowUpAction } from "@bc/companion-shared";
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
function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function LeadIdentityHeader({ lead, onDemo }: { lead: LeadSummaryDTO; onDemo: OnDemo }) {
  return (
    <header className="lp-header">
      <div className="lp-id-row">
        <h1 className="lp-name" title={fullName(lead)}>
          {fullName(lead)}
        </h1>
        <StageBadge stage={lead.stage} />
      </div>
      {lead.phone && <div className="lp-phone">{lead.phone}</div>}
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
              Due: <span className="lp-due-val">{fmtDateTime(openAction.dueAt)}</span>
            </div>
          </>
        ) : (
          <p className="lp-muted">No open action — add the next step below.</p>
        )}
        <Button variant="dashed" full onClick={() => onDemo("Add Task")}>
          + Add Task
        </Button>
      </div>

      {/* ── Search Criteria ── */}
      <SectionCard title="Search Criteria" shaded defaultOpen>
        <Field label={sc.interest ? "Interest" : "City"} value={sc.interest || sc.city} />
        <Field label="Budget" value={sc.budgetText} />
        <Field label="Property Type" value={sc.propertyType} />
        <Field label="Beds / Baths" value={sc.beds || sc.baths ? `${sc.beds || "—"} / ${sc.baths || "—"}` : null} />
        <Field label="Move Date" value={sc.moveDate} />
        <Field label="Desired Areas" value={sc.desiredAreas} />
        <Field label="Source" value={sc.source} />
      </SectionCard>

      {/* ── Credit Screening ── */}
      <SectionCard title="Credit Screening" defaultOpen>
        <Field label="Credit Score" value={cs.creditScore} />
        <Field label="Credit History" value={cs.creditHistory} />
        {cs.brokenLeaseAge && <Field label="Broken Lease" value={`${cs.brokenLeaseAge} ago`} />}
        {cs.evictionAge && <Field label="Eviction" value={`${cs.evictionAge} ago`} />}
        <Field label="Criminal Background" value={cs.criminalBackground} />
      </SectionCard>

      {/* ── Client Notes ── (read-only, client's form-submitted notes; same
          existing data as the CRM's Client Notes = leads.notes. Locator Notes
          stays in the LB workspace.) */}
      <SectionCard title="Client Notes" defaultOpen>
        <p className={`lp-notes${lead.clientNotes && lead.clientNotes.trim() ? "" : " is-empty"}`}>
          {lead.clientNotes && lead.clientNotes.trim() ? lead.clientNotes : "No notes submitted."}
        </p>
      </SectionCard>

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
