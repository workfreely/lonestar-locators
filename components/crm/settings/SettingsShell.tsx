"use client"

import Link from "next/link"
import { HiOutlineArrowLeft } from "react-icons/hi2"
import AppHeader from "@/components/crm/AppHeader"

// Shared white shell for every Business Settings destination. Matches the
// Smart Lead Form editor's light aesthetic with literal hex (NOT the dark
// `--crm-*` tokens the /admin ThemeProvider applies), so these pages stay
// white regardless of the selected CRM theme. The profile dropdown in the
// header is the only settings navigation — each page is its own destination.

// ── Shared white input + card styling, exported for every settings page ──
export const settingsInputCls =
  "w-full rounded-xl border border-[#e5e7ee] bg-white px-3.5 py-2.5 text-[14px] text-[#111318] outline-none transition-colors placeholder:text-[#9098a8] focus:border-[#2f6bff]"

export const settingsLabelCls = "text-[12.5px] font-semibold text-[#4b5162]"
export const settingsHintCls = "text-[12px] text-[#9098a8]"

export function SettingsCard({
  title,
  description,
  children,
  className = "",
}: {
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-2xl border border-[#e5e7ee] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-24px_rgba(15,23,42,0.35)] ${className}`}>
      {title && <h2 className="text-[15px] font-semibold text-[#111318]">{title}</h2>}
      {description && <p className="mt-1 text-[13px] leading-relaxed text-[#6b7280]">{description}</p>}
      {(title || description) && <div className="mt-5">{children}</div>}
      {!title && !description && children}
    </div>
  )
}

export function SettingsField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className={settingsLabelCls}>{label}</label>
      {children}
      {hint && <p className={settingsHintCls}>{hint}</p>}
    </div>
  )
}

// The Business Settings / Smart Lead Form header is just the shared `AppHeader`
// (variant="light"), so it's byte-for-byte identical to the CRM header (same
// height, logo, padding, alignment, border/shadow) — AppHeader supplies the
// Locator Beast logo and the profile avatar. This wrapper only injects the
// page-specific middle controls: the `Dashboard` link, then any `children`
// (the Smart Lead Form's device toggle / Publish).
export function SettingsHeader({ children }: { children?: React.ReactNode }) {
  return (
    <AppHeader variant="light">
      <Link
        href="/admin/leads"
        className="flex items-center gap-1.5 rounded-full border border-[#e5e7ee] px-3.5 py-2 text-[13px] font-semibold text-[#4b5162] transition-colors hover:bg-[#f4f5f8]"
      >
        <HiOutlineArrowLeft className="h-4 w-4" />
        Dashboard
      </Link>
      {children}
    </AppHeader>
  )
}

export default function SettingsShell({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    // Viewport-anchored (fixed inset-0) so the header always spans the full
    // width and height on the FIRST client-side navigation — it never depends
    // on the admin layout's full-bleed break-out / height chain being
    // remeasured, which previously left the header collapsed until a refresh.
    <div className="fixed inset-0 z-30 flex flex-col overflow-hidden bg-[#f4f5f8] font-[var(--font-inter,inherit)]">
      <SettingsHeader />

      {/* Workspace */}
      <div className="flex-1 overflow-y-auto px-5 py-8">
        <div className="mx-auto w-full max-w-3xl space-y-5">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight text-[#111318]">{title}</h1>
            {description && <p className="mt-1 text-[13.5px] leading-relaxed text-[#6b7280]">{description}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
