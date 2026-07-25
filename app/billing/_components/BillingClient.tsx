"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { HiOutlineCheckCircle } from "react-icons/hi2"
import type { AccessState } from "@/lib/billing/access"
import { MONTHLY_PRICE_USD } from "@/lib/billing/trial"
import { LOGO_FOR_LIGHT_BG, SITE_URL } from "@/app/locator-beast/_lib/site"

type Invoice = { id: string; amount: number; date: string; url: string | null; status: string }

const INCLUDED = [
  "Workflow Engine",
  "CRM",
  "AI Client Insights",
  "Landing Pages",
  "Phone Sync",
  "Google Calendar & Contacts",
  "Performance Dashboard",
  "Every future feature included",
]

function BillingCard({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  children?: React.ReactNode
}) {
  return (
    <div className="w-full rounded-3xl border border-[var(--beast-border)] bg-white p-8 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.25)] sm:p-10">
      {eyebrow && (
        <p className="text-[12px] font-semibold uppercase tracking-[0.25em] text-[var(--beast-blue)]">{eyebrow}</p>
      )}
      <h1 className={`text-[26px] font-semibold tracking-tight text-[var(--beast-ink)] ${eyebrow ? "mt-2" : ""}`}>
        {title}
      </h1>
      {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-[var(--beast-ink-soft)]">{subtitle}</p>}
      {children && <div className="mt-8">{children}</div>}
    </div>
  )
}

function formatDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

function daysRemaining(iso: string) {
  const ms = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

export default function BillingClient({
  access,
  trialStarted,
  subscriptionDetails,
  invoices,
}: {
  access: AccessState
  trialStarted: boolean
  subscriptionDetails: { currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null
  invoices: Invoice[]
}) {
  const [loadingAction, setLoadingAction] = useState<"trial" | "checkout" | "portal" | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function startTrial() {
    setLoadingAction("trial")
    setActionError(null)
    const res = await fetch("/api/billing/start-trial", { method: "POST" })
    const json = await res.json()
    if (json.granted) {
      window.location.reload()
      return
    }
    if (json.reason === "trial_already_used") {
      setActionError("This email has already used a free trial. Subscribe to get started.")
    } else {
      setActionError("Something went wrong starting your trial. Please try again.")
    }
    setLoadingAction(null)
  }

  async function subscribe() {
    setLoadingAction("checkout")
    setActionError(null)
    const res = await fetch("/api/stripe/checkout", { method: "POST" })
    const json = await res.json()
    if (json.url) {
      window.location.href = json.url
      return
    }
    setActionError(json.error ?? "Checkout isn't available right now. Please try again shortly.")
    setLoadingAction(null)
  }

  async function manageBilling() {
    setLoadingAction("portal")
    setActionError(null)
    const res = await fetch("/api/stripe/portal", { method: "POST" })
    const json = await res.json()
    if (json.url) {
      window.location.href = json.url
      return
    }
    setActionError(
      json.error === "No billing account yet"
        ? "You don't have a billing account yet — subscribe first to manage payment details."
        : (json.error ?? "The billing portal isn't available right now. Please try again shortly.")
    )
    setLoadingAction(null)
  }

  const PrimarySubscribeButton = (
    <button
      type="button"
      onClick={subscribe}
      disabled={loadingAction !== null}
      className="w-full rounded-full bg-[var(--beast-ink)] px-7 py-3.5 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.02] hover:bg-[var(--beast-blue)] disabled:opacity-60"
    >
      {loadingAction === "checkout" ? "Redirecting…" : "Subscribe Now"}
    </button>
  )

  // Access denied — either a fresh account that hasn't started a trial, or
  // one that's expired/canceled/past due. Same visual treatment either way,
  // different copy.
  if (!access.allowed) {
    const isFresh = !trialStarted && access.reason === "no_subscription"

    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg">
          <div className="mb-8 flex justify-center">
            <Image
              src={LOGO_FOR_LIGHT_BG}
              alt="Locator Beast"
              width={172}
              height={40}
              style={{ height: "28px", width: "auto" }}
            />
          </div>

          <BillingCard
            title={
              isFresh
                ? "Start your free trial"
                : access.reason === "trial_expired"
                  ? "Your Free Trial Has Ended"
                  : access.reason === "canceled"
                    ? "Your subscription has ended"
                    : access.reason === "past_due"
                      ? "Your payment needs attention"
                      : "Subscribe to Locator Beast"
            }
            subtitle={
              isFresh
                ? "30 days, full access, no credit card required."
                : access.reason === "trial_expired"
                  ? "We hope you've enjoyed using Locator Beast. Continue growing your apartment locating business with unlimited access."
                  : access.reason === "past_due"
                    ? "We couldn't process your last payment. Update your payment method to keep your access."
                    : "Continue growing your apartment locating business with unlimited access."
            }
          >
            <p className="text-[44px] font-semibold leading-none tracking-tight text-[var(--beast-ink)]">
              ${MONTHLY_PRICE_USD}
              <span className="text-[16px] font-medium text-[var(--beast-ink-soft)]">/month</span>
            </p>

            <ul className="mt-6 flex flex-col gap-2.5">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-center gap-3 text-[14px] font-medium text-[var(--beast-ink)]">
                  <HiOutlineCheckCircle className="h-5 w-5 shrink-0 text-[var(--beast-blue)]" />
                  {item}
                </li>
              ))}
            </ul>

            {actionError && <p className="mt-5 text-[13px] text-red-500">{actionError}</p>}

            <div className="mt-8 flex flex-col gap-3">
              {isFresh && (
                <button
                  type="button"
                  onClick={startTrial}
                  disabled={loadingAction !== null}
                  className="w-full rounded-full bg-[var(--beast-blue)] px-7 py-3.5 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.02] hover:bg-[var(--beast-blue-bright)] disabled:opacity-60"
                >
                  {loadingAction === "trial" ? "Starting…" : "Start Your 30-Day Free Trial"}
                </button>
              )}
              {PrimarySubscribeButton}
              <a
                href={`${SITE_URL}/contact`}
                className="w-full rounded-full border border-[var(--beast-border)] px-7 py-3.5 text-center text-[15px] font-semibold text-[var(--beast-ink)] transition-colors hover:bg-[#f7f8fa]"
              >
                Contact Support
              </a>
            </div>
          </BillingCard>
        </div>
      </div>
    )
  }

  // Access granted — trialing or subscribed.
  return (
    <div className="flex min-h-screen justify-center px-4 py-16">
      <div className="w-full max-w-2xl">
        <div className="mb-8 flex justify-center">
          <Image
            src={LOGO_FOR_LIGHT_BG}
            alt="Locator Beast"
            width={172}
            height={40}
            style={{ height: "28px", width: "auto" }}
          />
        </div>

        <BillingCard eyebrow="Billing" title="Your subscription">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--beast-border)] bg-[#f7f8fa] p-4">
              <p className="text-[12px] font-medium text-[var(--beast-ink-soft)]">Current Plan</p>
              <p className="mt-1 text-[16px] font-semibold text-[var(--beast-ink)]">
                Locator Beast — ${MONTHLY_PRICE_USD}/month
              </p>
            </div>

            <div className="rounded-xl border border-[var(--beast-border)] bg-[#f7f8fa] p-4">
              <p className="text-[12px] font-medium text-[var(--beast-ink-soft)]">Subscription Status</p>
              <p className="mt-1 text-[16px] font-semibold capitalize text-[var(--beast-ink)]">
                {access.reason === "trialing" ? "Free Trial" : "Active"}
              </p>
            </div>

            {access.reason === "trialing" && (
              <div className="rounded-xl border border-[var(--beast-border)] bg-[#f7f8fa] p-4">
                <p className="text-[12px] font-medium text-[var(--beast-ink-soft)]">Trial Status</p>
                <p className="mt-1 text-[16px] font-semibold text-[var(--beast-ink)]">
                  {daysRemaining(access.trialEndsAt)} days left
                </p>
                <p className="mt-0.5 text-[13px] text-[var(--beast-ink-soft)]">
                  Ends {formatDate(access.trialEndsAt)}
                </p>
              </div>
            )}

            {access.reason === "subscribed" && (
              <div className="rounded-xl border border-[var(--beast-border)] bg-[#f7f8fa] p-4">
                <p className="text-[12px] font-medium text-[var(--beast-ink-soft)]">Next Billing Date</p>
                <p className="mt-1 text-[16px] font-semibold text-[var(--beast-ink)]">
                  {formatDate(subscriptionDetails?.currentPeriodEnd ?? null)}
                </p>
                {subscriptionDetails?.cancelAtPeriodEnd && (
                  <p className="mt-0.5 text-[13px] text-amber-600">Cancels at period end</p>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {access.reason === "trialing" && (
              <button
                type="button"
                onClick={subscribe}
                disabled={loadingAction !== null}
                className="flex-1 rounded-full bg-[var(--beast-blue)] px-7 py-3.5 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.02] hover:bg-[var(--beast-blue-bright)] disabled:opacity-60"
              >
                {loadingAction === "checkout" ? "Redirecting…" : "Subscribe Now"}
              </button>
            )}
            <button
              type="button"
              onClick={manageBilling}
              disabled={loadingAction !== null}
              className="flex-1 rounded-full border border-[var(--beast-border)] px-7 py-3.5 text-[15px] font-semibold text-[var(--beast-ink)] transition-colors hover:bg-[#f7f8fa] disabled:opacity-60"
            >
              {loadingAction === "portal" ? "Opening…" : "Manage Billing"}
            </button>
          </div>
          {actionError && <p className="mt-3 text-[13px] text-red-500">{actionError}</p>}
          <p className="mt-3 text-[12px] text-[var(--beast-ink-soft)]">
            Update your payment method, download invoices, or cancel your subscription inside the billing portal.
          </p>
        </BillingCard>

        {invoices.length > 0 && (
          <div className="mt-6 w-full rounded-3xl border border-[var(--beast-border)] bg-white p-8 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.25)] sm:p-10">
            <p className="text-[13px] font-semibold uppercase tracking-[0.2em] text-[var(--beast-ink-soft)]">
              Invoices
            </p>
            <ul className="mt-4 flex flex-col divide-y divide-[var(--beast-border)]">
              {invoices.map((invoice) => (
                <li key={invoice.id} className="flex items-center justify-between py-3 text-[14px]">
                  <span className="text-[var(--beast-ink)]">{formatDate(invoice.date)}</span>
                  <span className="text-[var(--beast-ink-soft)]">${(invoice.amount / 100).toFixed(2)}</span>
                  {invoice.url ? (
                    <Link
                      href={invoice.url}
                      target="_blank"
                      className="font-semibold text-[var(--beast-blue)] hover:text-[var(--beast-blue-bright)]"
                    >
                      View
                    </Link>
                  ) : (
                    <span className="text-[var(--beast-ink-soft)]">—</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
