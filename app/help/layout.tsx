"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import AskBeastAI from "@/components/beast-ai/AskBeastAI"

// The Help Center is for signed-in Locator Beast members only. Articles have
// direct, shareable URLs, but opening one still requires a session — same auth
// gate the rest of the app uses. Not a public/marketing surface.
export default function HelpLayout({ children }: { children: React.ReactNode }) {
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

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f8fb] text-[13px] text-[#6b7280]">
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f7f8fb] text-[#111318]">
      <header className="border-b border-[#e5e7ee] bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
          <Link href="/help" className="text-[14px] font-bold tracking-tight text-[#111318]">
            Locator Beast Help Center
          </Link>
          <Link href="/admin/leads" className="text-[13px] font-medium text-[#4b5162] hover:text-[#111318]">
            Back to Locator Beast
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-8">{children}</main>
      {/* Ask Beast AI stays available on the Help Center too. */}
      <AskBeastAI />
    </div>
  )
}
