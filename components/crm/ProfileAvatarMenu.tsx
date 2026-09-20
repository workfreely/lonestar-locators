"use client"

import { useEffect, useRef, useState } from "react"
import { COMPANION_MSG_SOURCE } from "@/lib/companion/leadToDto"
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

// The dropdown is grouped into subtle sections (PROFILE / MARKETING TOOLS / ANALYTICS /
// SUPPORT & SETTINGS / ADMIN) — a visual organization only; every item keeps its EXACT
// destination and existing conditional visibility. Conditional rows: Theme (inline picker,
// only where a ThemeProvider exists, under PROFILE). The ADMIN section is platform-admin
// (owner) ONLY — gated on isOwner so regular agents AND non-owner network members never see
// the ADMIN heading or its items: Beast Social, Beast Referral Network (kept here for now —
// not yet rolled out to agents), and License Verification (/admin/license-verification).
// Item routes + server-side permissions are unchanged. Service Areas lives inside the Profile
// page and Connected Devices inside the Integrations page — not top-level items. "Sales
// Analytics" is the same /admin/analytics the top-nav opens.

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
  // Beast Network nav entry is shown only to network members (any status) and to
  // the platform owner — never to regular $99 customers. Resolved best-effort;
  // hidden on any error (incl. before the Beast Network migrations are applied).
  const [showNetwork, setShowNetwork] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
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
    let active = true
    ;(async () => {
      try {
        const [{ data: overview }, { data: admin }] = await Promise.all([
          supabase.rpc("lb_my_network_overview"),
          supabase.rpc("is_platform_admin"),
        ])
        const row = Array.isArray(overview) ? overview[0] : overview
        if (active) {
          // Beast Referral Network is visible to MEMBERS and the owner; License
          // Verification is owner-only. Two flags, because `admin` cannot be
          // recovered from showNetwork once they are OR-ed together.
          setShowNetwork(Boolean(row?.status) || Boolean(admin))
          setIsOwner(Boolean(admin))
        }
      } catch {
        if (active) {
          setShowNetwork(false)
          setIsOwner(false)
        }
      }
    })()
    return () => {
      active = false
    }
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
    // Tell Beast Companion to erase its locally-held client and property records
    // BEFORE the session goes away. The extension also self-heals via owner
    // binding and expiry, but signing out is the moment a locator expects their
    // client's screening data to be gone, so we say so explicitly.
    //
    // Same-origin post: the content-script bridge is the only listener, and it
    // ignores the message on any page that is not the authenticated CRM. Harmless
    // (and silently dropped) when the extension is not installed.
    try {
      window.postMessage({ source: COMPANION_MSG_SOURCE, type: "signed-out" }, window.location.origin)
    } catch {
      /* best-effort — never block sign-out on the Companion bridge */
    }
    await supabase.auth.signOut()
    router.push("/login")
  }

  // Borderless circular avatar — cleanly cropped (overflow-hidden + the img's
  // object-cover), no ring, no shadow, no halo. The bg fill only shows behind
  // the initials fallback; a photo covers the full circle. Size (44px) and
  // behavior unchanged. (The focus-visible ring is keyboard focus, not decoration.)
  const buttonCls = light
    ? "w-[44px] h-[44px] rounded-full bg-white flex items-center justify-center text-[#9098a8] overflow-hidden flex-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6bff] focus-visible:ring-offset-1"
    : "w-[44px] h-[44px] rounded-full bg-[var(--crm-inset)] flex items-center justify-center text-[var(--crm-text-muted)] overflow-hidden flex-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--crm-accent)] focus-visible:ring-offset-1"

  // overflow-hidden lets the full-width section bands meet the rounded panel edge cleanly.
  const panelCls = light
    ? "absolute right-0 top-full mt-2 w-60 bg-white border border-[#e5e7ee] rounded-xl shadow-[0_12px_32px_rgba(15,23,42,0.14)] py-1.5 z-50 overflow-hidden"
    : "absolute right-0 top-full mt-2 w-60 bg-[var(--crm-panel)] border border-[var(--crm-border)] rounded-xl shadow-[0_8px_24px_rgba(15,23,42,0.18)] py-1.5 z-50 overflow-hidden"

  const rowCls = light
    ? "text-[13px] font-medium text-[#111318] hover:bg-[#f4f5f8]"
    : "text-[13px] font-medium text-[var(--crm-text-primary)] hover:bg-[var(--crm-card)]"

  const linkCls = `block px-3.5 py-2 transition-colors ${rowCls}`

  const dividerCls = light ? "border-t border-[#eceef3] mt-1 pt-1" : "border-t border-[var(--crm-border-soft)] mt-1 pt-1"

  const signOutCls = light
    ? "w-full text-left px-3.5 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 transition-colors"
    : "w-full text-left px-3.5 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"

  const workspaceLabelCls = light ? "text-[#9098a8]" : "text-[var(--crm-text-muted)]"

  // Section header: a subtle, full-width darker band behind small uppercase muted text. The band
  // is a fixed neutral (black alpha) — NOT the theme accent — so it darkens consistently across
  // every workspace theme and leaves the accent reserved for row hover. `mt-1` keeps the gentle
  // gap between groups; `py-1.5` is the band's own height. Non-clickable (a plain div).
  const bandCls = light ? "bg-black/[0.05]" : "bg-black/25"
  const sectionCls = `mt-1 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider select-none ${bandCls} ${workspaceLabelCls}`

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
          <DefaultAvatar className="w-6 h-6" />
        )}
      </button>

      {open && (
        <div className={panelCls}>
          {/* ── PROFILE ── */}
          <div className={sectionCls}>Profile</div>
          <Link href="/admin/profile" onClick={() => setOpen(false)} className={linkCls}>Profile</Link>
          {/* Theme — inline workspace theme picker (instant feedback), moved under PROFILE.
              Behavior unchanged. Only shown where a ThemeProvider exists (i.e. inside the CRM). */}
          {theme && (
            <>
              <button
                type="button"
                onClick={() => setAppearanceOpen((s) => !s)}
                className={`w-full flex items-center justify-between gap-2 px-3.5 py-2 transition-colors ${rowCls}`}
              >
                Theme
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

          {/* ── MARKETING TOOLS ── */}
          <div className={sectionCls}>Marketing Tools</div>
          <Link href="/smart-lead-form" onClick={() => setOpen(false)} className={linkCls}>Smart Lead Form</Link>

          {/* ── ANALYTICS ── */}
          <div className={sectionCls}>Analytics</div>
          <Link href="/admin/analytics" onClick={() => setOpen(false)} className={linkCls}>Sales Analytics</Link>
          <Link href="/admin/settings" onClick={() => setOpen(false)} className={linkCls}>Sales Goals</Link>

          {/* ── SUPPORT & SETTINGS ── */}
          <div className={sectionCls}>Support &amp; Settings</div>
          <Link href="/admin/integrations" onClick={() => setOpen(false)} className={linkCls}>Integrations</Link>
          <Link href="/admin/import" onClick={() => setOpen(false)} className={linkCls}>Import Leads</Link>
          <Link href="/admin/billing" onClick={() => setOpen(false)} className={linkCls}>Billing</Link>
          <Link href="/help" onClick={() => setOpen(false)} className={linkCls}>Help Center</Link>

          {/* ── ADMIN ── platform-admin (owner) ONLY. Gated on isOwner, so regular agents AND
              non-owner network members never see the ADMIN heading or any of these three items. */}
          {isOwner && (
            <>
              <div className={sectionCls}>Admin</div>
              {/* Beast Social — platform-admin-only internal beta. UX shortcut only; the
                  /admin/social-autopilot layout, pages, APIs, RLS, and bucket all enforce
                  is_platform_admin() server-side. */}
              <Link href="/admin/social-autopilot" onClick={() => setOpen(false)} className={linkCls}>Social Beast</Link>
              {/* Security Beast — platform-admin-only. V1 is a visual/architecture admin surface;
                  the /admin/security page enforces is_platform_admin() server-side like the others. */}
              <Link href="/admin/security" onClick={() => setOpen(false)} className={linkCls}>Security Beast</Link>
              {/* Beast Referral Network — kept under ADMIN for now (not yet rolled out to agents).
                  showNetwork is always true for the owner; route/permissions unchanged. */}
              {showNetwork && (
                <Link href="/admin/network" onClick={() => setOpen(false)} className={linkCls}>Beast Referral Network</Link>
              )}
              {/* License Verification — platform owner ONLY; the /admin/license-verification page
                  and its RPCs enforce the same rule server-side. */}
              <Link href="/admin/license-verification" onClick={() => setOpen(false)} className={linkCls}>License Verification</Link>
            </>
          )}

          {/* Sign Out — visually separated at the bottom */}
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
