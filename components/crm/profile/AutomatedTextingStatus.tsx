"use client"

import { SettingsCard } from "@/components/crm/settings/SettingsShell"

/**
 * Profile → Automated Texting availability (read-only).
 *
 * Private rollout: this card renders ONLY for accounts that are authorized. An
 * unauthorized account sees NOTHING here — the feature is not advertised. The
 * `authorized` flag is resolved server-side (is_automated_texting_authorized) and
 * passed down; the client never decides authorization. If an account is authorized
 * later, this appears automatically on the next load. Status only — no controls.
 */
export default function AutomatedTextingStatus({ authorized }: { authorized: boolean }) {
  if (!authorized) return null
  return (
    <SettingsCard
      title="Automated Texting"
      description="Automated follow-up texts on approved clients sent during Working Hours."
    >
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 flex-none rounded-full bg-emerald-500" aria-hidden />
        <span className="text-[14px] font-medium text-[#111318]">Available on your account</span>
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-[#6b7280]">
        Enable or disable Automated Texts from Beast Companion.
      </p>
    </SettingsCard>
  )
}
