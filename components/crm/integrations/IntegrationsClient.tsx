"use client"

import SettingsShell, { SettingsCard } from "@/components/crm/settings/SettingsShell"
import BeastCompanionExtensionSection from "@/components/crm/integrations/BeastCompanionExtensionSection"
import BeastCompanionSection from "@/components/crm/integrations/BeastCompanionSection"
import ConnectedDevicesSection from "@/components/crm/devices/ConnectedDevicesSection"

// Phone Sync lives in its own Beast Companion section below (it's the desktop
// Companion), so it's no longer a generic "Soon" row here.
const INTEGRATIONS: { name: string; description: string }[] = [
  { name: "Google Calendar", description: "Automatically create tours and reminders on your calendar." },
  { name: "Google Contacts", description: "Automatically add your clients' contact information to your phone." },
  { name: "Meta Ads", description: "Bring in leads from your Facebook and Instagram ad campaigns." },
]

export default function IntegrationsClient() {
  return (
    <SettingsShell title="Integrations">
      {/* Locator Beast's own tools appear first (Beast Companion, then Beast Sync),
          followed by third-party integrations. Presentation order only — the
          sections themselves are unchanged. */}

      {/* Beast Companion — upcoming Chrome extension (placeholder, above Beast Sync). */}
      <BeastCompanionExtensionSection />

      {/* Beast Sync — the desktop app; macOS + Windows are supported platforms. */}
      <BeastCompanionSection />

      {/* Third-party integrations — below Locator Beast's own tools. */}
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

      {/* Connected Devices — the paired Companions (any platform) + controls. */}
      <ConnectedDevicesSection />
    </SettingsShell>
  )
}
