"use client"

import { useState } from "react"
import BackToDashboard from "@/components/crm/BackToDashboard"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { HiOutlineGlobeAlt } from "react-icons/hi2"
import { supabase } from "@/lib/supabase/client"
import AppHeader from "@/components/crm/AppHeader"
import { CRM_PRIMARY_BUTTON } from "@/lib/crmButtonStyles"
import CopyButton from "@/components/ui/CopyButton"
import MemberCard, { StatusBadge } from "./MemberCard"
import ApprovalsPanel from "./ApprovalsPanel"
import type { DownlineMember, AdminMember } from "./types"

// Public base for a member's shareable join link (always the production domain,
// not the current origin — the link is meant to be shared publicly).
const JOIN_BASE = "https://locatorbeast.com/join/"

const cardCls = "rounded-xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-5"

export default function NetworkClient({
  isAdmin,
  myName,
  myPhotoUrl,
  brokerageName,
  status,
  slug,
  referralUrl,
  downline,
  members,
}: {
  isAdmin: boolean
  myName: string
  myPhotoUrl: string | null
  /** profiles.brokerage — the SAME record this page already loads for name/photo. */
  brokerageName: string | null
  status: string | null
  slug: string | null
  referralUrl: string | null
  downline: DownlineMember[]
  members: AdminMember[]
}) {
  const isActive = status === "active"
  const isMember = status !== null
  const joinLink = slug ? `${JOIN_BASE}${slug}` : null

  const tier1 = downline.filter((d) => d.depth === 1)
  const tier2 = downline.filter((d) => d.depth === 2)
  const tier3 = downline.filter((d) => d.depth === 3)

  return (
    <div className="relative h-screen w-full flex flex-col bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-[var(--crm-workspace)] dark:to-[var(--crm-workspace)]">
      <AppHeader variant="dark" fullBleed>
        <BackToDashboard />
      </AppHeader>

      <div className="beast-ai-clearance flex-1 overflow-y-auto p-5">
        <div className="mx-auto w-full max-w-2xl space-y-5">
          <div>
            <h1 className="text-[20px] font-bold text-[var(--crm-text-primary)]">Beast Referral Network</h1>
            <p className="mt-1 text-[13px] text-[var(--crm-text-muted)]">
              Your referral network and free Locator Beast access.
            </p>
          </div>

          {/* My Profile + My Referral Link — one card. The identity block never
              filled the row, and the referral link was a whole card holding a
              single line, so the two share the width on desktop and stack on
              mobile. Layout only: same status source, same generated link, same
              Copy behavior. */}
          {isMember && (
            <section className={cardCls}>
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 flex-none overflow-hidden rounded-full border border-[var(--crm-border)] bg-[var(--crm-inset)]">
                  {myPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={myPhotoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[15px] font-semibold text-[var(--crm-text-muted)]">
                      {myName.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-semibold text-[var(--crm-text-primary)]">{myName}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[12px] text-[var(--crm-text-muted)]">Network status</span>
                    <StatusBadge status={status} />
                  </div>
                </div>
              </div>

              {/* Referral link — full card width, directly below the identity
                  block. Same treatment as the Smart Lead Form's Share tab. */}
              <div className="mt-5">
                <h2 className="text-[13px] font-semibold text-[var(--crm-text-primary)]">My Referral Link</h2>
                {isActive && joinLink ? (
                  <div className="mt-2">
                    <LinkField>
                      <a
                        href={joinLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-[13.5px] font-medium text-[var(--crm-accent)] underline-offset-2 transition-colors hover:underline"
                      >
                        <HiOutlineGlobeAlt className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 truncate">{joinLink}</span>
                      </a>
                      <CopyButton value={joinLink} label="Copy" tone="dark" />
                    </LinkField>
                  </div>
                ) : (
                  <p className="mt-2 text-[13px] text-[var(--crm-text-muted)]">
                    Available once your membership is approved.
                  </p>
                )}
              </div>
              {status === "pending" && (
                <p className="mt-4 rounded-lg bg-amber-500/[0.06] px-3.5 py-2.5 text-[13px] text-amber-300/90">
                  Your membership is pending verification. Your join link and recruiting tools unlock
                  once the owner approves you.
                </p>
              )}
              {status === "inactive" && (
                <p className="mt-4 rounded-lg bg-zinc-500/[0.08] px-3.5 py-2.5 text-[13px] text-[var(--crm-text-muted)]">
                  Your complimentary access is currently inactive. Your data and history are preserved.
                </p>
              )}
            </section>
          )}

          {/* Brokerage referral URL setting */}
          {isMember && (
            <section className={cardCls}>
              <h2 className="text-[15px] font-semibold text-[var(--crm-text-primary)]">
                Brokerage Referral URL
              </h2>
              <p className="mt-1 text-[13px] text-[var(--crm-text-muted)]">
                Your official referral link from {(brokerageName ?? "").trim() || "your brokerage"}.
                Agents are sent here when they choose to join.
              </p>
              {isActive ? (
                <ReferralUrlForm initial={referralUrl ?? ""} />
              ) : (
                <p className="mt-3 text-[13px] text-[var(--crm-text-muted)]">
                  You can set this once your membership is approved.
                </p>
              )}
            </section>
          )}

          {/* Downline: Direct / Tier 2 / Tier 3 */}
          {isMember && (
            <>
              <DownlineSection title="Direct Referrals" members={tier1} />
              <DownlineSection title="Tier 2" members={tier2} />
              <DownlineSection title="Tier 3" members={tier3} />
            </>
          )}

          {/* Admin — owner only, clearly separated */}
          {isAdmin && (
            <div className="pt-2">
              <ApprovalsPanel members={members} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DownlineSection({ title, members }: { title: string; members: DownlineMember[] }) {
  return (
    <section className={cardCls}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-[var(--crm-text-primary)]">{title}</h2>
        <span className="text-[12px] font-medium text-[var(--crm-text-muted)]">{members.length}</span>
      </div>
      {members.length === 0 ? (
        <p className="text-[13px] text-[var(--crm-text-muted)]">No members yet.</p>
      ) : (
        <div className="space-y-2">
          {members.map((m, i) => (
            <MemberCard
              key={`${title}-${i}`}
              name={m.display_name}
              photoUrl={m.photo_url}
              joinedDate={m.joined_date}
              status={m.status}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// The ONE URL-field shell for this page — the same contained row the Smart Lead
// Form's Share tab uses (globe, link/value, compact action on the right), in CRM
// tokens for the dark shell. Both URL controls render inside it so Smart Form
// Link, My Referral Link and Brokerage Referral URL read as one family.
function LinkField({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--crm-border)] bg-[var(--crm-inset)] px-3 py-2.5 sm:flex-row sm:items-center">
      {children}
    </div>
  )
}

function ReferralUrlForm({ initial }: { initial: string }) {
  const router = useRouter()
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  async function save() {
    if (busy) return
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc("lb_set_my_referral_url", { p_url: value })
    setBusy(false)
    if (error) {
      const text =
        error.message?.includes("invalid_url")
          ? "Please enter a valid URL starting with http:// or https://."
          : "Could not save. Please try again."
      setMsg({ kind: "err", text })
      return
    }
    setMsg({ kind: "ok", text: "Saved." })
    router.refresh()
  }

  return (
    <div className="mt-3">
      {/* Editable, so the value is an input rather than a link — but it sits in
          the SAME shell as My Referral Link, with the globe on the left and
          compact actions on the right. Save still calls lb_set_my_referral_url
          with the same validation and refresh; Copy is display-only. */}
      <LinkField>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <HiOutlineGlobeAlt className="h-4 w-4 shrink-0 text-[var(--crm-text-muted)]" aria-hidden="true" />
          <input
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[13.5px] font-medium text-[var(--crm-text-primary)] outline-none placeholder:text-[var(--crm-text-muted)]"
          />
        </span>
        <span className="flex flex-none items-center gap-2">
          <CopyButton value={value} label="Copy" tone="dark" />
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className={`${CRM_PRIMARY_BUTTON} justify-center !px-3.5 !py-1.5 !text-[12.5px]`}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </span>
      </LinkField>
      {msg && (
        <p className={`mt-2 text-[12px] font-medium ${msg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
          {msg.text}
        </p>
      )}
    </div>
  )
}
