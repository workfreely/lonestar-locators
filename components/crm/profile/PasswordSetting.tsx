"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { SettingsCard } from "@/components/crm/settings/SettingsShell"

// Password management for the signed-in user.
//
// Deliberately NO second password system: this reuses the application's EXISTING,
// proven flow — `supabase.auth.resetPasswordForEmail` with the same `/reset-password`
// redirect the public /forgot-password page uses, which then calls
// `supabase.auth.updateUser({ password })`. Nothing about a password is read, stored
// or displayed here, and no password ever touches the profiles table.
//
// The email step is what makes this safe from Profile: possession of the mailbox
// re-establishes identity, so a briefly-unattended session cannot be used to take over
// the account. An inline "change it right here" field would need reauthentication to be
// equivalent — see the note reported alongside this checkpoint.
export default function PasswordSetting({ email }: { email: string }) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendResetLink() {
    if (!email || sending) return
    setSending(true)
    setError(null)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setSending(false)
    if (resetError) {
      setError("Couldn't send the reset link. Please try again.")
      return
    }
    setSent(true)
  }

  return (
    <SettingsCard
      title="Password"
      description="Change the password you use to sign in to Locator Beast."
    >
      {sent ? (
        <p className="text-[13px] text-[#4b5162]">
          A password reset link is on its way to <span className="font-semibold text-[#111318]">{email}</span>. The
          link opens a page where you can set a new password.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={sendResetLink}
              disabled={sending || !email}
              className="rounded-full border border-[#e5e7ee] px-3.5 py-2 text-[13px] font-semibold text-[#4b5162] transition-colors hover:bg-[#f4f5f8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send password reset link"}
            </button>
          </div>
          {error && <span className="text-[12px] text-red-600">{error}</span>}
        </div>
      )}
    </SettingsCard>
  )
}
