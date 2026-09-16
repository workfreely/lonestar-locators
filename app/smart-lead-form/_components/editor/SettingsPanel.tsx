"use client"

import { useState } from "react"
import type { SmartLeadFormConfig } from "../../_lib/types"
import BrandingPanel from "./panels/BrandingPanel"
import ContentPanel from "./panels/ContentPanel"
import FieldsPanel from "./panels/FieldsPanel"
import ThankYouPanel from "./panels/ThankYouPanel"
import SharePanel from "./panels/SharePanel"

type Tab = "branding" | "content" | "fields" | "thankyou" | "share"
type Updater = (updater: (prev: SmartLeadFormConfig) => SmartLeadFormConfig) => void

// Ordered to match the natural build workflow: brand the page, write the
// content (section show/hide and the consent wording now live here too),
// configure the form fields, then publish.
//
// Consent is no longer a tab. It was one editable string plus an on/off switch;
// the switch is gone (consent is required on every public form) and the wording
// moved into Content beside the other legal copy.
const TABS: { id: Tab; label: string }[] = [
  { id: "branding", label: "Branding" },
  { id: "content", label: "Content" },
  { id: "fields", label: "Fields" },
  { id: "thankyou", label: "Thank You Page" },
  { id: "share", label: "Share Form" },
]

export default function SettingsPanel({
  config,
  onChange,
  slug,
  licenseState,
}: {
  config: SmartLeadFormConfig
  onChange: Updater
  slug: string | null;
  /** profiles.license_state — gates the Texas-only disclosure fields. */
  licenseState?: string | null
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
      {/* THE scrolling container for every tab — Branding, Content, Fields and
          Share all render inside it, so spacing rules belong here and never in
          an individual tab.
          Left gutter stays 24px (aligns with the tab bar); the right gutter is a
          touch wider (pr-8 ≈ 32px) so switches and right-aligned controls sit
          comfortably inside the content column instead of hugging the edge.
          Intentionally asymmetric — visual balance, not mathematical symmetry.
          The bottom padding clears the floating Ask Beast AI button, which is
          fixed at bottom-5 right-5 (20px inset + ~41px tall ≈ 61px) directly
          over this panel. pb-24 (96px) lets the last control scroll fully above
          it and still leaves ~35px of breathing room, instead of stopping flush
          against the button. It is padding on the scroller itself, so it adds
          real scrollable distance rather than just making the page taller. */}
      <div className="flex-1 overflow-y-auto pb-24 pl-6 pr-8 pt-4">
        {tab === "branding" && <BrandingPanel config={config} onChange={onChange} />}
        {tab === "content" && <ContentPanel config={config} onChange={onChange} licenseState={licenseState} />}
        {tab === "fields" && <FieldsPanel config={config} onChange={onChange} />}
        {tab === "thankyou" && <ThankYouPanel config={config} onChange={onChange} />}
        {tab === "share" && <SharePanel slug={slug} />}
      </div>
    </div>
  )
}
