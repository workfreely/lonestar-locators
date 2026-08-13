"use client"

import { useState } from "react"

// The two DISTINCT steps of joining, rendered as two clearly-separated cards.
//   • STEP 1 — Join My Brokerage: calls /api/join/start (mints the referral intent
//     + sets the attribution cookie), then redirects to the sponsor's saved
//     brokerage_referral_url. NEVER falls back to Locator Beast signup. When the
//     sponsor has not configured a referral URL (hasReferralUrl=false) the button
//     is disabled with a clear "Referral link not configured yet" state.
//   • STEP 2 — Get Locator Beast: also sets the attribution cookie (so the
//     referring member stays attributed), then enters the existing signup flow.
//
// Attribution architecture is unchanged — both steps go through /api/join/start.
export default function JoinCtas({
  slug,
  hasReferralUrl,
  brokerageName,
}: {
  slug: string
  hasReferralUrl: boolean
  brokerageName: string
}) {
  const [busy, setBusy] = useState<null | "join" | "activate">(null)
  const [error, setError] = useState<string | null>(null)

  async function start(intent: "join" | "activate") {
    if (busy) return
    if (intent === "join" && !hasReferralUrl) return // primary requires a configured URL
    setBusy(intent)
    setError(null)
    try {
      const res = await fetch("/api/join/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      })
      if (!res.ok) throw new Error("start_failed")
      const data = (await res.json()) as { brokerageUrl?: string | null }

      if (intent === "join") {
        if (!data.brokerageUrl) {
          // Never fall back to signup on the primary path — surface it instead.
          setBusy(null)
          setError("This referral link isn't available right now. Please try again shortly.")
          return
        }
        window.location.href = data.brokerageUrl
      } else {
        window.location.href = "/signup"
      }
    } catch {
      setBusy(null)
      setError("Something went wrong. Please try again.")
    }
  }

  return (
    <div className="space-y-4">
      {/* STEP 1 — Join My Brokerage */}
      <div className="rounded-2xl border border-[#eef0f4] bg-[#f8f9fb] p-6 text-left">
        <div className="flex items-center gap-3">
          <StepBadge n={1} />
          <h3 className="text-[19px] font-bold leading-tight text-[#0b0f1a]">Step 1: Join My Brokerage</h3>
        </div>
        <p className="mt-3 text-[16px] leading-relaxed text-[#4b5563]">
          To become part of my network, you must join using my official {brokerageName} referral link
          below.
        </p>
        <button
          type="button"
          onClick={() => start("join")}
          disabled={busy !== null || !hasReferralUrl}
          aria-disabled={!hasReferralUrl}
          className="mt-4 w-full rounded-xl bg-[#2f6bff] px-6 py-3.5 text-[16px] font-semibold text-white shadow-[0_8px_24px_rgba(47,107,255,0.28)] transition-colors hover:bg-[#255ae0] disabled:cursor-not-allowed disabled:bg-[#c7ccd6] disabled:text-white disabled:shadow-none"
        >
          {busy === "join" ? "Starting…" : "Join My Brokerage"}
        </button>
        {!hasReferralUrl && (
          <p className="mt-3 flex items-center gap-2 text-[14px] font-medium text-[#6b7280]">
            <span className="inline-block h-2 w-2 flex-none rounded-full bg-[#d1a44a]" aria-hidden="true" />
            Referral link not configured yet.
          </p>
        )}
      </div>

      {/* STEP 2 — Get Locator Beast */}
      <div className="rounded-2xl border border-[#eef0f4] bg-[#f8f9fb] p-6 text-left">
        <div className="flex items-center gap-3">
          <StepBadge n={2} />
          <h3 className="text-[19px] font-bold leading-tight text-[#0b0f1a]">Step 2: Get Locator Beast</h3>
        </div>
        <p className="mt-3 text-[16px] leading-relaxed text-[#4b5563]">
          Already joined using my referral link? Create your Locator Beast account to request access.
        </p>
        <button
          type="button"
          onClick={() => start("activate")}
          disabled={busy !== null}
          className="mt-4 w-full rounded-xl bg-[#0b0f1a] px-6 py-3.5 text-[16px] font-semibold text-white transition-colors hover:bg-[#1c2333] disabled:opacity-60"
        >
          {busy === "activate" ? "Starting…" : "Get Access to Locator Beast"}
        </button>
      </div>

      {/* STEP 3 — Get Your Referral Link (informational, no button) */}
      <div className="rounded-2xl border border-[#eef0f4] bg-[#f8f9fb] p-6 text-left">
        <div className="flex items-center gap-3">
          <StepBadge n={3} />
          <h3 className="text-[19px] font-bold leading-tight text-[#0b0f1a]">Step 3: Get Your Referral Link</h3>
        </div>
        <p className="mt-3 text-[16px] leading-relaxed text-[#4b5563]">
          Once your membership is active, you&rsquo;ll get your own personal referral link in your Locator
          Beast CRM dashboard to invite other agents and give them free access to Locator Beast.
        </p>
      </div>

      {error && <p className="text-[14px] font-medium text-[#d14343]">{error}</p>}
    </div>
  )
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#2f6bff] text-[16px] font-bold text-white">
      {n}
    </span>
  )
}
