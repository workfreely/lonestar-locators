"use client"

import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { HiOutlineBars3 } from "react-icons/hi2"
import type { SmartLeadFormConfig, AfterFormSectionId } from "../../../_lib/types"
import Switch from "../ui/Switch"

type Updater = (updater: (prev: SmartLeadFormConfig) => SmartLeadFormConfig) => void
type VisibilityKey = keyof SmartLeadFormConfig["sections"]["visibility"]

const LABELS: Record<AfterFormSectionId, string> = {
  testimonials: "Testimonials",
  faq: "FAQs",
}

// A fixed, non-draggable show/hide row — used for pieces of the page that
// always live in a specific spot (the hero composition, the footer) and
// should never be reorderable, unlike the After the form zone below.
function ToggleRow({ label, note, checked, onToggle }: { label: string; note?: string; checked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-[#e5e7ee] bg-white pl-4 pr-3 py-2.5">
      <div className="flex-1">
        <p className="text-[13.5px] font-medium text-[#111318]">{label}</p>
        {note && <p className="text-[11.5px] text-[#9098a8]">{note}</p>}
      </div>
      <Switch checked={checked} onChange={onToggle} />
    </div>
  )
}

function SortableRow({
  id,
  visible,
  onToggle,
}: {
  id: AfterFormSectionId
  visible: boolean
  onToggle: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1.5 rounded-xl border border-[#e5e7ee] bg-white pl-1 pr-3 py-1"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex h-8 w-8 shrink-0 touch-none items-center justify-center rounded-lg text-[#c1c4cf] hover:bg-[#f4f5f8] active:cursor-grabbing"
      >
        <HiOutlineBars3 className="h-4 w-4" />
      </button>
      <span className="flex-1 text-[13.5px] font-medium text-[#111318]">{LABELS[id]}</span>
      <Switch checked={visible} onChange={onToggle} />
    </div>
  )
}

function SortableZone({
  dndId,
  title,
  ids,
  visibility,
  onReorder,
  onToggle,
}: {
  dndId: string
  title: string
  ids: AfterFormSectionId[]
  visibility: Record<string, boolean>
  onReorder: (ids: string[]) => void
  onToggle: (id: string) => void
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ids.indexOf(active.id as never)
    const newIndex = ids.indexOf(over.id as never)
    onReorder(arrayMove(ids, oldIndex, newIndex))
  }

  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">{title}</p>
      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {ids.map((id) => (
              <SortableRow key={id} id={id} visible={visibility[id]} onToggle={() => onToggle(id)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

export default function SectionsPanel({
  config,
  onChange,
}: {
  config: SmartLeadFormConfig
  onChange: Updater
}) {
  const { afterForm, visibility } = config.sections

  function toggleVisibility(key: VisibilityKey) {
    onChange((prev) => ({
      ...prev,
      sections: { ...prev.sections, visibility: { ...prev.sections.visibility, [key]: !prev.sections.visibility[key] } },
    }))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl bg-[#f4f5f8] p-3 text-[12px] leading-relaxed text-[#6b7280]">
        Show, hide, and reorder sections.
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">Hero</p>
        <div className="flex flex-col gap-2">
          <ToggleRow
            label="Headline"
            note="Hide for an image-focused hero — the background image leads instead."
            checked={visibility.headline}
            onToggle={() => toggleVisibility("headline")}
          />
          <ToggleRow label="Highlights" checked={visibility.highlights} onToggle={() => toggleVisibility("highlights")} />
          <ToggleRow label="Agent Information" checked={visibility.agentProfile} onToggle={() => toggleVisibility("agentProfile")} />
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-[#9098a8]">
          The headline, Highlights, and Agent Information are part of the hero and always appear in this order — show/hide only, not reorderable.
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-[#e5e7ee] py-3 text-center text-[12px] font-semibold text-[#9098a8]">
        Smart Lead Form
      </div>

      <SortableZone
        dndId="after-form"
        title="After the form"
        ids={afterForm}
        visibility={visibility}
        onReorder={(ids) =>
          onChange((prev) => ({
            ...prev,
            sections: { ...prev.sections, afterForm: ids as AfterFormSectionId[] },
          }))
        }
        onToggle={(id) => toggleVisibility(id as VisibilityKey)}
      />
    </div>
  )
}
