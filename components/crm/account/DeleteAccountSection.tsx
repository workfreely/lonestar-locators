"use client"

import { useState } from "react"

// Danger Zone → Delete Account.
//
// Deliberately separate from Cancel Subscription (BillingSettingsClient). The
// two are easy to confuse and have opposite consequences, so the copy below
// draws the distinction explicitly rather than relying on the button label.
//
// Two independent gates before the button enables: the user must type their
// exact account email (chosen over typing "DELETE" — it forces reading and
// prevents deleting the wrong account) and echo a 6-digit code emailed by
// Supabase's reauthenticate(). The code path works for Google-only accounts,
// which have no password — that is most of the user base.

type Preflight = {
  email: string
  owns_workspace: boolean
  workspace_count: number
  co_members: number
  lead_count: number
  workspaces_will_be_deleted: number
  blocked: boolean
  blocked_reason: string | null
}

export default function DeleteAccountSection() {
  const [open, setOpen] = useState(false)
  const [pre, setPre] = useState<Preflight | null>(null)
  const [busy, setBusy] = useState<null | "preflight" | "code" | "delete">(null)
  const [codeSent, setCodeSent] = useState(false)
  const [typedEmail, setTypedEmail] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function begin() {
    setBusy("preflight"); setError(null)
    try {
      const res = await fetch("/api/account/deletion-preflight")
      if (!res.ok) throw new Error("Could not load account details.")
      setPre(await res.json())
      setOpen(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function sendCode() {
    setBusy("code"); setError(null)
    try {
      const res = await fetch("/api/account/deletion-challenge", { method: "POST" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? "Could not send the code.")
      setCodeSent(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function confirmDelete() {
    setBusy("delete"); setError(null)
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: typedEmail, code }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? "Deletion failed.")
      // The session is gone with the account — a full navigation, not a router
      // push, so nothing tries to re-fetch as a deleted user.
      window.location.assign("/?deleted=1")
    } catch (e) {
      setError((e as Error).message)
      setBusy(null)
    }
  }

  const emailMatches = pre != null && typedEmail.trim().toLowerCase() === pre.email
  const canDelete = emailMatches && code.trim().length > 0 && !pre?.blocked && busy === null

  return (
    <div className="mt-8 rounded-2xl border border-red-200 bg-red-50/40 p-5">
      <h3 className="text-[14px] font-semibold text-[#b42318]">Danger Zone</h3>
      <p className="mt-1 text-[12.5px] leading-relaxed text-[#6b7280]">
        Permanently delete your account and all of its data. This is not the same as
        cancelling your subscription.
      </p>

      {/* Rendered OUTSIDE the panel as well: begin() can fail before there is a
          panel to show it in, and without this the button silently did nothing. */}
      {!open && error && (
        <p className="mt-3 text-[12.5px] font-medium text-[#b42318]">{error}</p>
      )}

      {!open && (
        <button
          type="button"
          onClick={begin}
          disabled={busy !== null}
          className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2.5 text-[13px] font-semibold text-[#b42318] transition-colors hover:bg-red-50 disabled:opacity-60"
        >
          {busy === "preflight" ? "Checking…" : "Delete Account"}
        </button>
      )}

      {open && pre && (
        <div className="mt-4 rounded-xl border border-red-200 bg-white p-4">
          <p className="text-[13px] font-semibold text-[#111318]">
            Deleting your account is immediate and permanent.
          </p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-[#4b5162]">
            <strong>This is not the same as cancelling your subscription.</strong> Cancelling
            stops billing and keeps your workspace for 90 days. Deleting your account removes
            it right away — it is <strong>not covered by the 90-day recovery period</strong> and
            cannot be undone.
          </p>

          {pre.blocked ? (
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-[12.5px] font-medium text-[#92400e]">
              {pre.blocked_reason}
            </p>
          ) : (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-[12.5px] text-[#4b5162]">
              <li>Your active subscription will be cancelled.</li>
              <li>Your Google connection will be revoked.</li>
              {pre.owns_workspace && (
                <li>
                  Your workspace and <strong>{pre.lead_count}</strong>{" "}
                  {pre.lead_count === 1 ? "lead" : "leads"} will be permanently deleted.
                </li>
              )}
              <li>Your public Smart Form link will be released.</li>
            </ul>
          )}

          {!pre.blocked && (
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[12px] font-semibold text-[#6b7280]">
                  Type <span className="font-mono text-[#111318]">{pre.email}</span> to confirm
                </label>
                <input
                  value={typedEmail}
                  onChange={(e) => setTypedEmail(e.target.value)}
                  autoComplete="off"
                  className="mt-1 w-full rounded-lg border border-[#e5e7ee] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#b42318]"
                />
              </div>

              <div>
                <label className="text-[12px] font-semibold text-[#6b7280]">Confirmation code</label>
                <div className="mt-1 flex gap-2">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="6-digit code"
                    className="w-40 rounded-lg border border-[#e5e7ee] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#b42318]"
                  />
                  <button
                    type="button"
                    onClick={sendCode}
                    disabled={busy !== null}
                    className="rounded-lg border border-[#e5e7ee] px-3 py-2 text-[12.5px] font-semibold text-[#4b5162] transition-colors hover:bg-[#f7f8fa] disabled:opacity-60"
                  >
                    {busy === "code" ? "Sending…" : codeSent ? "Resend code" : "Email me a code"}
                  </button>
                </div>
                {codeSent && (
                  <p className="mt-1 text-[12px] text-[#6b7280]">
                    We sent a code to {pre.email}.
                  </p>
                )}
              </div>
            </div>
          )}

          {error && <p className="mt-3 text-[12.5px] font-medium text-[#b42318]">{error}</p>}

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => { setOpen(false); setTypedEmail(""); setCode(""); setCodeSent(false); setError(null) }}
              className="rounded-lg border border-[#e5e7ee] px-4 py-2.5 text-[13px] font-semibold text-[#4b5162] transition-colors hover:bg-[#f7f8fa]"
            >
              Cancel
            </button>
            {!pre.blocked && (
              <button
                type="button"
                onClick={confirmDelete}
                disabled={!canDelete}
                className="rounded-lg bg-[#b42318] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#96200f] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "delete" ? "Deleting…" : "Permanently delete my account"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
