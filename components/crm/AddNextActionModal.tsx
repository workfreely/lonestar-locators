"use client"

import { useEffect, useState } from "react"

// Preset manual Next Action titles (CRM Phase 1 Workflow Cleanup spec,
// extended with the stage-default actions below). Deliberately kept short
// and generic — one-off actions outside this list (e.g. contacting a
// property, requesting documents) use "Custom Action" rather than growing
// this list. "Custom Action" reveals a free-text title field instead of
// using this label literally.
const PRESET_TITLES = [
  "Contact Lead",
  "Waiting for Response",
  "Build List",
  "Send List",
  "FU1",
  "Setup Tour",
  "Tour Follow-Up",
  "Check App",
  "Confirm Lease",
  "Setup Movers",
  "Send Rebate",
  "Get Invoice Details",
  "Custom Action",
]

// Intelligent default: preselect the action that's already the logical
// next step for the lead's current stage, so adding a manual action
// usually means one click on Save rather than choosing from scratch. The
// user can always pick something else from the dropdown.
const STAGE_DEFAULT_ACTION: Record<string, string> = {
  new: "Contact Lead",
  contacted: "Waiting for Response",
  searching: "Send List",
  list_sent: "FU1",
  ready_to_tour: "Setup Tour",
  done_touring: "Tour Follow-Up",
  applied: "Check App",
  closed: "Get Invoice Details",
}

function getDefaultPreset(crmStatus?: string): string {
  return STAGE_DEFAULT_ACTION[crmStatus ?? ""] ?? PRESET_TITLES[0]
}

const PRIORITIES: { value: "low" | "medium" | "high"; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
]

// Default due time is 9:30 AM — just the initial value shown, not a
// scheduling rule. The user is free to change either the date or time.
function getDefaultDueAt(): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, "0")
  const dd = String(now.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}T09:30`
}

// Reverses getDefaultDueAt's format — turns a stored ISO due_at back into
// a local "YYYY-MM-DDTHH:mm" string the datetime-local input can show,
// so editing an existing (often Workflow-Engine-created) action opens
// with its real due date/time pre-filled rather than resetting it.
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const min = String(d.getMinutes()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

export type EditingNextAction = {
  id: number
  title: string
  due_at: string
  priority: "low" | "medium" | "high"
  notes: string | null
}

export default function AddNextActionModal({
  open,
  onClose,
  onCreate,
  onUpdate,
  editing,
  crmStatus,
}: {
  open: boolean
  onClose: () => void
  // Returns whether the create actually succeeded — the modal only clears
  // the form and closes on a confirmed success, so a failed submission
  // (e.g. a network/permission error) leaves what the user typed intact
  // instead of silently discarding it with no visible feedback.
  onCreate: (input: { title: string; dueAt: string; priority: "low" | "medium" | "high"; notes: string }) => Promise<boolean>
  // Same success/failure contract as onCreate, but updates an existing
  // row instead of inserting a new one. Only needed when editing is set.
  onUpdate?: (id: number, input: { title: string; dueAt: string; priority: "low" | "medium" | "high"; notes: string }) => Promise<boolean>
  // Non-null when editing an existing action (e.g. from the Workflow
  // Engine's "✓ Next Action Created" toast) — pre-fills the form and
  // switches Save to call onUpdate instead of onCreate.
  editing?: EditingNextAction | null
  // The lead's current stage, used only to preselect the intelligent
  // default title below — never sent anywhere or used for any automation.
  crmStatus?: string
}) {
  const isEditing = !!editing

  const [preset, setPreset] = useState(() => getDefaultPreset(crmStatus))
  const [customTitle, setCustomTitle] = useState("")
  const [dueAt, setDueAt] = useState(getDefaultDueAt)
  const [priority, setPriority] = useState<"low" | "medium" | "high">("low")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)

  // The modal instance is reused across leads (LeadPanel isn't remounted
  // when the selected lead changes), so the smart default — and any
  // in-progress edit — has to be recomputed every time it's opened, not
  // just once at first mount.
  useEffect(() => {
    if (!open) return
    if (editing) {
      const isPreset = PRESET_TITLES.includes(editing.title)
      setPreset(isPreset ? editing.title : "Custom Action")
      setCustomTitle(isPreset ? "" : editing.title)
      setDueAt(toDatetimeLocalValue(editing.due_at))
      setPriority(editing.priority)
      setNotes(editing.notes ?? "")
    } else {
      setPreset(getDefaultPreset(crmStatus))
      setDueAt(getDefaultDueAt())
    }
  }, [open, crmStatus, editing])

  if (!open) return null

  const isCustom = preset === "Custom Action"
  const title = isCustom ? customTitle.trim() : preset
  const canSubmit = title.length > 0 && dueAt.length > 0 && !submitting

  function reset() {
    setPreset(getDefaultPreset(crmStatus))
    setCustomTitle("")
    setDueAt(getDefaultDueAt())
    setPriority("low")
    setNotes("")
    setSubmitError(false)
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setSubmitError(false)
    const input = { title, dueAt: new Date(dueAt).toISOString(), priority, notes }
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

  return (
    <div className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-[var(--crm-panel)] rounded-2xl shadow-2xl p-6">
        <h3 className="text-lg font-bold text-[var(--crm-text-primary)]">{isEditing ? "Edit Next Action" : "Add Next Action"}</h3>
        <p className="text-sm text-[var(--crm-text-secondary)] mt-1">
          {isEditing ? "Change the title, due date, priority, or notes." : "Extends the automatic follow-up — it never replaces it."}
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mb-1 block">
              Title
            </label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="w-full text-[13px] font-medium text-[var(--crm-text-primary)] border border-[var(--crm-border)] rounded-lg px-2.5 py-1.5 bg-[var(--crm-inset)]"
            >
              {PRESET_TITLES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {isCustom && (
              <input
                type="text"
                autoFocus
                placeholder="Describe the action"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="mt-2 w-full text-[13px] border border-[var(--crm-border)] rounded-lg px-2.5 py-1.5 bg-[var(--crm-inset)] text-[var(--crm-text-primary)]"
              />
            )}
          </div>

          <div>
            <label className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mb-1 block">
              Due Date &amp; Time
            </label>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="w-full text-[13px] border border-[var(--crm-border)] rounded-lg px-2.5 py-1.5 bg-[var(--crm-inset)] text-[var(--crm-text-primary)]"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mb-1 block">
              Priority
            </label>
            <div className="flex gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={[
                    "flex-1 text-[11.5px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors",
                    priority === p.value
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-[var(--crm-inset)] text-[var(--crm-text-secondary)] border-[var(--crm-border)] hover:bg-[var(--crm-card)]",
                  ].join(" ")}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mb-1 block">
              Notes (optional)
            </label>
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
            {submitting ? (isEditing ? "Saving..." : "Adding...") : (isEditing ? "Save Changes" : "Add Action")}
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
