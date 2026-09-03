"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import AskBeastAI from "@/components/beast-ai/AskBeastAI"
import LocatorBeastWordmark from "@/components/brand/LocatorBeastWordmark"

// Dark Locator Beast chrome for the Help Center — the same header language as
// the CRM AppHeader (h-14, px-5, border-b, white wordmark) so the Help Center
// reads as part of the product, not a separate light doc site. Login-gated the
// same way the rest of the app is: shareable article URLs still require a
// session. The branded header renders immediately; only the content waits on the
// session check.
export default function HelpChrome({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return
      if (!session) {
        router.replace("/login")
        return
      }
      setReady(true)
    })
    return () => {
      active = false
    }
  }, [router])

  return (
    <>
      {/* Matches components/crm/AppHeader: h-14, px-5, border-b — same height,
          padding, and vertical alignment as every other Locator Beast page. */}
      <header className="flex h-14 flex-none items-center gap-4 border-b border-[var(--beast-border-dark)] bg-[var(--beast-panel-dark)] px-5">
        <Link href="/help" aria-label="Locator Beast Help Center" className="flex items-center">
          <LocatorBeastWordmark variant="white" height={28} priority />
        </Link>
        <Link
          href="/admin/leads"
          className="ml-auto text-[13px] font-medium text-white/70 transition-colors hover:text-white"
        >
          Back to Dashboard
        </Link>
      </header>

      {ready ? (
        <main className="flex-1">{children}</main>
      ) : (
        <div className="flex flex-1 items-center justify-center text-[13px] text-white/50">Loading…</div>
      )}

      {/* Ask Beast AI stays available on the Help Center too. */}
      <AskBeastAI />
    </>
  )
}
