"use client"
// Module navigation — the tools within ONE Beast system (e.g. Property Intelligence:
// Overview | Properties | Images | Review | Sources | History). Reusable by any system:
// pass its base path and tab list. Visually subordinate to the main left nav. UX only.
import Link from "next/link"
import { usePathname } from "next/navigation"

export type ModTab = { label: string; slug: string } // slug "" = the module Overview

export default function ModNav({ base, tabs, label }: { base: string; tabs: ModTab[]; label: string }) {
  const pathname = usePathname() ?? base
  const active = (slug: string) => (slug === "" ? pathname === base : pathname === `${base}/${slug}` || pathname.startsWith(`${base}/${slug}/`))
  return (
    <nav className="modnav" aria-label={label}>
      {tabs.map((t) => (
        <Link key={t.slug} href={t.slug ? `${base}/${t.slug}` : base} className="modnav-item" aria-current={active(t.slug) ? "page" : undefined}>{t.label}</Link>
      ))}
    </nav>
  )
}
