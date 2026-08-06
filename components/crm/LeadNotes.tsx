"use client"

import { supabase } from "@/lib/supabase/client"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"
import { CollapsibleNotes } from "./LeadPanelSections"

// Client Notes (read-only, submitted by the client) + Locator Notes (the
// locator's own editable notes). Moved into the right workspace panel so the
// property + notes workflow lives together beneath the AI Assistant.
export default function LeadNotes({
  lead,
  onUpdateLead,
}: {
  lead: any
  onUpdateLead?: (updatedLead: any) => void
}) {
  return (
    <>
      {/* Client Notes is read-only client-submitted data — show it ONLY when the
          lead actually submitted notes. When empty, the whole section is hidden
          (no "No notes submitted." placeholder), same conditional rule as Search
          Criteria / Credit Screening. Locator Notes below stays always-editable. */}
      {!!(lead.notes && lead.notes.trim()) && (
        <CollapsibleNotes title="Client Notes" defaultOpen storageKey="client-notes">
          {/* Content uses the shared theme tokens (like Search Criteria / Credit
              Screening) so every section reads as one cohesive surface. */}
          <textarea
            value={lead.notes}
            readOnly
            className="w-full h-20 text-[12.5px] bg-[var(--crm-inset)] border border-[var(--crm-border)] rounded-xl px-3 py-2 resize-none cursor-default text-[var(--crm-text-primary)] placeholder-[var(--crm-text-muted)] focus:outline-none"
          />
        </CollapsibleNotes>
      )}

      <CollapsibleNotes title="Locator Notes" defaultOpen={!!(lead.locator_notes && lead.locator_notes.trim())} storageKey="locator-notes">
        <textarea
          value={lead.locator_notes || ""}
          onChange={async (e) => {
            const newNotes = e.target.value
            if (onUpdateLead) onUpdateLead({ ...lead, locator_notes: newNotes })
            // Demo leads: optimistic only — never write to the bigint leads table.
            if (isDemoLeadId(lead.id)) return
            await supabase.from("leads").update({ locator_notes: newNotes }).eq("id", lead.id).select("*")
          }}
          placeholder="Internal notes about this client..."
          className="w-full h-24 text-[12.5px] bg-[var(--crm-inset)] border border-[var(--crm-border)] rounded-xl px-3 py-2 resize-none text-[var(--crm-text-primary)] placeholder-[var(--crm-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--crm-accent)] focus:border-transparent transition-shadow"
        />
      </CollapsibleNotes>
    </>
  )
}
