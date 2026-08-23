"use client"

import { useEffect, useState } from "react"
import { buildInitialSmartFormConfig } from "../../_lib/initialConfig"
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
  // Save state — every account has ONE always-live form at its public slug.
  // Saving persists the config and it's immediately live; there is no publish
  // step and no draft/published split. `saved` shows a brief confirmation and
  // clears the moment the user edits again.
  const [slug, setSlug] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // The agent photo is the LIVE profile photo (profiles.profile_photo_url) — a
  // single source of truth shared with the nav avatar, public form, and every
  // client-facing signature. It's overlaid onto the preview only (below); it is
  // never written into the saved form config, so a Profile update shows here on
  // reload without re-uploading anything.
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null)
  // Canonical profiles.license_state — decides whether the Texas-only TREC
  // disclosure fields are offered at all.
  const [licenseState, setLicenseState] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const [{ data: ws }, { data: form }, { data: userData }] = await Promise.all([
        supabase.rpc("get_current_workspace"),
        supabase.rpc("get_smart_form"),
        supabase.auth.getUser(),
      ])
      if (!active) return
      const wsRow = Array.isArray(ws) ? ws[0] : ws
      if (wsRow?.service_areas) setServiceAreaSlugs(wsRow.service_areas)

      const uid = userData?.user?.id
      let prof: {
        profile_photo_url?: string | null
        first_name?: string | null
        last_name?: string | null
        preferred_name?: string | null
        brokerage?: string | null
        phone_number?: string | null
        license_state?: string | null
      } | null = null
      if (uid) {
        const { data } = await supabase
          .from("profiles")
          .select("profile_photo_url, first_name, last_name, preferred_name, brokerage, phone_number, license_state")
          .eq("id", uid)
          .maybeSingle()
        prof = data
        if (active) {
          setProfilePhotoUrl(prof?.profile_photo_url ?? null)
          setLicenseState(prof?.license_state ?? null)
        }
      }

      const formRow = Array.isArray(form) ? form[0] : form
      if (formRow?.slug) setSlug(formRow.slug)
      // Start editing from the saved (live) config so saving edits the existing
      // form rather than resetting to defaults.
      if (formRow?.config) {
        setConfig(mergeSmartFormConfig(formRow.config))
      } else {
        // NO SAVED CONFIG — this is a creation path, so build the SAME starting
        // form onboarding would have built rather than showing DEFAULT_CONFIG.
        // Seeding from the raw defaults here is what previously surfaced
        // "Jordan Blake" / "Placeholder Realty Group" / the Austin-Dallas-Houston
        // sample areas to a real agent, and a Save then persisted that fiction.
        // buildInitialSmartFormConfig is the ONE creation path, so both entry
        // points produce identical results — hero theme from the FIRST selected
        // market, headline and testimonials off.
        const name =
          (prof?.preferred_name ?? "").trim() ||
          `${prof?.first_name ?? ""} ${prof?.last_name ?? ""}`.trim()
        setConfig(
          buildInitialSmartFormConfig({
            agentName: name,
            brokerageName: prof?.brokerage ?? null,
            phoneNumber: prof?.phone_number ?? null,
            serviceAreas: wsRow?.service_areas ?? [],
          }),
        )
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

  // Preview config = the edited config with the LIVE profile photo overlaid for
  // the agent photo. The overlay is preview-only: `config` (what save persists)
  // never carries the photo, so profiles.profile_photo_url stays the one source.
  const previewConfig: SmartLeadFormConfig = {
    ...config,
    branding: { ...config.branding, agentPhotoUrl: profilePhotoUrl },
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
            <SmartLeadForm config={previewConfig} serviceAreaSlugs={serviceAreaSlugs} />
          </PreviewFrame>
        </div>

        <div className="w-[560px] shrink-0 overflow-hidden border-l border-[#e5e7ee] bg-white">
          <SettingsPanel config={config} onChange={updateConfig} slug={slug} licenseState={licenseState} />
        </div>
      </div>
    </div>
  )
}
