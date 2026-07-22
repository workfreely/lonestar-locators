"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { onWorkflowActionCreated, type WorkflowToastAction } from "@/lib/workflowToast"
import { formatDueDateTime } from "@/lib/actionDisplay"

const AUTO_DISMISS_MS = 8000

export default function WorkflowActionToast({
  onUndo,
  onEdit,
}: {
  // Removes the action from whatever local state list the caller keeps
  // (DashboardClient's localNextActions) — the DB delete itself happens
  // in here, so the caller only needs to mirror it in memory.
  onUndo: (actionId: number) => void
  // Opens the Next Action editor for this action (selects its lead and
  // asks LeadPanel to open AddNextActionModal in edit mode for it).
  onEdit: (action: WorkflowToastAction) => void
}) {
  const [action, setAction] = useState<WorkflowToastAction | null>(null)
  const [undone, setUndone] = useState(false)

  useEffect(() => {
    return onWorkflowActionCreated((created) => {
      setUndone(false)
      setAction(created)
    })
  }, [])

  useEffect(() => {
    if (!action) return
    const timer = setTimeout(() => setAction(null), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [action])

  if (!action) return null

  async function handleUndo() {
    if (!action) return
    setUndone(true)
    onUndo(action.id)
    const { error } = await supabase.from("lead_next_actions").delete().eq("id", action.id)
    if (error) console.error("[workflow-toast] undo failed:", error)
    setTimeout(() => setAction(null), 900)
  }

  function handleEdit() {
    if (!action) return
    onEdit(action)
    setAction(null)
  }

  return (
    <div className="fixed bottom-5 right-5 z-[10001] w-full max-w-xs">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.18)] px-4 py-3.5">
        {undone ? (
          <p className="text-[13px] font-semibold text-gray-600">Action removed</p>
        ) : (
          <>
            <p className="text-[13px] font-semibold text-emerald-600">✓ Next Action Created</p>
            <p className="text-[14.5px] font-bold text-gray-900 mt-1">{action.title}</p>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Due: {formatDueDateTime(action.due_at, { verbose: true })}
            </p>
            <div className="flex items-center gap-2 mt-2.5">
              <button
                type="button"
                onClick={handleUndo}
                className="flex-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Undo
              </button>
              <button
                type="button"
                onClick={handleEdit}
                className="flex-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Edit
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
