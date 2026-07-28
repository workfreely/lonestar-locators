"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import { exitDemoWorkspace } from "@/lib/demo/exitDemo"
import ConfirmDialog from "@/components/crm/ConfirmDialog"
import SettingsShell, { SettingsCard, settingsLabelCls } from "@/components/crm/settings/SettingsShell"

function formatCurrency(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "")
  return digits ? Number(digits).toLocaleString("en-US") : ""
}
function toNumber(display: string): number | null {
  const digits = display.replace(/[^\d]/g, "")
  return digits ? Number(digits) : null
}

const currencyInputCls =
  "w-full rounded-xl border border-[#e5e7ee] bg-white py-2.5 pl-7 pr-3 text-[14px] font-semibold text-[#111318] outline-none transition-colors focus:border-[#2f6bff]"

export default function SettingsClient({
  demoMode,
  monthlyGoal,
  avgCommission,
}: {
  demoMode: boolean
  monthlyGoal: number
  avgCommission: number
}) {
  const router = useRouter()
  const [goal, setGoal] = useState(monthlyGoal.toLocaleString("en-US"))
  const [avg, setAvg] = useState(avgCommission.toLocaleString("en-US"))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function saveGoals() {
    setSaving(true)
    setSaved(false)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from("profiles")
        .update({
          monthly_commission_goal: toNumber(goal),
          avg_commission_per_lease: toNumber(avg),
        })
        .eq("id", user.id)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  async function deleteDemo() {
    setConfirmDelete(false)
    setDeleting(true)
    await exitDemoWorkspace()
    router.push("/admin/leads")
    router.refresh()
  }

  return (
    <SettingsShell title="Business Goals" description="These drive your dashboard's monthly progress and projected pipeline.">
      <SettingsCard title="Business Goal Settings">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className={settingsLabelCls}>Average Commission per Lease</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-[#9098a8]">$</span>
              <input inputMode="numeric" value={avg} onChange={(e) => setAvg(formatCurrency(e.target.value))} className={currencyInputCls} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className={settingsLabelCls}>Monthly Commission Goal</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-[#9098a8]">$</span>
              <input inputMode="numeric" value={goal} onChange={(e) => setGoal(formatCurrency(e.target.value))} className={currencyInputCls} />
            </div>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={saveGoals}
            disabled={saving}
            className="rounded-lg bg-[#2f6bff] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#265fe0] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Goals"}
          </button>
          {saved && <span className="text-[12.5px] font-semibold text-emerald-600">✓ Saved</span>}
        </div>
      </SettingsCard>

      {demoMode && (
        <SettingsCard
          title="Demo Workspace"
          description="You're exploring a sample workspace. Delete it to start with a clean, empty CRM for your real business."
        >
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={deleting}
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-[13px] font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60"
          >
            {deleting ? "Clearing…" : "Delete Demo Workspace"}
          </button>
        </SettingsCard>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete Demo Workspace?"
        message="This removes all demo leads, analytics, agenda items, AI insights, and tasks. You'll start with a clean workspace — this can't be undone."
        confirmLabel="Delete Demo Workspace"
        cancelLabel="Cancel"
        danger
        onConfirm={deleteDemo}
        onCancel={() => setConfirmDelete(false)}
      />
    </SettingsShell>
  )
}
