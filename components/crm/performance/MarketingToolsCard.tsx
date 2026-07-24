"use client"

import { useState } from "react"
import CollapsibleSection from "@/components/crm/CollapsibleSection"

// Central list of marketing links. Add new rows here as they're needed
// (Apartment Search, Luxury Apartments, Second Chance, Buy New Home,
// city-specific campaigns, QR codes, etc.) — each entry renders as its
// own row with no other changes required.
const MARKETING_LINKS: { label: string; url: string }[] = [
  { label: "Instagram", url: "https://www.lonestarlocators.app/get-my-list?utm_source=instagram&utm_medium=organic_social" },
  { label: "TikTok", url: "https://www.lonestarlocators.app/get-my-list?utm_source=tiktok&utm_medium=organic_social" },
  { label: "Facebook", url: "https://www.lonestarlocators.app/get-my-list?utm_source=facebook&utm_medium=organic_social" },
  { label: "YouTube", url: "https://www.lonestarlocators.app/get-my-list?utm_source=youtube&utm_medium=organic_social" },
]

export default function MarketingToolsCard() {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  async function handleCopy(url: string) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        const ta = document.createElement("textarea")
        ta.value = url
        document.body.appendChild(ta)
        ta.select()
        document.execCommand("copy")
        document.body.removeChild(ta)
      }
      setCopiedUrl(url)
      setTimeout(() => setCopiedUrl((current) => (current === url ? null : current)), 2000)
    } catch (err) {
      console.error("Copy failed:", err)
    }
  }

  return (
    <CollapsibleSection title="Marketing Tools" storageKey="marketing-tools-expanded" defaultOpen={false}>
      <div className="p-4">
        {MARKETING_LINKS.map((link) => (
          <div
            key={link.label}
            className="flex items-center gap-4 py-3 border-b border-[var(--crm-border-soft)] last:border-0"
          >
            <span className="w-24 flex-none font-semibold text-[var(--crm-text-primary)] text-sm">
              {link.label}
            </span>
            <span className="flex-1 min-w-0 truncate font-mono text-xs text-[var(--crm-text-secondary)]">
              {link.url}
            </span>
            <button
              type="button"
              onClick={() => handleCopy(link.url)}
              className={[
                "flex-none text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors",
                copiedUrl === link.url
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-[var(--crm-panel)] text-[var(--crm-text-secondary)] border-[var(--crm-border)] hover:bg-[var(--crm-card)]",
              ].join(" ")}
            >
              {copiedUrl === link.url ? "✓ Copied" : "Copy"}
            </button>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  )
}
