"use client"

import { useState } from "react"
import { DEFAULT_CONFIG } from "../../_lib/defaultConfig"
import type { SmartLeadFormConfig } from "../../_lib/types"
import EditorToolbar from "./EditorToolbar"
import SettingsPanel from "./SettingsPanel"
import PreviewFrame from "../preview/PreviewFrame"
import SmartLeadForm from "../form/SmartLeadForm"

export default function SmartLeadFormEditor() {
  const [config, setConfig] = useState<SmartLeadFormConfig>(DEFAULT_CONFIG)
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile")

  function updateConfig(updater: (prev: SmartLeadFormConfig) => SmartLeadFormConfig) {
    setConfig(updater)
  }

  return (
    // Viewport-anchored (fixed inset-0), matching the Business Settings shell
    // (components/crm/settings/SettingsShell.tsx). This keeps the shared header
    // at the top-level shell — full width on the FIRST client-side navigation —
    // instead of inside the root layout's constrained <main> (max-width 1200 +
    // padding), whose presence depends on the root layout's server-decided
    // branch and never re-runs on client nav (which caused the clipping).
    <div className="fixed inset-0 z-30 flex flex-col overflow-hidden bg-[#f4f5f8]">
      <EditorToolbar device={device} onDeviceChange={setDevice} />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 items-start justify-center overflow-y-auto p-8">
          <PreviewFrame device={device}>
            <SmartLeadForm config={config} />
          </PreviewFrame>
        </div>

        <div className="w-[430px] shrink-0 overflow-hidden border-l border-[#e5e7ee] bg-white">
          <SettingsPanel config={config} onChange={updateConfig} />
        </div>
      </div>
    </div>
  )
}
