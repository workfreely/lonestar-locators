"use client"

import { useState } from "react"
import { formatTimeZoneLabel, COMMON_TIMEZONES } from "@/lib/timezone"
import { SettingsCard, settingsInputCls } from "@/components/crm/settings/SettingsShell"

/**
 * Account Profile → Time Zone control. Reads the saved profiles.timezone and lets
 * the locator intentionally change it via the dedicated /api/admin/profile/timezone
 * route (same persistence the first-login confirmation uses). Changing here is the
 * ONLY way the saved zone changes — a traveling device never alters it silently.
 *
 * Wrapped in the shared SettingsCard so it matches the other Profile sections
 * (full width, padding, border, radius, heading/description spacing).
 */
export default function TimezoneSetting({ initialTimeZone }: { initialTimeZone: string }) {
  const [tz, setTz] = useState(initialTimeZone)
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState(initialTimeZone)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const options =
    COMMON_TIMEZONES.some((z) => z.tz === tz) ? COMMON_TIMEZONES : [{ tz, label: "Current" }, ...COMMON_TIMEZONES]

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/profile/timezone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: selected }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Save failed")
      setTz(selected)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsCard
      title="Time Zone"
      description="Used for scheduling and reminders."
    >
      {!editing ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px] text-[#111318]">{formatTimeZoneLabel(tz)}</span>
          <button
            type="button"
            onClick={() => {
              setSelected(tz)
              setError(null)
              setEditing(true)
            }}
            className="flex-none rounded-lg border border-[#d9deea] bg-white px-4 py-2 text-[13px] font-semibold text-[#111318] transition-colors hover:border-[#2f6bff] hover:text-[#2f6bff]"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className={settingsInputCls}
          >
            {options.map((z) => (
              <option key={z.tz} value={z.tz}>
                {z.label} — {z.tz}
              </option>
            ))}
          </select>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setEditing(false)
                setError(null)
              }}
              className="flex-none rounded-lg border border-[#d9deea] bg-white px-4 py-2 text-[13px] font-semibold text-[#111318] transition-colors hover:border-[#2f6bff] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="flex-none rounded-lg bg-[#2f6bff] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#265fe0] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </SettingsCard>
  )
}
