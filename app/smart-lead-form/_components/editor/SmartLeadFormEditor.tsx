"use client"

import { useEffect, useState } from "react"
import { buildInitialSmartFormConfig } from "../../_lib/initialConfig"
import { mergeSmartFormConfig } from "../../_lib/mergeConfig"
import type { SmartLeadFormConfig } from "../../_lib/types"
import { supabase } from "@/lib/supabase/client"
import EditorToolbar from "./EditorToolbar"
import SettingsPanel from "./SettingsPanel"
import PreviewFrame from "../preview/PreviewFrame"
import PreviewSkeleton from "../preview/PreviewSkeleton"
import ThankYouPreview from "../preview/ThankYouPreview"
import type { Tab } from "./SettingsPanel"
import SmartLeadForm from "../form/SmartLeadForm"
import { displayFullName } from "@bc/companion-shared"

export default function SmartLeadFormEditor() {
  // null = the real config has not arrived yet. Seeding this with DEFAULT_CONFIG
  // is what made the preview flash "Jordan Blake / Placeholder Realty Group /
  // (210) 555-1234 / Austin, Dallas, Houston" for the duration of the three
  // Supabase round-trips below: those are the DESIGN TEMPLATE's values, and with
  // no way to say "not loaded" they were the only thing the first paint could
  // render. DEFAULT_CONFIG itself is unchanged and still does its real jobs — the
  // merge base and the intentional template — it just no longer doubles as a
  // loading state for a real agent.
  const [config, setConfig] = useState<SmartLeadFormConfig | null>(null)
  // The workspace's selected markets — the preview shows exactly the cities the
  // public form will, and reflects Service Areas changes on reload.
  const [serviceAreaSlugs, setServiceAreaSlugs] = useState<string[]>([])
  // Save state — every account has ONE always-live form at its public slug.
  // Saving persists the config and it's immediately live; there is no publish
  // step and no draft/published split. `saved` shows a brief confirmation and
  // clears the moment the user edits again.
  const [slug, setSlug] = useState<string | null>(null)
  // Identity for admin-only share slugs. The workspace ID, not the username: a slug is a string
  // anyone can type, and the public route enforces this same ID server-side.
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // The agent photo is the LIVE profile photo (profiles.profile_photo_url) — a
  // single source of truth shared with the nav avatar, public form, and every
  // client-facing signature. It's overlaid onto the preview only (below); it is
  // never written into the saved form config, so a Profile update shows here on
  // reload without re-uploading anything.
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null)
  // Which settings tab is open. The ONLY thing it changes is which preview renders on the left;
  // the panels, their order, the toolbar and Save are untouched.
  const [activeTab, setActiveTab] = useState<Tab>("branding")
  // Agent identity for the Thank You preview — the same profile row the editor already loads, so
  // no extra query. Phone is read for the signature; it is never submitted anywhere.
  const [agentIdentity, setAgentIdentity] = useState<{ name: string; brokerage: string; phone: string | null }>({
    name: "", brokerage: "", phone: null,
  })
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

      // THE WORKSPACE ID COMES FROM THE TABLE, NOT THE RPC.
      //
      // get_current_workspace() returns (slug, service_areas, primary_market) and NO id, so the
      // earlier `wsRow?.id` was always undefined — which left workspaceId null and made SharePanel
      // filter the admin-only slug out for EVERY account, including the one it belongs to.
      //
      // Resolved by SLUG rather than "whichever workspace RLS returns first": the Share panel's
      // links are built from that same slug, so this guarantees the button shown matches the URL
      // being copied. RLS ("members read their workspace") scopes the read to the caller's own
      // workspace, so it discloses nothing new. A workspace with no slug yet simply leaves this
      // null and the restricted entry stays hidden — fail-closed, as before.
      if (wsRow?.slug) {
        const { data: wsIdRow } = await supabase
          .from("workspaces")
          .select("id")
          .eq("slug", wsRow.slug)
          .maybeSingle()
        if (!active) return
        if (wsIdRow?.id) setWorkspaceId(wsIdRow.id as string)
      }

      const uid = userData?.user?.id
      let prof: {
        profile_photo_url?: string | null
        first_name?: string | null
        last_name?: string | null
        preferred_name?: string | null
        preferred_first_name?: string | null
        preferred_last_name?: string | null
        brokerage?: string | null
        phone_number?: string | null
        license_state?: string | null
      } | null = null
      if (uid) {
        const { data } = await supabase
          .from("profiles")
          .select("profile_photo_url, first_name, last_name, preferred_name, preferred_first_name, preferred_last_name, brokerage, phone_number, license_state")
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
          displayFullName({
            preferredFirst: prof?.preferred_first_name,
            preferredLast: prof?.preferred_last_name,
            legalFirst: prof?.first_name,
            legalLast: prof?.last_name,
          }) || (prof?.preferred_name ?? "").trim()
        setAgentIdentity({ name, brokerage: (prof?.brokerage ?? "").trim(), phone: prof?.phone_number ?? null })
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
    // Live edits behave exactly as before once loaded. Before that there is
    // nothing to edit — the settings panel is not rendered — so the guard only
    // protects the type, it never swallows a real keystroke.
    setConfig((prev) => (prev ? updater(prev) : prev))
    // Any edit clears the "Saved" confirmation so the button invites another save.
    setSaved(false)
  }

  // Preview config = the edited config with the LIVE profile photo overlaid for
  // the agent photo. The overlay is preview-only: `config` (what save persists)
  // never carries the photo, so profiles.profile_photo_url stays the one source.
  const previewConfig: SmartLeadFormConfig | null = config
    ? { ...config, branding: { ...config.branding, agentPhotoUrl: profilePhotoUrl } }
    : null

  async function save() {
    // Cannot persist a config that was never loaded — this would otherwise be the
    // one path that could overwrite a real saved form with template values.
    if (!config) return
    setSaving(true)
    setSaveError(null)
    // Normalized on the way OUT as well as on the way in. The agent can clear
    // the Consent Text box while editing — they have to, to retype it — and
    // that empty string would otherwise be what we persist. Running the same
    // merge used on load means the stored config is always a valid one, rather
    // than relying on every future reader to repair it.
    const { error } = await supabase.rpc("save_smart_form", { p_config: mergeSmartFormConfig(config) })
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
        onSave={save}
        saving={saving}
        saved={saved}
        saveError={saveError}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* justify-center now centres the preview truly (see PreviewFrame's
              transform-origin note). overflow-auto rather than overflow-y-auto so a
              narrow window scrolls to the preview's left edge instead of clipping
              it unreachably — the frame is shrink-0 to keep the scale accurate. */}
          <div className="flex flex-1 items-start justify-center overflow-auto p-8">
          <PreviewFrame>
            {!previewConfig ? (
              <PreviewSkeleton />
            ) : activeTab === "thankyou" ? (
              /* Same preview frame, same scaling, same responsive rules — only the page inside
                 changes. Switching to any other tab restores the form preview below. */
              <ThankYouPreview
                config={previewConfig}
                agentName={agentIdentity.name}
                brokerage={agentIdentity.brokerage}
                photoUrl={profilePhotoUrl}
                agentPhone={agentIdentity.phone}
              />
            ) : (
              <SmartLeadForm config={previewConfig} serviceAreaSlugs={serviceAreaSlugs} />
            )}
          </PreviewFrame>
        </div>

        <div className="w-[560px] shrink-0 overflow-hidden border-l border-[#e5e7ee] bg-white">
          {/* The panel edits the real config, so it waits for one. The column
              keeps its width and border, so nothing shifts when it appears. */}
          {config && (
            <SettingsPanel config={config} onChange={updateConfig} slug={slug} workspaceId={workspaceId} licenseState={licenseState} serviceAreaSlugs={serviceAreaSlugs} onTabChange={setActiveTab} />
          )}
        </div>
      </div>
    </div>
  )
}
