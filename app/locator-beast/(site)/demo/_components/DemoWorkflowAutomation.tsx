"use client";

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { firstName, type DemoLead } from "@/app/locator-beast/(site)/demo/_data/demo";

function LeadCard({ lead, grabbing, hint }: { lead: DemoLead; grabbing?: boolean; hint?: boolean }) {
  return (
    <div
      className={`rounded-xl border border-white/10 bg-white/[0.05] p-3.5 ${
        grabbing ? "cursor-grabbing shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)]" : "cursor-grab"
      }`}
    >
      <p className="text-[13.5px] font-semibold text-white">{lead.name}</p>
      <p className="mt-0.5 text-[11.5px] text-white/50">
        {lead.bedrooms} · {lead.budget} · {lead.area}
      </p>
      {hint && (
        <p className="mt-2 text-[11px] font-medium text-[var(--beast-blue-bright)]">Drag me to “Contacted” →</p>
      )}
    </div>
  );
}

function DraggableLead({ lead }: { lead: DemoLead }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: "lead" });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: CSS.Translate.toString(transform),
        touchAction: "none",
        position: isDragging ? "relative" : undefined,
        zIndex: isDragging ? 50 : undefined,
      }}
    >
      <LeadCard lead={lead} grabbing={isDragging} hint={!isDragging} />
    </div>
  );
}

function Column({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count: number;
  children?: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 rounded-2xl border p-3 transition-colors ${
        isOver ? "border-[var(--beast-blue)] bg-[var(--beast-blue)]/10" : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center justify-between px-1 pb-2.5">
        <span className="text-[12.5px] font-semibold text-white/70">{title}</span>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] tabular-nums text-white/40">{count}</span>
      </div>
      <div className="min-h-[96px] space-y-2">{children}</div>
    </div>
  );
}

// Demo #2 — a focused two-column workflow (New → Contacted) with a single
// sample lead. Dragging it to "Contacted" fires the automation payoff. This is
// NOT the production Lead Board — no other stages, dashboard, analytics, or nav.
export default function DemoWorkflowAutomation({ lead, onComplete }: { lead: DemoLead; onComplete: () => void }) {
  const [moved, setMoved] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const fn = firstName(lead);

  function onDragEnd(e: DragEndEvent) {
    if (e.over?.id === "contacted") setMoved(true);
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3">
          <Column id="new" title="New" count={moved ? 0 : 1}>
            {!moved && <DraggableLead lead={lead} />}
          </Column>
          <Column id="contacted" title="Contacted" count={moved ? 1 : 0}>
            {moved && <LeadCard lead={lead} />}
          </Column>
        </div>
      </DndContext>

      {!moved ? (
        <p className="mt-4 text-center text-[13px] text-white/45">
          Drag the lead from <span className="font-semibold text-white/70">New</span> to{" "}
          <span className="font-semibold text-white/70">Contacted</span> — Locator Beast handles the rest.
        </p>
      ) : (
        <div className="beast-fade-up mt-5 rounded-2xl border border-white/10 bg-[#0b0f1a] p-5">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-400">
            <CheckIcon className="h-4 w-4" /> Automation triggered
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Next Action</p>
              <p className="mt-1.5 text-[13.5px] font-semibold text-white">Send apartment options to {fn}</p>
              <p className="mt-0.5 text-[12px] text-white/45">Auto-scheduled · due today</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Timeline</p>
              <ul className="mt-1.5 space-y-1.5">
                <li className="flex gap-2 text-[12.5px] text-white/70">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-[var(--beast-blue)]" />
                  Stage moved: New → Contacted · just now
                </li>
                <li className="flex gap-2 text-[12.5px] text-white/70">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-white/30" />
                  First contact logged
                </li>
              </ul>
            </div>
          </div>

          <button
            type="button"
            onClick={onComplete}
            className="mt-5 w-full rounded-full bg-[var(--beast-blue)] px-6 py-3 text-[14px] font-semibold text-white transition-transform duration-200 hover:scale-[1.01]"
          >
            Continue to AI Insights →
          </button>
        </div>
      )}
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 12.5l4 4 10-10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
