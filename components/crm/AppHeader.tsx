"use client"

import Logo from "@/components/crm/Logo"
import ProfileAvatarMenu from "@/components/crm/ProfileAvatarMenu"

// The single shared application header for EVERY authenticated page (CRM
// dashboard, Performance, Business Settings, Smart Lead Form). Identical
// height, logo, padding, vertical alignment, border/shadow, and spacing
// everywhere — the CRM dashboard is the design reference. The ONLY thing that
// differs per page is the middle set of controls (passed as `children`); the
// Locator Beast logo (left) and the profile avatar (right) are always present
// and identical. `variant` adapts only the colors (dark CRM tokens vs the
// white settings/Smart-Lead-Form surface). Fixed `h-14` so the height never
// depends on how tall a given page's controls happen to be.
export default function AppHeader({
  variant = "dark",
  zClass = "z-30",
  fullBleed = false,
  children,
  forceDarkSurface = false,
}: {
  variant?: "dark" | "light"
  zClass?: string
  /** Break out of the admin layout's `px-4` inset so the bar spans edge to edge.
   *  Pages inside app/admin/layout.tsx need this; shells that anchor themselves with
   *  their own `fixed inset-0` (SettingsShell) already span the full width. Owning it
   *  here keeps the one negative margin in a single place instead of three copies. */
  fullBleed?: boolean
  children?: React.ReactNode
  /** Adds the `dark` class to the header ELEMENT so its own --crm-* tokens
   *  resolve dark, for surfaces that sit outside ThemeProvider (the Smart Lead
   *  Form editor). Never set this on an /admin page: those already carry the
   *  user's chosen theme on <html>, and forcing `dark` here would override that
   *  theme for the header — a theme change, which this checkpoint must not make. */
  forceDarkSurface?: boolean
}) {
  const surface =
    variant === "light"
      ? "bg-white border-[#e5e7ee] shadow-[0_1px_3px_rgba(15,23,42,0.05)]"
      : "bg-[var(--crm-panel)] border-[var(--crm-border)] shadow-[0_1px_3px_rgba(var(--crm-shadow-color),0.06)]"

  return (
    <header
      className={`crm-header relative ${zClass} flex-none flex h-14 items-center gap-4 border-b px-5 ${
        fullBleed ? "-mx-4" : ""
      } ${forceDarkSurface ? "dark" : ""} ${surface}`}
    >
      <Logo tone={variant} mark="beast" />
      <div className="ml-auto flex items-center gap-2">
        {children}
        <ProfileAvatarMenu variant={variant} />
      </div>
    </header>
  )
}
