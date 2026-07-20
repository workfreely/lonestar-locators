"use client"

import { useState } from "react"

// Preset manual Next Action titles (CRM Phase 1 Workflow Cleanup spec).
// Deliberately kept short and generic — one-off actions outside this list
// (e.g. contacting a property, requesting documents) use "Custom Action"
// rather than growing this list. "Custom Action" reveals a free-text
// title field instead of using this label literally.
const PRESET_TITLES = [
  "Contact Lead",
  "Build List",
  "Send List",
  "Setup Tour",
  "Tour Follow-Up",
  "Check App",
  "Confirm Lease",
  "Setup Movers",
  "Send Rebate",
  "Custom Action",
]

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

export default function AddNextActionModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  // Returns whether the create actually succeeded — the modal only clears
  // the form and closes on a confirmed success, so a failed submission
  // (e.g. a network/permission error) leaves what the user typed intact
  // instead of silently discarding it with no visible feedback.
  onCreate: (input: { title: string; dueAt: string; priority: "low" | "medium" | "high"; notes: string }) => Promise<boolean>
}) {
  const [preset, setPreset] = useState(PRESET_TITLES[0])
  const [customTitle, setCustomTitle] = useState("")
  const [dueAt, setDueAt] = useState(getDefaultDueAt)
  const [priority, setPriority] = useState<"low" | "medium" | "high">("low")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)

  if (!open) return null

  const isCustom = preset === "Custom Action"
  const title = isCustom ? customTitle.trim() : preset
  const canSubmit = title.length > 0 && dueAt.length > 0 && !submitting

  function reset() {
    setPreset(PRESET_TITLES[0])
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
    const ok = await onCreate({ title, dueAt: new Date(dueAt).toISOString(), priority, notes })
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
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6">
        <h3 className="text-lg font-bold text-gray-900">Add Next Action</h3>
        <p className="text-sm text-gray-500 mt-1">
          Extends the automatic follow-up — it never replaces it.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1 block">
              Title
            </label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="w-full text-[13px] font-medium text-gray-800 border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white"
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
                className="mt-2 w-full text-[13px] border border-gray-300 rounded-lg px-2.5 py-1.5"
              />
            )}
          </div>

          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1 block">
              Due Date &amp; Time
            </label>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="w-full text-[13px] border border-gray-300 rounded-lg px-2.5 py-1.5"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1 block">
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
                      : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50",
                  ].join(" ")}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1 block">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full text-[13px] border border-gray-300 rounded-lg px-2.5 py-1.5 resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Adding..." : "Add Action"}
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
