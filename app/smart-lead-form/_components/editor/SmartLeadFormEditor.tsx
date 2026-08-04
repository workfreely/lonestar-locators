"use client"

import { useEffect, useState } from "react"
import { DEFAULT_CONFIG } from "../../_lib/defaultConfig"
import { mergeSmartFormConfig } from "../../_lib/mergeConfig"
import type { SmartLeadFormConfig } from "../../_lib/types"
import { supabase } from "@/lib/supabase/client"
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
  // Publish state — the username is the public URL; a form is live once
  // published_at is set (persisted on the workspace).
  const [slug, setSlug] = useState<string | null>(null)
  const [publishedAt, setPublishedAt] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)

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
      if (formRow?.published_at) setPublishedAt(formRow.published_at)
      // Start editing from the saved (live) config so re-publishing edits the
      // existing form rather than resetting to defaults.
      if (formRow?.config) setConfig(mergeSmartFormConfig(formRow.config))
    })()
    return () => {
      active = false
    }
  }, [])

  function updateConfig(updater: (prev: SmartLeadFormConfig) => SmartLeadFormConfig) {
    setConfig(updater)
  }

  async function publish() {
    setPublishing(true)
    setPublishError(null)
    const { data, error } = await supabase.rpc("publish_smart_form", { p_config: config })
    setPublishing(false)
    if (error) {
      setPublishError(
        error.message?.includes("no_workspace")
          ? "Finish onboarding before publishing your form."
          : "Couldn't publish. Please try again."
      )
      return
    }
    setPublishedAt(typeof data === "string" ? data : new Date().toISOString())
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
        onPublish={publish}
        publishing={publishing}
        published={Boolean(publishedAt)}
        slug={slug}
        publishError={publishError}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 items-start justify-center overflow-y-auto p-8">
          <PreviewFrame device={device}>
            <SmartLeadForm config={config} serviceAreaSlugs={serviceAreaSlugs} />
          </PreviewFrame>
        </div>

        <div className="w-[500px] shrink-0 overflow-hidden border-l border-[#e5e7ee] bg-white">
          <SettingsPanel config={config} onChange={updateConfig} slug={slug} />
        </div>
      </div>
    </div>
  )
}
