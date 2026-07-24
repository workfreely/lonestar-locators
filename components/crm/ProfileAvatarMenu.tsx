"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import { useTheme } from "@/components/theme/ThemeProvider"
import type { ThemePreference } from "@/lib/theme"
import {
  readFirstContactPreference,
  writeFirstContactPreference,
  type FirstContactPreference,
} from "@/lib/preferences"

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

const CONTACT_OPTIONS: { value: FirstContactPreference; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "call", label: "Call" },
  { value: "ask", label: "Ask Each Time" },
]

function initialsFrom(email: string | null | undefined): string {
  if (!email) return "?"
  const local = email.split("@")[0]
  const parts = local.split(/[._-]/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return local.slice(0, 2).toUpperCase()
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-[var(--crm-border)]">
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={[
            "flex-1 py-1 px-1 text-[10.5px] font-semibold transition-colors whitespace-nowrap",
            i !== 0 ? "border-l border-[var(--crm-border)]" : "",
            value === opt.value
              ? "bg-blue-600 text-white"
              : "bg-[var(--crm-inset)] text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)]",
          ].join(" ")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3 h-3 text-[var(--crm-text-muted)] transition-transform duration-200 flex-none ${open ? "rotate-90" : ""}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

// Persistent profile/avatar control for the CRM application shell — mounted
// in both DashboardClient's and PerformanceClient's headers. Exposes
// Appearance (the Light/Dark/System theme setting) and the preferred
// first-contact method (Text/Call/Ask Each Time), both scaffolded inline
// here since neither has — or needs — a dedicated settings page yet.
export default function ProfileAvatarMenu() {
  const router = useRouter()
  const { preference, setPreference } = useTheme()

  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<"profile" | "appearance" | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [contactPref, setContactPref] = useState<FirstContactPreference>("text")
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setContactPref(readFirstContactPreference())
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null)
      setAvatarUrl((data.user?.user_metadata as { avatar_url?: string } | undefined)?.avatar_url ?? null)
    })
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
        setExpanded(null)
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  function updateContactPref(pref: FirstContactPreference) {
    setContactPref(pref)
    writeFirstContactPreference(pref)
  }

  return (
    <div className="relative flex-none" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-[12px] font-semibold overflow-hidden flex-none transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
        aria-label="Account menu"
        aria-expanded={open}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          initialsFrom(email)
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-[var(--crm-panel)] border border-[var(--crm-border)] rounded-xl shadow-[0_8px_24px_rgba(15,23,42,0.18)] py-1.5 z-50">
          {email && (
            <div className="px-3.5 py-2 border-b border-[var(--crm-border-soft)]">
              <p className="text-[12px] font-medium text-[var(--crm-text-primary)] truncate">{email}</p>
            </div>
          )}

          {/* Profile — preferred first-contact method lives here */}
          <button
            type="button"
            onClick={() => setExpanded((s) => (s === "profile" ? null : "profile"))}
            className="w-full flex items-center justify-between gap-2 px-3.5 py-2 text-[13px] font-medium text-[var(--crm-text-primary)] hover:bg-[var(--crm-card)] transition-colors"
          >
            Profile
            <ChevronIcon open={expanded === "profile"} />
          </button>
          {expanded === "profile" && (
            <div className="px-3.5 pb-2.5 pt-0.5">
              <p className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mb-1.5">
                First Contact Method
              </p>
              <SegmentedControl options={CONTACT_OPTIONS} value={contactPref} onChange={updateContactPref} />
            </div>
          )}

          {/* Appearance — the Light/Dark/System setting */}
          <button
            type="button"
            onClick={() => setExpanded((s) => (s === "appearance" ? null : "appearance"))}
            className="w-full flex items-center justify-between gap-2 px-3.5 py-2 text-[13px] font-medium text-[var(--crm-text-primary)] hover:bg-[var(--crm-card)] transition-colors"
          >
            Appearance
            <ChevronIcon open={expanded === "appearance"} />
          </button>
          {expanded === "appearance" && (
            <div className="px-3.5 pb-2.5 pt-0.5">
              <SegmentedControl options={THEME_OPTIONS} value={preference} onChange={setPreference} />
            </div>
          )}

          {/* Integrations — no destination yet, safely scaffolded */}
          <div className="px-3.5 py-2 text-[13px] font-medium text-[var(--crm-text-muted)] flex items-center justify-between cursor-default select-none">
            Integrations
            <span className="text-[9.5px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted)] bg-[var(--crm-inset)] px-1.5 py-0.5 rounded-full">
              Soon
            </span>
          </div>

          <div className="border-t border-[var(--crm-border-soft)] mt-1 pt-1">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full text-left px-3.5 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
