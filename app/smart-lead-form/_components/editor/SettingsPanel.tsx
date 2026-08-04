"use client"

import { useState } from "react"
import type { SmartLeadFormConfig } from "../../_lib/types"
import BrandingPanel from "./panels/BrandingPanel"
import ContentPanel from "./panels/ContentPanel"
import FieldsPanel from "./panels/FieldsPanel"
import ConsentPanel from "./panels/ConsentPanel"
import SharePanel from "./panels/SharePanel"

type Tab = "branding" | "content" | "fields" | "consent" | "share"
type Updater = (updater: (prev: SmartLeadFormConfig) => SmartLeadFormConfig) => void

// Ordered to match the natural build workflow: brand the page, write the
// content (section show/hide now lives here too), configure the form fields,
// set consent/privacy, then publish.
const TABS: { id: Tab; label: string }[] = [
  { id: "branding", label: "Branding" },
  { id: "content", label: "Content" },
  { id: "fields", label: "Fields" },
  { id: "consent", label: "Consent" },
  { id: "share", label: "Share" },
]

export default function SettingsPanel({
  config,
  onChange,
  slug,
}: {
  config: SmartLeadFormConfig
  onChange: Updater
  slug: string | null
}) {
  const [tab, setTab] = useState<Tab>("branding")

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar shares the panel's 24px gutter (px-6): the first tab label sits
          on the same left grid line as the content below. Tabs carry no
          horizontal padding — they're spaced with gap-6 — so nothing drifts off
          the grid, and the last tab keeps the full 24px right gutter. */}
      <div className="flex shrink-0 gap-6 border-b border-[#e5e7ee] px-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`relative py-3.5 text-[13px] font-semibold transition-colors ${
              tab === t.id ? "text-[#111318]" : "text-[#9098a8] hover:text-[#4b5162]"
            }`}
          >
            {t.label}
            {tab === t.id && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-[#2f6bff]" />}
          </button>
        ))}
      </div>
      {/* Left gutter stays 24px (aligns with the tab bar); the right gutter is a
          touch wider (pr-8 ≈ 32px) so switches and right-aligned controls sit
          comfortably inside the content column instead of hugging the edge.
          Intentionally asymmetric — visual balance, not mathematical symmetry. */}
      <div className="flex-1 overflow-y-auto pb-4 pl-6 pr-8 pt-4">
        {tab === "branding" && <BrandingPanel config={config} onChange={onChange} />}
        {tab === "content" && <ContentPanel config={config} onChange={onChange} />}
        {tab === "fields" && <FieldsPanel config={config} onChange={onChange} />}
        {tab === "consent" && <ConsentPanel config={config} onChange={onChange} />}
        {tab === "share" && <SharePanel slug={slug} />}
      </div>
    </div>
  )
}
