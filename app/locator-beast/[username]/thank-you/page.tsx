import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type PublicForm = {
  agent_name: string
  brokerage_name: string | null
  photo_url: string | null
}

// Post-submit confirmation for a per-agent Smart Lead Form, served at
// locatorbeast.com/{username}/thank-you.
//
// This exists because the form previously redirected to /thank-you, which is a
// Lone Star Locators page (its own logo, nav and video). Every Locator Beast
// agent's prospect was being handed to a different company's site. Nesting the
// route under the agent's own slug keeps the renter on the URL they already
// trust and lets the page name the agent who will actually contact them.
//
// Identity resolves through the SAME public resolver the form itself uses, so
// nothing private is exposed and the name/photo can never drift from the form.
export default async function SmartLeadFormThankYouPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>
  searchParams: Promise<{ firstName?: string; city?: string }>
}) {
  const { username } = await params
  const { firstName, city } = await searchParams

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("lb_resolve_public_form", { p_username: username })
  const form = (Array.isArray(data) ? data[0] : data) as PublicForm | undefined
  // Same rule as the form page: an unknown slug is a 404, nothing else is.
  if (error || !form) notFound()

  const name = (firstName ?? "").trim()
  const where = (city ?? "").trim()
  const agentFirst = (form.agent_name ?? "").trim().split(/\s+/)[0] || "your locator"
  const initials = (form.agent_name ?? "")
    .split(/\s+/)
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <main className="mx-auto w-full max-w-xl px-5 py-16 sm:py-24">
      <div className="rounded-2xl border border-[#e5e7ee] bg-white p-7 text-center sm:p-10">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#e7f6ef]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0f9d58" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>

        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#111318] sm:text-[30px]">
          {name ? `Thanks, ${name}!` : "Thanks — we got it!"}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[#4b5162]">
          Your request{where ? ` for ${where}` : ""} is in. {agentFirst} is reviewing your budget,
          move date and preferred areas, and will reach out shortly with options.
        </p>

        {/* Naming the person who will call is the point of this page — it is what
            the Lone Star page could never do. */}
        <div className="mt-7 flex items-center justify-center gap-3 border-t border-[#eef0f5] pt-6">
          <div className="h-11 w-11 flex-none overflow-hidden rounded-full border border-[#e5e7ee] bg-[#f4f5f8]">
            {form.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.photo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[13px] font-semibold text-[#9098a8]">
                {initials || "—"}
              </div>
            )}
          </div>
          <div className="text-left">
            <p className="text-[14px] font-semibold text-[#111318]">{form.agent_name}</p>
            <p className="text-[12.5px] text-[#6b7280]">
              {form.brokerage_name ? form.brokerage_name : "Your apartment locator"}
            </p>
          </div>
        </div>

        <p className="mt-6 text-[12.5px] text-[#9098a8]">
          Keep an eye on your email — a confirmation with your search details is on its way.
        </p>
      </div>
    </main>
  )
}
