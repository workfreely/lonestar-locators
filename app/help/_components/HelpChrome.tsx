"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import AskBeastAI from "@/components/beast-ai/AskBeastAI"
import Logo from "@/components/crm/Logo"
import BackToDashboard from "@/components/crm/BackToDashboard"

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
      {/* Matches components/crm/AppHeader exactly: h-14, gap-4, px-5, border-b,
          the shared <Logo> (same wordmark + HEADER_LOGO_OFFSET alignment), and the
          shared <BackToDashboard> pill. `dark` makes BackToDashboard's --crm-*
          tokens resolve to their dark values here (the same mechanism AppHeader's
          forceDarkSurface uses on surfaces outside the CRM ThemeProvider). */}
      <header className="dark flex h-14 flex-none items-center gap-4 border-b border-[var(--beast-border-dark)] bg-[var(--beast-panel-dark)] px-5">
        <Logo tone="dark" mark="beast" />
        <div className="ml-auto flex items-center">
          <BackToDashboard variant="dark" />
        </div>
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
