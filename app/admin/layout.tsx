"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Inter } from "next/font/google"
import LandingWrapper from "@/app/components/LandingWrapper"
import { supabase } from "@/lib/supabase/client"

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
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    )
  }

  return (
    <div
      className={`${inter.className} w-screen relative left-1/2 right-1/2 -mx-[50vw] bg-gray-50`}
    >
      {/* Outer spacing */}
      <div className="px-6 lg:px-10 pt-0 pb-4">

        {/* Main container */}
        <div className="w-full max-w-[1700px] mx-auto h-[calc(100vh-80px)]">

          {/* Content */}
          <div className="h-full rounded-xl">
            {children}
          </div>

        </div>
      </div>
    </div>
  )
}