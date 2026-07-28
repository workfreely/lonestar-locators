"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Inter } from "next/font/google"
import LandingWrapper from "@/app/components/LandingWrapper"
import { supabase } from "@/lib/supabase/client"
import { ThemeProvider } from "@/components/theme/ThemeProvider"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        router.replace("/login")
        return
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", session.user.id)
        .single()

      if (profile && !profile.onboarding_completed) {
        router.replace("/onboarding")
        return
      }

      setLoading(false)
    }

    checkAuth()
  }, [router])

  if (loading) {
    return (
      <ThemeProvider>
        <div className="min-h-screen w-screen relative left-1/2 right-1/2 -mx-[50vw] flex items-center justify-center bg-[var(--crm-background)] text-[var(--crm-text-primary)]">
          Loading...
        </div>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      {/* Viewport-anchored (fixed inset-0) so the CRM header renders at the
          correct full width on the FIRST client-side navigation. The previous
          `w-screen … -mx-[50vw] -mt-6` full-bleed break-out depended on the
          root layout's constraining <main> (max-width 1200 + top padding) being
          present — but the root layout's branch is decided server-side at load
          and never re-runs on client nav, so arriving at the CRM from a page
          rendered under the other branch left `-mt-6` over-pulling and clipping
          the header. `fixed inset-0` removes that dependency entirely (no
          transformed ancestor, so it resolves to the viewport). Mirrors the
          Business Settings shell + Smart Lead Form editor. */}
      <div className={`${inter.className} fixed inset-0 z-30 overflow-hidden bg-[var(--crm-background)]`}>
        {/* Outer spacing */}
        <div className="h-full px-4 pt-0 pb-4">

          {/* Content */}
          <div className="h-full rounded-xl">
            {children}
          </div>

        </div>
      </div>
    </ThemeProvider>
  )
}