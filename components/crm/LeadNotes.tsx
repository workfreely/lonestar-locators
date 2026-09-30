"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"
import { TOUR_TYPE_LABELS, TOUR_WINDOW_LABELS, type TourType, type TourWindow } from "@bc/companion-shared"
import { CollapsibleNotes } from "./LeadPanelSections"

// Operational (not a history log): the client's CURRENT submitted tour availability,
// read from the existing client_tour_availability store via the lead's shares. Shown
// only when availability exists. It never writes into the free-form Locator Notes.
type ClientAvailability = { tour_type: TourType | null; dates: { date: string; windows: TourWindow[] }[] }

function TourAvailabilitySection({ leadId }: { leadId: number | string }) {
  const [av, setAv] = useState<ClientAvailability | null>(null)
  useEffect(() => {
    if (isDemoLeadId(leadId)) return
    let cancelled = false
    ;(async () => {
      // Latest availability across this lead's shares (RLS-scoped to the workspace).
      const { data } = await supabase
        .from("client_tour_availability")
        .select("tour_type, dates, updated_at, client_recommendation_shares!inner(lead_id)")
        .eq("client_recommendation_shares.lead_id", leadId)
        .order("updated_at", { ascending: false })
        .limit(1)
      if (cancelled) return
      const row = (Array.isArray(data) ? data[0] : null) as { tour_type: TourType | null; dates: unknown } | null
      if (row) setAv({ tour_type: row.tour_type, dates: Array.isArray(row.dates) ? (row.dates as ClientAvailability["dates"]) : [] })
    })()
    return () => { cancelled = true }
  }, [leadId])

  if (!av || av.dates.length === 0) return null // no submission → no section

  const fmtDate = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })

  // Display formatting only: specific time window(s) first, "Flexible" last; if
  // Flexible is the only value, just "Flexible". Stored data/selection is unchanged.
  const fmtWindows = (ws: TourWindow[]) => {
    const specific = ws.filter((w) => w !== "flexible")
    const ordered = ws.includes("flexible") ? [...specific, "flexible" as TourWindow] : specific
    return ordered.map((w) => TOUR_WINDOW_LABELS[w]).join(" · ")
  }

  return (
    <CollapsibleNotes title="Tour Availability" defaultOpen storageKey="tour-availability">
      <div className="text-[12.5px] leading-relaxed text-[var(--crm-text-primary)]">
        {av.tour_type && <div className="font-semibold mb-1">{TOUR_TYPE_LABELS[av.tour_type]}</div>}
        <div className="space-y-0.5">
          {av.dates.map((d) => (
            <div key={d.date} className="flex items-baseline justify-between gap-3">
              <span>{fmtDate(d.date)}</span>
              <span className="text-[var(--crm-text-muted)]">{fmtWindows(d.windows)}</span>
            </div>
          ))}
        </div>
      </div>
    </CollapsibleNotes>
  )
}

// Client Notes (read-only, submitted by the client) + Locator Notes (the
// locator's own editable notes). Moved into the right workspace panel so the
// property + notes workflow lives together beneath the AI Assistant.
export default function LeadNotes({
  lead,
  onUpdateLead,
  // UI-placement only: Client Notes belong to Beast Companion (core client
  // context), so the center workspace hides them. The read-only Client Notes
  // code + data are untouched — this just controls whether the section renders.
  showClientNotes = true,
}: {
  lead: any
  onUpdateLead?: (updatedLead: any) => void
  showClientNotes?: boolean
}) {
  return (
    <>
      {/* Client Notes is read-only client-submitted data — show it ONLY when the
          lead actually submitted notes. When empty, the whole section is hidden
          (no "No notes submitted." placeholder), same conditional rule as Search
          Criteria / Credit Screening. Locator Notes below stays always-editable. */}
      {showClientNotes && !!(lead.notes && lead.notes.trim()) && (
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

      {/* Operational Tour Availability — directly above Locator Notes; separate from
          the editable Locator Notes text. Renders nothing when no availability exists. */}
      <TourAvailabilitySection leadId={lead.id} />

      <CollapsibleNotes title="Locator Notes" defaultOpen={!!(lead.locator_notes && lead.locator_notes.trim())} storageKey="locator-notes">
        <AutoGrowTextarea
          value={lead.locator_notes || ""}
          onChange={async (newNotes) => {
            if (onUpdateLead) onUpdateLead({ ...lead, locator_notes: newNotes })
            // Demo leads: optimistic only — never write to the bigint leads table.
            if (isDemoLeadId(lead.id)) return
            await supabase.from("leads").update({ locator_notes: newNotes }).eq("id", lead.id).select("*")
          }}
          placeholder="Internal notes about this client..."
        />
      </CollapsibleNotes>
    </>
  )
}


/**
 * Locator Notes input — grows with the note instead of trapping a long one in a
 * fixed 96px box.
 *
 * A real client note runs to dozens of lines (per-property commute, amenities,
 * pricing), which was previously readable only by scrolling a six-line window.
 *
 *   • auto-grows from MIN to MAX as the text gets longer
 *   • past MAX it stops growing and scrolls internally, so the panel stays usable
 *   • `resize-y` still allows a manual drag on the bottom edge, and a manual drag
 *     WINS — once the locator sizes it themselves, typing no longer re-clamps it.
 *     Detected by comparing the element's height against the last height we set.
 *
 * Width, colours, radius, focus ring and the surrounding panel are unchanged; only
 * the height behaviour differs. The value is passed straight through, so text is
 * preserved exactly — no trimming or normalising.
 */
const NOTES_MIN_H = 96   // the previous fixed height (h-24) — the empty state is unchanged
const NOTES_MAX_H = 420  // ~22 lines before it scrolls internally

function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (next: string) => void | Promise<void>
  placeholder?: string
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  // The height WE last applied. If the element differs from it, the locator dragged.
  const applied = useRef<number | null>(null)
  const manual = useRef(false)

  // useLayoutEffect, not useEffect: size before paint so a long note never flashes
  // at the collapsed height on open.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || manual.current) return
    // Reset first so scrollHeight reports the CONTENT height, not the current box.
    el.style.height = "auto"
    const next = Math.min(Math.max(el.scrollHeight, NOTES_MIN_H), NOTES_MAX_H)
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > NOTES_MAX_H ? "auto" : "hidden"
    applied.current = next
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      onMouseUp={() => {
        // A drag on the resize handle ends here. If the height is no longer the one
        // we set, the locator chose it — stop auto-sizing from then on.
        const el = ref.current
        if (el && applied.current !== null && Math.abs(el.offsetHeight - applied.current) > 1) {
          manual.current = true
        }
      }}
      onChange={(e) => void onChange(e.target.value)}
      placeholder={placeholder}
      style={{ minHeight: NOTES_MIN_H, maxHeight: manual.current ? undefined : NOTES_MAX_H }}
      className="w-full text-[12.5px] bg-[var(--crm-inset)] border border-[var(--crm-border)] rounded-xl px-3 py-2 resize-y text-[var(--crm-text-primary)] placeholder-[var(--crm-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--crm-accent)] focus:border-transparent transition-shadow"
    />
  )
}
