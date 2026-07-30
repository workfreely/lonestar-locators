"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { MARKET_OPTIONS } from "@/lib/markets/catalog"
import { SettingsCard } from "@/components/crm/settings/SettingsShell"

// Service Areas — the workspace's selected market slugs (workspaces.service_areas).
// The markets/neighborhoods catalog lives in code; changes apply to the Smart
// Lead Form immediately (it reads the selection live). Rendered as embeddable
// SettingsCards (no shell) so it lives inside the Profile page as part of the
// user's business profile.
export default function ServiceAreasSection() {
  const [selected, setSelected] = useState<string[]>([])
  const [slug, setSlug] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await supabase.rpc("get_current_workspace")
      if (!active) return
      const row = Array.isArray(data) ? data[0] : data
      setSelected(row?.service_areas ?? [])
      setSlug(row?.slug ?? null)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [])

  function toggle(slugKey: string) {
    setSaved(false)
    setSelected((prev) =>
      prev.includes(slugKey) ? prev.filter((s) => s !== slugKey) : [...prev, slugKey]
    )
  }

  async function save() {
    setSaving(true)
    setSaved(false)
    const { error } = await supabase.rpc("set_workspace_service_areas", { p_areas: selected })
    setSaving(false)
    if (!error) setSaved(true)
  }

  return (
    <>
      <SettingsCard
        title="Service Areas"
        description="Choose the markets you serve. Your Smart Lead Form shows only these cities and their neighborhoods — changes apply instantly."
      >
        {loading ? (
          <p className="text-[13px] text-[#6b7280]">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {MARKET_OPTIONS.map((m) => {
                const active = selected.includes(m.slug)
                return (
                  <button
                    key={m.slug}
                    type="button"
                    onClick={() => toggle(m.slug)}
                    aria-pressed={active}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-[14px] font-medium transition-colors ${
                      active
                        ? "border-[#2f6bff] bg-[#2f6bff]/5 text-[#111318]"
                        : "border-[#e5e7ee] bg-white text-[#111318] hover:border-[#c7ccd6]"
                    }`}
                  >
                    <span>
                      {m.name} <span className="text-[#9098a8]">· {m.state}</span>
                    </span>
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                        active ? "border-[#2f6bff] bg-[#2f6bff] text-white" : "border-[#e5e7ee] text-transparent"
                      }`}
                    >
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-[#2f6bff] px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#255ae0] disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              {saved && <span className="text-[13px] font-medium text-[#16a34a]">Saved</span>}
            </div>
          </>
        )}
      </SettingsCard>

      {slug && (
        <SettingsCard title="Public form URL" description="Your permanent Smart Lead Form link. It never changes when you update service areas.">
          <p className="rounded-lg border border-[#e5e7ee] bg-[#f4f5f8] px-4 py-2.5 font-mono text-[13px] text-[#111318]">
            locatorbeast.com/{slug}
          </p>
        </SettingsCard>
      )}
    </>
  )
}
