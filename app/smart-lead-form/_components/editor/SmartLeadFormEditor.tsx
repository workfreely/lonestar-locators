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
    <div className="flex h-screen flex-col bg-[#f4f5f8]">
      <EditorToolbar device={device} onDeviceChange={setDevice} onReset={() => setConfig(DEFAULT_CONFIG)} />

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
