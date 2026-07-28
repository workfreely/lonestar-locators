"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase/client"
import { useOptionalTheme } from "@/components/theme/ThemeProvider"
import type { CrmTheme } from "@/lib/theme"

const THEME_OPTIONS: { value: CrmTheme; label: string; swatch: string }[] = [
  { value: "midnight", label: "Midnight", swatch: "#2f6bff" },
  { value: "obsidian", label: "Obsidian", swatch: "#0d0e12" },
  { value: "rose", label: "Rose", swatch: "#e06a8c" },
  { value: "evergreen", label: "Evergreen", swatch: "#34c288" },
  { value: "purple", label: "Purple", swatch: "#a06bf0" },
]

// Default avatar placeholder shown whenever the user has no profile photo.
function DefaultAvatar({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  )
}

function ChevronIcon({ open, light }: { open: boolean; light: boolean }) {
  return (
    <svg
      className={`w-3 h-3 transition-transform duration-200 flex-none ${open ? "rotate-90" : ""} ${light ? "text-[#9098a8]" : "text-[var(--crm-text-muted)]"}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

// Navigation links (everything except Appearance, which stays an inline
// theme picker for instant visual feedback). Order per spec: Profile,
// Appearance, Smart Lead Form, Sales Goals, Integrations, Billing.
const LINKS_AFTER_APPEARANCE: { label: string; href: string }[] = [
  { label: "Smart Lead Form", href: "/smart-lead-form" },
  { label: "Sales Goals", href: "/admin/settings" },
  { label: "Integrations", href: "/admin/integrations" },
  { label: "Billing", href: "/admin/billing" },
]

// Persistent profile/avatar control mounted in the Dashboard & Performance
// headers (dark) and the Business Settings shell header (light). The dropdown
// is navigation, except Appearance which expands inline into the workspace
// theme picker so switching themes is immediate. `variant` selects dark
// (`--crm-*` tokens) vs light (literal hex, matching the white settings shell).
export default function ProfileAvatarMenu({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const router = useRouter()
  // Optional: the Smart Lead Form editor renders this menu outside any
  // ThemeProvider. When there's no provider we hide the Appearance picker
  // (the theme has no effect on that white page anyway) instead of crashing.
  const theme = useOptionalTheme()
  const light = variant === "light"

  const [open, setOpen] = useState(false)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user
      if (!user) return
      const { data: profile } = await supabase
        .from("profiles")
        .select("profile_photo_url")
        .eq("id", user.id)
        .single()
      setPhotoUrl(profile?.profile_photo_url ?? null)
    })
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
        setAppearanceOpen(false)
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  const buttonCls = light
    ? "w-8 h-8 rounded-full bg-white border border-[#e5e7ee] flex items-center justify-center text-[#9098a8] overflow-hidden flex-none transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6bff] focus-visible:ring-offset-1"
    : "w-8 h-8 rounded-full bg-[var(--crm-inset)] border border-[var(--crm-border)] flex items-center justify-center text-[var(--crm-text-muted)] overflow-hidden flex-none transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--crm-accent)] focus-visible:ring-offset-1"

  const panelCls = light
    ? "absolute right-0 top-full mt-2 w-60 bg-white border border-[#e5e7ee] rounded-xl shadow-[0_12px_32px_rgba(15,23,42,0.14)] py-1.5 z-50"
    : "absolute right-0 top-full mt-2 w-60 bg-[var(--crm-panel)] border border-[var(--crm-border)] rounded-xl shadow-[0_8px_24px_rgba(15,23,42,0.18)] py-1.5 z-50"

  const rowCls = light
    ? "text-[13px] font-medium text-[#111318] hover:bg-[#f4f5f8]"
    : "text-[13px] font-medium text-[var(--crm-text-primary)] hover:bg-[var(--crm-card)]"

  const linkCls = `block px-3.5 py-2 transition-colors ${rowCls}`

  const dividerCls = light ? "border-t border-[#eceef3] mt-1 pt-1" : "border-t border-[var(--crm-border-soft)] mt-1 pt-1"

  const signOutCls = light
    ? "w-full text-left px-3.5 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 transition-colors"
    : "w-full text-left px-3.5 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"

  const workspaceLabelCls = light ? "text-[#9098a8]" : "text-[var(--crm-text-muted)]"

  return (
    <div className="relative flex-none" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={buttonCls}
        aria-label="Account menu"
        aria-expanded={open}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <DefaultAvatar className="w-4 h-4" />
        )}
      </button>

      {open && (
        <div className={panelCls}>
          {/* Profile */}
          <Link href="/admin/profile" onClick={() => setOpen(false)} className={linkCls}>
            Profile
          </Link>

          {/* Appearance — inline workspace theme picker (instant feedback).
              Only shown where a ThemeProvider exists (i.e. inside the CRM). */}
          {theme && (
            <>
              <button
                type="button"
                onClick={() => setAppearanceOpen((s) => !s)}
                className={`w-full flex items-center justify-between gap-2 px-3.5 py-2 transition-colors ${rowCls}`}
              >
                Appearance
                <ChevronIcon open={appearanceOpen} light={light} />
              </button>
              {appearanceOpen && (
                <div className="px-3.5 pb-2.5 pt-1">
                  <p className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${workspaceLabelCls}`}>Workspace</p>
                  <div className="flex flex-wrap gap-1.5">
                    {THEME_OPTIONS.map((opt) => {
                      const active = theme.preference === opt.value
                      const pillCls = light
                        ? active
                          ? "bg-[#2f6bff] text-white border-[#2f6bff]"
                          : "border-[#e5e7ee] text-[#4b5162] hover:bg-[#f4f5f8]"
                        : active
                        ? "bg-[var(--crm-accent)] text-[var(--crm-accent-contrast)] border-[var(--crm-accent)]"
                        : "border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)] hover:bg-[var(--crm-card)]"
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => theme.setPreference(opt.value)}
                          aria-pressed={active}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${pillCls}`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-none"
                            style={{ background: opt.swatch, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)" }}
                          />
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Remaining navigation */}
          {LINKS_AFTER_APPEARANCE.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={linkCls}>
              {item.label}
            </Link>
          ))}

          <div className={dividerCls}>
            <button type="button" onClick={handleSignOut} className={signOutCls}>
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
