import Link from "next/link"
import { HiOutlineArrowLeft } from "react-icons/hi2"

// The ONE back-to-dashboard control for every authenticated shell.
//
// The same destination previously appeared three ways: "← Back to Dashboard" with a
// text arrow on the dark CRM pages (duplicated verbatim in two files) and "Dashboard"
// with an icon on the light settings shell. Same target, three renderings.
//
// One label, one icon, and ONE pill shape everywhere — the dark pages previously
// used the generic CRM_SECONDARY_BUTTON (rounded-lg, px-5 py-2.5, text-sm), which
// read as a different control from the settings pill. Both variants now share the
// same geometry; only the surface colours differ, matching how AppHeader already
// handles dark vs light.
const PILL = "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"

export default function BackToDashboard({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const className =
    variant === "light"
      ? `${PILL} border border-[#e5e7ee] text-[#4b5162] hover:bg-[#f4f5f8]`
      : `${PILL} border border-[var(--crm-border)] bg-[var(--crm-panel)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] hover:text-[var(--crm-text-primary)]`

  return (
    <Link href="/admin/leads" className={className}>
      <HiOutlineArrowLeft className="h-4 w-4 shrink-0" />
      Back to Dashboard
    </Link>
  )
}
