"use client"

import { useState } from "react"
import type { AccessState } from "@/lib/billing/access"
import { MONTHLY_PRICE_USD, TRIAL_LENGTH_DAYS } from "@/lib/billing/trial"
import SettingsShell, { SettingsCard } from "@/components/crm/settings/SettingsShell"

function daysRemaining(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

function Row({ label, value, strong = false }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-[13px] text-[#6b7280]">{label}</span>
      <span className={`text-right text-[13.5px] ${strong ? "font-bold text-[#111318]" : "font-semibold text-[#111318]"}`}>{value}</span>
    </div>
  )
}

export default function BillingSettingsClient({
  access,
  trialStartedAt,
  trialEndsAt,
  subscriptionDetails,
}: {
  access: AccessState
  trialStartedAt: string | null
  trialEndsAt: string | null
  subscriptionDetails: { currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isTrialing = access.reason === "trialing"
  const isSubscribed = access.reason === "subscribed"
  const days = trialEndsAt ? daysRemaining(trialEndsAt) : 0

  const planStatusLabel = isSubscribed
    ? "Active Subscription"
    : isTrialing
    ? `${TRIAL_LENGTH_DAYS}-Day Free Trial`
    : access.reason === "trial_expired"
    ? "Trial ended"
    : "No active plan"

  async function upgrade() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" })
      const json = await res.json()
      if (json.url) {
        window.location.href = json.url
        return
      }
      setError("Couldn't start checkout. Please try again.")
    } catch {
      setError("Couldn't start checkout. Please try again.")
    }
    setLoading(false)
  }

  return (
    <SettingsShell title="Billing" description="Manage your Locator Beast subscription, trial, and payment details.">
      {/* Trial banner */}
      {isTrialing && (
        <div className="flex items-center gap-3 rounded-2xl border border-[#dbe6ff] bg-[#eef3ff] px-4 py-3">
          <span className="text-[18px]">🎉</span>
          <p className="text-[13.5px] leading-snug text-[#26324a]">
            You&apos;re on a {TRIAL_LENGTH_DAYS}-day free trial — <span className="font-bold">{days} days remaining</span>. Upgrade anytime to continue without interruption.
          </p>
        </div>
      )}

      {/* Current Plan */}
      <SettingsCard title="Current Plan">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[15px] font-bold text-[#111318]">Locator Beast Beta</p>
            <p className="mt-0.5 text-[12.5px] text-[#6b7280]">{planStatusLabel}</p>
          </div>
          <span
            className={[
              "flex-none rounded-full px-3 py-1 text-[11.5px] font-semibold",
              isSubscribed ? "bg-emerald-50 text-emerald-700" : isTrialing ? "bg-[#eef3ff] text-[#2f6bff]" : "bg-[#f4f5f8] text-[#6b7280]",
            ].join(" ")}
          >
            {isSubscribed ? "Active" : isTrialing ? "Free Trial" : "Inactive"}
          </span>
        </div>

        {(isTrialing || access.reason === "trial_expired" || access.reason === "no_subscription") && (
          <div className="mt-5 border-t border-[#eceef3] pt-4">
            <button
              type="button"
              onClick={upgrade}
              disabled={loading}
              className="rounded-lg bg-[#2f6bff] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#265fe0] disabled:opacity-60"
            >
              {loading ? "Redirecting…" : "Upgrade Now"}
            </button>
            <p className="mt-2 text-[12px] text-[#9098a8]">
              Subscribe now to continue without interruption — ${MONTHLY_PRICE_USD}/month, cancel anytime.
            </p>
            {error && <p className="mt-2 text-[12px] font-medium text-red-600">{error}</p>}
          </div>
        )}
      </SettingsCard>

      {/* Trial Status */}
      {(trialStartedAt || trialEndsAt) && (
        <SettingsCard title="Trial Status">
          <Row label="Trial Start Date" value={formatDate(trialStartedAt)} />
          <div className="border-t border-[#eceef3]" />
          <Row label="Trial End Date" value={formatDate(trialEndsAt)} />
          <div className="border-t border-[#eceef3]" />
          <Row label="Days Remaining" value={isTrialing ? `${days} days remaining` : "Trial ended"} strong />
        </SettingsCard>
      )}

      {/* Subscription — when active */}
      {isSubscribed && (
        <SettingsCard title="Subscription">
          <Row label="Monthly Price" value={`$${MONTHLY_PRICE_USD}/month`} />
          <div className="border-t border-[#eceef3]" />
          <Row label="Next Billing Date" value={formatDate(subscriptionDetails?.currentPeriodEnd ?? null)} />
        </SettingsCard>
      )}

      {/* Payment Method — placeholder */}
      <SettingsCard title="Payment Method">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[13.5px] text-[#6b7280]">No card on file.</p>
          <button
            type="button"
            disabled
            className="flex-none cursor-not-allowed rounded-lg border border-[#e5e7ee] bg-[#f4f5f8] px-4 py-2 text-[13px] font-semibold text-[#9098a8]"
          >
            Update Payment Method
          </button>
        </div>
      </SettingsCard>

      {/* Billing History — placeholder */}
      <SettingsCard title="Billing History">
        <p className="text-[13px] text-[#9098a8]">Previous invoices, payment history, and downloadable receipts will appear here.</p>
      </SettingsCard>
    </SettingsShell>
  )
}
