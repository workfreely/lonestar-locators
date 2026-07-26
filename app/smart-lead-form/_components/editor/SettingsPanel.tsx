"use client"

import { useState } from "react"
import type { SmartLeadFormConfig } from "../../_lib/types"
import SectionsPanel from "./panels/SectionsPanel"
import BrandingPanel from "./panels/BrandingPanel"
import ContentPanel from "./panels/ContentPanel"
import ConsentPanel from "./panels/ConsentPanel"
import SharePanel from "./panels/SharePanel"

type Tab = "sections" | "branding" | "content" | "consent" | "share"
type Updater = (updater: (prev: SmartLeadFormConfig) => SmartLeadFormConfig) => void

// Ordered to match the natural build workflow: brand the page, write the
// content, configure the form fields, set consent/privacy, then publish.
const TABS: { id: Tab; label: string }[] = [
  { id: "branding", label: "Branding" },
  { id: "content", label: "Content" },
  { id: "sections", label: "Sections" },
  { id: "consent", label: "Consent" },
  { id: "share", label: "Share" },
]

export default function SettingsPanel({ config, onChange }: { config: SmartLeadFormConfig; onChange: Updater }) {
  const [tab, setTab] = useState<Tab>("branding")

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 border-b border-[#e5e7ee] px-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`relative px-3 py-3.5 text-[13px] font-semibold transition-colors ${
              tab === t.id ? "text-[#111318]" : "text-[#9098a8] hover:text-[#4b5162]"
            }`}
          >
            {t.label}
            {tab === t.id && <span className="absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-[#2f6bff]" />}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-2">
        {tab === "sections" && <SectionsPanel config={config} onChange={onChange} />}
        {tab === "branding" && <BrandingPanel config={config} onChange={onChange} />}
        {tab === "content" && <ContentPanel config={config} onChange={onChange} />}
        {tab === "consent" && <ConsentPanel config={config} onChange={onChange} />}
        {tab === "share" && <SharePanel />}
      </div>
    </div>
  )
}
