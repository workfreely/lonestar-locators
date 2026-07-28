"use client"

import SettingsShell, { SettingsCard } from "@/components/crm/settings/SettingsShell"

const INTEGRATIONS: { name: string; description: string }[] = [
  { name: "Google Calendar", description: "Automatically create tours and reminders on your calendar." },
  { name: "Google Contacts", description: "Keep your client contact information in sync." },
  { name: "Phone Sync", description: "See client calls and texts in one place." },
]

export default function IntegrationsClient() {
  return (
    <SettingsShell title="Integrations" description="Connect the tools you already use. More integrations are on the way.">
      <SettingsCard>
        <div className="divide-y divide-[#eceef3]">
          {INTEGRATIONS.map((item) => (
            <div key={item.name} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-[#111318]">{item.name}</p>
                <p className="text-[12.5px] text-[#6b7280]">{item.description}</p>
              </div>
              <button
                type="button"
                disabled
                className="flex-none cursor-not-allowed rounded-lg border border-[#e5e7ee] bg-[#f4f5f8] px-4 py-2 text-[13px] font-semibold text-[#9098a8]"
              >
                Soon
              </button>
            </div>
          ))}
        </div>
      </SettingsCard>
    </SettingsShell>
  )
}
