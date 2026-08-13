"use client"

import { useState } from "react"
import { SectionCard } from "./LeadPanelSections"
import AiVoiceScriptModal from "./AiVoiceScriptModal"
import { formatPersonName } from "@bc/companion-shared"

// Canonical, shared person-name display formatter — same one the Lead Panel /
// Agenda / Companion use, so the composed message reads identically everywhere.
const normalizeName = formatPersonName

// Phase 1 — center selected-client workspace comms tools.
//
// These are the property/AI comms tools approved for the center canvas:
//   • Text Top 3  — opens sms: with the top-3 property matches (same message
//     format as the Lead Panel; uses topMatches from LeadInsights).
//   • AI Voice Script — reuses the existing AiVoiceScriptModal verbatim.
//
// Neither has any CRM workflow side effect (no stage/Next-Action/follow-up
// writes), so surfacing them here changes no automation. LeadPanel keeps its own
// copies as the temporary fallback until Phase 5 (harmless duplication of two
// side-effect-free controls). Nothing here touches Supabase.
export default function ClientWorkspaceTools({
  lead,
  topMatches = [],
  locatorName = "",
}: {
  lead: any
  topMatches?: any[]
  locatorName?: string
}) {
  const [showVoiceScript, setShowVoiceScript] = useState(false)

  function textTop3() {
    const name = normalizeName(lead.first_name || "")
    const message = `Hey ${name}, I found 3 excellent options for you!\n\n${topMatches
      .slice(0, 3)
      .map((p, i) => {
        const url = p.website?.startsWith("http") ? p.website : `https://${p.website || ""}`
        return `${i + 1}. ${p.name}\n${url}`
      })
      .join("\n\n")}\n\nWhich one do you like most?`
    if (lead.phone) window.open(`sms:${lead.phone}?&body=${encodeURIComponent(message)}`, "_self")
  }

  const btnCls =
    "text-xs font-medium px-3 py-2 rounded-lg border bg-[var(--crm-panel)] text-[var(--crm-text-secondary)] border-[var(--crm-border)] hover:bg-[var(--crm-card)] hover:border-[var(--crm-text-muted)] transition-colors"

  return (
    <>
      <SectionCard title="Client Tools" collapsible defaultOpen={true} storageKey="client-workspace-tools">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={textTop3} className={btnCls}>
            Text Top 3
          </button>
          <button type="button" onClick={() => setShowVoiceScript(true)} className={btnCls}>
            AI Voice Script
          </button>
        </div>
      </SectionCard>

      <AiVoiceScriptModal
        open={showVoiceScript}
        onClose={() => setShowVoiceScript(false)}
        lead={lead}
        topMatches={topMatches}
        locatorName={locatorName}
      />
    </>
  )
}
