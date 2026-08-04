"use client"

import { useState } from "react"
import type { AccessState } from "@/lib/billing/access"
import { MONTHLY_PRICE_USD, TRIAL_LENGTH_DAYS } from "@/lib/billing/trial"
import SettingsShell, { SettingsCard } from "@/components/crm/settings/SettingsShell"

export type PaymentMethod = { brand: string; last4: string; expMonth: number; expYear: number }
export type Invoice = { id: string; amount: number; date: string; url: string | null; status: string }

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

// Each access state maps to a plain-English label, a status pill, and which
// actions are offered. Centralized so adding a state (or plan) later is a
// one-place change and the UI stays consistent.
type StatusPill = { text: string; className: string }

export default function BillingSettingsClient({
  access,
  trialStartedAt,
  trialEndsAt,
  subscriptionDetails,
  paymentMethod,
  invoices,
  hasStripeCustomer,
}: {
  access: AccessState
  trialStartedAt: string | null
  trialEndsAt: string | null
  subscriptionDetails: { currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null
  paymentMethod: PaymentMethod | null
  invoices: Invoice[]
  hasStripeCustomer: boolean
}) {
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reason = access.reason
  const isTrialing = reason === "trialing"
  const isSubscribed = reason === "subscribed"
  const isPastDue = reason === "past_due"
  const isCanceled = reason === "canceled"
  const isExpired = reason === "trial_expired"
  const days = trialEndsAt ? daysRemaining(trialEndsAt) : 0
  const cancelsAtPeriodEnd = Boolean(subscriptionDetails?.cancelAtPeriodEnd)

  // Subscribe (new/reactivated subscription) is the path when there's no live
  // subscription. Manage Billing (Stripe portal) is the path once a Stripe
  // customer exists — it covers payment updates, invoices, cancel & reactivate.
  const showSubscribe = isTrialing || isExpired || isCanceled || reason === "no_subscription"
  const showManageBilling = hasStripeCustomer && (isSubscribed || isPastDue || isCanceled)

  const planStatusPill: StatusPill = isSubscribed
    ? cancelsAtPeriodEnd
      ? { text: "Cancels soon", className: "bg-amber-50 text-amber-700" }
      : { text: "Active", className: "bg-emerald-50 text-emerald-700" }
    : isTrialing
    ? { text: "Free Trial", className: "bg-[#eef3ff] text-[#2f6bff]" }
    : isPastDue
    ? { text: "Past Due", className: "bg-red-50 text-red-600" }
    : isCanceled
    ? { text: "Canceled", className: "bg-[#f4f5f8] text-[#6b7280]" }
    : isExpired
    ? { text: "Trial Ended", className: "bg-[#f4f5f8] text-[#6b7280]" }
    : { text: "Inactive", className: "bg-[#f4f5f8] text-[#6b7280]" }

  const planStatusLabel = isSubscribed
    ? cancelsAtPeriodEnd
      ? "Active — cancels at period end"
      : "Active subscription"
    : isTrialing
    ? `${TRIAL_LENGTH_DAYS}-day free trial`
    : isPastDue
    ? "Payment past due"
    : isCanceled
    ? "Subscription canceled"
    : isExpired
    ? "Trial ended"
    : "No active plan"

  const subscribeCta = isCanceled ? "Reactivate Subscription" : isTrialing ? "Upgrade Now" : "Subscribe Now"

  async function subscribe() {
    setLoading("checkout")
    setError(null)
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" })
      const json = await res.json()
      if (json.url) {
        window.location.href = json.url
        return
      }
      setError(json.error ?? "Couldn't start checkout. Please try again.")
    } catch {
      setError("Couldn't start checkout. Please try again.")
    }
    setLoading(null)
  }

  async function manageBilling() {
    setLoading("portal")
    setError(null)
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" })
      const json = await res.json()
      if (json.url) {
        window.location.href = json.url
        return
      }
      setError(json.error ?? "The billing portal isn't available right now. Please try again shortly.")
    } catch {
      setError("The billing portal isn't available right now. Please try again shortly.")
    }
    setLoading(null)
  }

  return (
    <SettingsShell title="Billing" description="Manage your Locator Beast subscription, trial, and payment details.">
      {/* Trial banner with countdown */}
      {isTrialing && (
        <div className="flex items-center gap-3 rounded-2xl border border-[#dbe6ff] bg-[#eef3ff] px-4 py-3">
          <span className="text-[18px]">🎉</span>
          <p className="text-[13.5px] leading-snug text-[#26324a]">
            You&apos;re on a {TRIAL_LENGTH_DAYS}-day free trial —{" "}
            <span className="font-bold">
              {days} {days === 1 ? "day" : "days"} left
            </span>
            . Subscribe anytime to continue without interruption.
          </p>
        </div>
      )}

      {/* Past-due / canceled attention banner */}
      {(isPastDue || isCanceled || isExpired) && (
        <div className="flex items-center gap-3 rounded-2xl border border-[#f6d9d9] bg-[#fdf1f1] px-4 py-3">
          <span className="text-[18px]">⚠️</span>
          <p className="text-[13.5px] leading-snug text-[#7a2727]">
            {isPastDue
              ? "Your last payment failed. Update your payment method to keep your access."
              : isCanceled
              ? "Your subscription has been canceled. Reactivate to regain full access."
              : "Your free trial has ended. Subscribe to continue using Locator Beast."}
          </p>
        </div>
      )}

      {/* Current Plan */}
      <SettingsCard title="Current Plan">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[15px] font-bold text-[#111318]">Locator Beast — ${MONTHLY_PRICE_USD}/month</p>
            <p className="mt-0.5 text-[12.5px] text-[#6b7280]">{planStatusLabel}</p>
          </div>
          <span className={["flex-none rounded-full px-3 py-1 text-[11.5px] font-semibold", planStatusPill.className].join(" ")}>
            {planStatusPill.text}
          </span>
        </div>

        {(showSubscribe || showManageBilling) && (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[#eceef3] pt-4">
            {showSubscribe && (
              <button
                type="button"
                onClick={subscribe}
                disabled={loading !== null}
                className="rounded-lg bg-[#2f6bff] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#265fe0] disabled:opacity-60"
              >
                {loading === "checkout" ? "Redirecting…" : subscribeCta}
              </button>
            )}
            {showManageBilling && (
              <button
                type="button"
                onClick={manageBilling}
                disabled={loading !== null}
                className="rounded-lg border border-[#d9deea] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#111318] transition-colors hover:bg-[#f7f8fa] disabled:opacity-60"
              >
                {loading === "portal" ? "Opening…" : "Manage Billing"}
              </button>
            )}
          </div>
        )}
        {(showSubscribe || showManageBilling) && !isSubscribed && (
          <p className="mt-2 text-[12px] text-[#9098a8]">
            ${MONTHLY_PRICE_USD}/month · cancel anytime.
          </p>
        )}
        {error && <p className="mt-2 text-[12px] font-medium text-red-600">{error}</p>}
      </SettingsCard>

      {/* Trial Status */}
      {(trialStartedAt || trialEndsAt) && (
        <SettingsCard title="Trial Status">
          <Row label="Trial Start Date" value={formatDate(trialStartedAt)} />
          <div className="border-t border-[#eceef3]" />
          <Row label="Trial End Date" value={formatDate(trialEndsAt)} />
          <div className="border-t border-[#eceef3]" />
          <Row label="Days Remaining" value={isTrialing ? `${days} ${days === 1 ? "day" : "days"}` : "Trial ended"} strong />
        </SettingsCard>
      )}

      {/* Subscription — when there is a live/paid subscription */}
      {(isSubscribed || isPastDue) && (
        <SettingsCard title="Subscription">
          <Row label="Monthly Price" value={`$${MONTHLY_PRICE_USD}/month`} />
          <div className="border-t border-[#eceef3]" />
          <Row
            label={cancelsAtPeriodEnd ? "Access Until" : "Next Billing Date"}
            value={formatDate(subscriptionDetails?.currentPeriodEnd ?? null)}
          />
          {isPastDue && (
            <>
              <div className="border-t border-[#eceef3]" />
              <Row label="Status" value={<span className="text-red-600">Payment failed — update your card</span>} />
            </>
          )}
        </SettingsCard>
      )}

      {/* Payment Method */}
      <SettingsCard title="Payment Method">
        <div className="flex items-center justify-between gap-4">
          {paymentMethod ? (
            <p className="text-[13.5px] text-[#111318]">
              <span className="font-semibold capitalize">{paymentMethod.brand}</span> ending in{" "}
              <span className="font-semibold">{paymentMethod.last4}</span>
              <span className="text-[#6b7280]">
                {" "}
                · expires {String(paymentMethod.expMonth).padStart(2, "0")}/{paymentMethod.expYear}
              </span>
            </p>
          ) : (
            <p className="text-[13.5px] text-[#6b7280]">No card on file.</p>
          )}
          {hasStripeCustomer ? (
            <button
              type="button"
              onClick={manageBilling}
              disabled={loading !== null}
              className="flex-none rounded-lg border border-[#d9deea] bg-white px-4 py-2 text-[13px] font-semibold text-[#111318] transition-colors hover:bg-[#f7f8fa] disabled:opacity-60"
            >
              {loading === "portal" ? "Opening…" : paymentMethod ? "Update" : "Add Card"}
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="flex-none cursor-not-allowed rounded-lg border border-[#e5e7ee] bg-[#f4f5f8] px-4 py-2 text-[13px] font-semibold text-[#9098a8]"
            >
              Update
            </button>
          )}
        </div>
      </SettingsCard>

      {/* Billing History */}
      <SettingsCard title="Billing History">
        {invoices.length > 0 ? (
          <ul className="flex flex-col divide-y divide-[#eceef3]">
            {invoices.map((invoice) => (
              <li key={invoice.id} className="flex items-center justify-between gap-4 py-2.5 text-[13.5px]">
                <span className="text-[#111318]">{formatDate(invoice.date)}</span>
                <span className="text-[#6b7280]">${(invoice.amount / 100).toFixed(2)}</span>
                <span className="w-20 text-right">
                  {invoice.url ? (
                    <a
                      href={invoice.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-[#2f6bff] hover:text-[#265fe0]"
                    >
                      View
                    </a>
                  ) : (
                    <span className="text-[#9098a8]">—</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-[#9098a8]">
            Previous invoices, payment history, and downloadable receipts will appear here once you subscribe.
          </p>
        )}
      </SettingsCard>
    </SettingsShell>
  )
}
