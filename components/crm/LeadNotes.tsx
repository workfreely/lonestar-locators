"use client"

import { supabase } from "@/lib/supabase/client"
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
      <CollapsibleNotes title="Client Notes" defaultOpen={!!(lead.notes && lead.notes.trim())} storageKey="client-notes">
        {/* Content uses the shared theme tokens (like Search Criteria / Credit
            Screening) so every section reads as one cohesive surface. */}
        <textarea
          value={lead.notes || ""}
          readOnly
          placeholder="No notes submitted."
          className="w-full h-20 text-[12.5px] bg-[var(--crm-inset)] border border-[var(--crm-border)] rounded-xl px-3 py-2 resize-none cursor-default text-[var(--crm-text-primary)] placeholder-[var(--crm-text-muted)] focus:outline-none"
        />
      </CollapsibleNotes>

      <CollapsibleNotes title="Locator Notes" defaultOpen={!!(lead.locator_notes && lead.locator_notes.trim())} storageKey="locator-notes">
        <textarea
          value={lead.locator_notes || ""}
          onChange={async (e) => {
            const newNotes = e.target.value
            if (onUpdateLead) onUpdateLead({ ...lead, locator_notes: newNotes })
            await supabase.from("leads").update({ locator_notes: newNotes }).eq("id", lead.id).select("*")
          }}
          placeholder="Internal notes about this client..."
          className="w-full h-24 text-[12.5px] bg-[var(--crm-inset)] border border-[var(--crm-border)] rounded-xl px-3 py-2 resize-none text-[var(--crm-text-primary)] placeholder-[var(--crm-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--crm-accent)] focus:border-transparent transition-shadow"
        />
      </CollapsibleNotes>
    </>
  )
}
