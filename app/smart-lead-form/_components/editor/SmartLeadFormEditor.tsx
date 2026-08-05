"use client"

import { useEffect, useState } from "react"
import { DEFAULT_CONFIG } from "../../_lib/defaultConfig"
import { mergeSmartFormConfig } from "../../_lib/mergeConfig"
import type { SmartLeadFormConfig } from "../../_lib/types"
import { supabase } from "@/lib/supabase/client"
import { defaultThemeForMarkets } from "@/lib/markets/catalog"
import EditorToolbar from "./EditorToolbar"
import SettingsPanel from "./SettingsPanel"
import PreviewFrame from "../preview/PreviewFrame"
import SmartLeadForm from "../form/SmartLeadForm"

export default function SmartLeadFormEditor() {
  const [config, setConfig] = useState<SmartLeadFormConfig>(DEFAULT_CONFIG)
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile")
  // The workspace's selected markets — the preview shows exactly the cities the
  // public form will, and reflects Service Areas changes on reload.
  const [serviceAreaSlugs, setServiceAreaSlugs] = useState<string[]>([])
  // Save state — every account has ONE always-live form at its public slug.
  // Saving persists the config and it's immediately live; there is no publish
  // step and no draft/published split. `saved` shows a brief confirmation and
  // clears the moment the user edits again.
  const [slug, setSlug] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const [{ data: ws }, { data: form }] = await Promise.all([
        supabase.rpc("get_current_workspace"),
        supabase.rpc("get_smart_form"),
      ])
      if (!active) return
      const wsRow = Array.isArray(ws) ? ws[0] : ws
      if (wsRow?.service_areas) setServiceAreaSlugs(wsRow.service_areas)

      const formRow = Array.isArray(form) ? form[0] : form
      if (formRow?.slug) setSlug(formRow.slug)
      // Start editing from the saved (live) config so saving edits the existing
      // form rather than resetting to defaults.
      if (formRow?.config) {
        setConfig(mergeSmartFormConfig(formRow.config))
      } else {
        // New form: seed the Hero Background from the workspace's primary market
        // (market → default theme). Applied ONCE, only when no config is saved —
        // after this the user can pick any theme and the market is left alone.
        const themeSlug = defaultThemeForMarkets(wsRow?.service_areas)
        if (themeSlug) {
          setConfig((prev) => ({ ...prev, branding: { ...prev.branding, heroTheme: themeSlug } }))
        }
      }
    })()
    return () => {
      active = false
    }
  }, [])

  function updateConfig(updater: (prev: SmartLeadFormConfig) => SmartLeadFormConfig) {
    setConfig(updater)
    // Any edit clears the "Saved" confirmation so the button invites another save.
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    setSaveError(null)
    const { error } = await supabase.rpc("save_smart_form", { p_config: config })
    setSaving(false)
    if (error) {
      setSaveError(
        error.message?.includes("no_workspace")
          ? "Finish onboarding before saving your form."
          : "Save failed. Please try again."
      )
      return
    }
    setSaved(true)
  }

  return (
    // Viewport-anchored (fixed inset-0), matching the Business Settings shell
    // (components/crm/settings/SettingsShell.tsx). This keeps the shared header
    // at the top-level shell — full width on the FIRST client-side navigation —
    // instead of inside the root layout's constrained <main> (max-width 1200 +
    // padding), whose presence depends on the root layout's server-decided
    // branch and never re-runs on client nav (which caused the clipping).
    <div className="fixed inset-0 z-30 flex flex-col overflow-hidden bg-[#f4f5f8]">
      <EditorToolbar
        device={device}
        onDeviceChange={setDevice}
        onSave={save}
        saving={saving}
        saved={saved}
        saveError={saveError}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 items-start justify-center overflow-y-auto p-8">
          <PreviewFrame device={device}>
            <SmartLeadForm config={config} serviceAreaSlugs={serviceAreaSlugs} />
          </PreviewFrame>
        </div>

        <div className="w-[560px] shrink-0 overflow-hidden border-l border-[#e5e7ee] bg-white">
          <SettingsPanel config={config} onChange={updateConfig} slug={slug} />
        </div>
      </div>
    </div>
  )
}
