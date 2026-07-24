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
      <div
        className={`${inter.className} w-screen relative left-1/2 right-1/2 -mx-[50vw] -mt-6 bg-[var(--crm-background)]`}
      >
        {/* Outer spacing */}
        <div className="px-4 pt-0 pb-4">

          {/* Main container */}
          <div className="w-full h-[calc(100vh-80px)]">

            {/* Content */}
            <div className="h-full rounded-xl">
              {children}
            </div>

          </div>
        </div>
      </div>
    </ThemeProvider>
  )
}