"use client"

import { useEffect, useState } from "react"
import DateTimePicker from "./DateTimePicker"

// Reverses a stored ISO due_at back into a local "YYYY-MM-DDTHH:mm" string,
// so editing an existing task opens with its real due date/time pre-filled.
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const min = String(d.getMinutes()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

// Human-readable label for a "YYYY-MM-DDTHH:mm" value shown in the field.
function formatDueLabel(local: string): string {
  if (!local) return ""
  const d = new Date(local)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export type EditingNextAction = {
  id: number
  title: string
  due_at: string
  priority: "low" | "medium" | "high"
  notes: string | null
}

// Create/edit a manual, one-off TASK for a lead (e.g. "Call to get invoice
// details"). Tasks supplement the automatic workflow — they are NOT another
// workflow step. Only Task, Due Date & Time, and Notes are collected.
export default function AddNextActionModal({
  open,
  onClose,
  onCreate,
  onUpdate,
  editing,
}: {
  open: boolean
  onClose: () => void
  // Returns whether the create actually succeeded — the modal only clears the
  // form and closes on a confirmed success, so a failed submission leaves what
  // the user typed intact instead of silently discarding it.
  onCreate: (input: { title: string; dueAt: string; priority: "low" | "medium" | "high"; notes: string }) => Promise<boolean>
  // Same contract as onCreate, but updates an existing row. Only needed when editing.
  onUpdate?: (id: number, input: { title: string; dueAt: string; priority: "low" | "medium" | "high"; notes: string }) => Promise<boolean>
  // Non-null when editing an existing task — pre-fills the form and switches
  // Save to call onUpdate instead of onCreate.
  editing?: EditingNextAction | null
  // Accepted for backward compatibility with call sites; unused (tasks are
  // free text, never stage-defaulted).
  crmStatus?: string
}) {
  const isEditing = !!editing

  const [taskTitle, setTaskTitle] = useState("")
  // dueAt is the committed value ("YYYY-MM-DDTHH:mm"), set only via Apply.
  const [dueAt, setDueAt] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)

  // Whether the self-contained calendar+time popover is open. The selection is
  // committed to `dueAt` only when the popover's own Apply button is pressed.
  const [pickerOpen, setPickerOpen] = useState(false)

  // The modal instance is reused across leads (LeadPanel isn't remounted when
  // the selected lead changes), so the form is (re)initialized every open —
  // blank for a new task, pre-filled for an edit.
  useEffect(() => {
    if (!open) return
    if (editing) {
      setTaskTitle(editing.title)
      setDueAt(toDatetimeLocalValue(editing.due_at))
      setNotes(editing.notes ?? "")
    } else {
      setTaskTitle("")
      setDueAt("")
      setNotes("")
    }
    setPickerOpen(false)
    setSubmitError(false)
  }, [open, editing])

  if (!open) return null

  const title = taskTitle.trim()
  const canSubmit = title.length > 0 && dueAt.length > 0 && !submitting

  function reset() {
    setTaskTitle("")
    setDueAt("")
    setNotes("")
    setPickerOpen(false)
    setSubmitError(false)
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setSubmitError(false)
    // Priority is no longer collected; tasks default to "medium" so the row
    // still ranks sensibly in the workflow (which orders by due date first).
    const input = { title, dueAt: new Date(dueAt).toISOString(), priority: "medium" as const, notes }
    const ok = editing && onUpdate
      ? await onUpdate(editing.id, input)
      : await onCreate(input)
    setSubmitting(false)
    if (ok) {
      reset()
    } else {
      setSubmitError(true)
    }
  }

  function handleClose() {
    reset()
    onClose()
  }

  const labelCls = "text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mb-1 block"

  return (
    <div className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-[var(--crm-panel)] rounded-2xl shadow-2xl p-6">
        <h3 className="text-lg font-bold text-[var(--crm-text-primary)]">{isEditing ? "Edit Task" : "Add Task"}</h3>
        <p className="text-sm text-[var(--crm-text-secondary)] mt-1">
          {isEditing ? "Change the task, due date, or notes." : "Create a custom task or reminder for this lead."}
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className={labelCls}>Task</label>
            <input
              type="text"
              autoFocus
              placeholder="e.g. Call to get invoice details"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              className="w-full text-[13px] border border-[var(--crm-border)] rounded-lg px-2.5 py-1.5 bg-[var(--crm-inset)] text-[var(--crm-text-primary)] placeholder:text-[var(--crm-text-muted)]"
            />
          </div>

          <div>
            <label className={labelCls}>Due Date &amp; Time</label>
            {/* Clicking the field opens the picker (with an explicit Apply), so
                the selection is only committed when the user confirms. */}
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="w-full text-left text-[13px] border border-[var(--crm-border)] rounded-lg px-2.5 py-1.5 bg-[var(--crm-inset)] hover:bg-[var(--crm-card)] transition-colors"
            >
              {dueAt ? (
                <span className="text-[var(--crm-text-primary)]">{formatDueLabel(dueAt)}</span>
              ) : (
                <span className="text-[var(--crm-text-muted)]">Select a date and time</span>
              )}
            </button>

            {pickerOpen && (
              <DateTimePicker
                value={dueAt}
                onApply={(v) => {
                  setDueAt(v)
                  setPickerOpen(false)
                }}
                onCancel={() => setPickerOpen(false)}
              />
            )}
          </div>

          <div>
            <label className={labelCls}>Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full text-[13px] border border-[var(--crm-border)] rounded-lg px-2.5 py-1.5 resize-none bg-[var(--crm-inset)] text-[var(--crm-text-primary)]"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-xl border border-[var(--crm-border)] text-sm font-medium text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="crm-cta px-4 py-2 rounded-xl text-sm font-semibold"
          >
            {submitting ? (isEditing ? "Saving..." : "Adding...") : (isEditing ? "Save Changes" : "Add Task")}
          </button>
        </div>

        {submitError && (
          <p className="text-[11.5px] text-red-600 font-medium mt-2 text-right">
            Couldn't save — nothing was cleared, try again.
          </p>
        )}
      </div>
    </div>
  )
}
