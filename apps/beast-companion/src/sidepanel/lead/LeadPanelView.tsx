import { useState } from "react";
import type { LeadSummaryDTO, NextActionDTO } from "@bc/companion-shared";
import { formatWorkflowActionLabel } from "@bc/companion-shared";
import { SectionCard, Field, StageBadge, StatusPill, Button } from "./primitives";

/**
 * The loaded lead panel (Phase 3, demo-only). Reproduces the narrow CRM lead
 * panel's sections from the Phase 1 audit — client identity + actions, Next
 * Action, Search Criteria, Credit Screening, Invoice Details (Closed), Quick
 * Actions. The expanded-workspace features (AI Assistant, Last Conversation,
 * Favorite Properties, Notes, AI Insights) intentionally stay in Locator Beast.
 *
 * DEMO SAFETY: every control is inert here. Call/Text/Add Task/Next Action never
 * open tel:/sms:, make no network calls, and persist nothing — they only surface
 * a transient "demo" note so the affordance is visible without acting.
 */

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

export function LeadPanelView({
  lead,
  nextActions,
}: {
  lead: LeadSummaryDTO;
  nextActions: NextActionDTO[];
}) {
  const [demoNote, setDemoNote] = useState<string | null>(null);
  function demo(label: string) {
    setDemoNote(`Demo preview — “${label}” is inactive`);
    window.clearTimeout((demo as any)._t);
    (demo as any)._t = window.setTimeout(() => setDemoNote(null), 2200);
  }

  const openAction = nextActions.find((a) => !a.completed) ?? null;
  const sc = lead.searchCriteria;
  const cs = lead.creditScreening;

  return (
    <div className="lp-root">
      {/* ── Identity + actions (stays near the top) ── */}
      <header className="lp-header">
        <div className="lp-id-row">
          <h1 className="lp-name" title={fullName(lead)}>
            {fullName(lead)}
          </h1>
          <StageBadge stage={lead.stage} />
        </div>
        {lead.phone && <div className="lp-phone">{lead.phone}</div>}
        <div className="lp-comm-row">
          <Button variant="soft" full onClick={() => demo("Call Client")} ariaLabel="Call Client (demo)">
            <span aria-hidden>📞</span> Call Client
          </Button>
          <Button variant="soft" full onClick={() => demo("Text Client")} ariaLabel="Text Client (demo)">
            <span aria-hidden>💬</span> Text Client
          </Button>
        </div>
      </header>

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
                  onClick={() => demo(formatWorkflowActionLabel(openAction.title))}
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
          <Button variant="dashed" full onClick={() => demo("Add Task")}>
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

        {/* ── Invoice Details (Closed only) ── */}
        {lead.isClosed && (
          <SectionCard title="Invoice Details" defaultOpen={false}>
            <p className="lp-muted">
              Post-close lease &amp; commission record. (Demo — fields load from Locator Beast in a later phase.)
            </p>
          </SectionCard>
        )}

        {/* ── Quick Actions ── */}
        <SectionCard title="Quick Actions" defaultOpen={false}>
          <div className="lp-grid-2">
            <Button variant="solid" onClick={() => demo("Contact Lead")}>
              Contact Lead
            </Button>
            <Button variant="ghost" onClick={() => demo("Text Top 3")}>
              Text Top 3
            </Button>
            <Button variant="ghost" onClick={() => demo("List Sent")}>
              List Sent
            </Button>
            <Button variant="ghost" onClick={() => demo("AI Voice Script")}>
              AI Voice Script
            </Button>
          </div>
          <div className="lp-fu-row">
            <span className="lp-fu-label">Follow Up</span>
            {/* Verified ultra-compact inline row → compact "FU{n}" with the full
                phrase in title + aria-label. */}
            {[1, 2, 3].map((n) => (
              <Button
                key={n}
                variant="ghost"
                onClick={() => demo(`Follow-Up ${n}`)}
                title={`Follow-Up ${n}`}
                ariaLabel={`Follow-Up ${n}`}
              >
                FU{n}
              </Button>
            ))}
            <Button
              variant="ghost"
              onClick={() => demo("Final Follow-Up")}
              title="Final Follow-Up"
              ariaLabel="Final Follow-Up"
            >
              Final
            </Button>
          </div>
        </SectionCard>
      </div>

      {/* Inert-demo affordance note */}
      {demoNote && (
        <div className="lp-demo-toast" role="status">
          {demoNote}
        </div>
      )}
    </div>
  );
}
