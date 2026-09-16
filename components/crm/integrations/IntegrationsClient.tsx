"use client"

import SettingsShell, { SettingsCard } from "@/components/crm/settings/SettingsShell"
import BeastCompanionExtensionSection from "@/components/crm/integrations/BeastCompanionExtensionSection"
import DeviceEcosystemSection from "@/components/crm/integrations/DeviceEcosystemSection"
import MetaAdsSection from "@/components/crm/integrations/MetaAdsSection"
import ConnectedDevicesSection from "@/components/crm/devices/ConnectedDevicesSection"

// Phone Sync lives in its own Beast Companion section below (it's the desktop
// Companion), so it's no longer a generic "Soon" row here.
// `google` marks the rows served by the one Google OAuth grant (Calendar +
// Contacts scopes); those get a working Connect/Reconnect action.
// Meta Ads (Instagram & Facebook Ads) is now its own interactive section (MetaAdsSection) below,
// rendered inside the same card. The static rows here are the Google OAuth integrations only.
const INTEGRATIONS: { name: string; description: string; google?: boolean }[] = [
  { name: "Google Calendar", description: "Automatically create tours and reminders on your calendar.", google: true },
  { name: "Google Contacts", description: "Automatically add your clients' contact information to your phone.", google: true },
]

// The one working Google connect entry point — the SAME OAuth flow onboarding
// uses. Returning to /admin/integrations so an already-onboarded agent can
// (re)connect without being bounced through onboarding. No OAuth logic here.
const GOOGLE_CONNECT_URL = "/api/google/auth?next=/admin/integrations"

export default function IntegrationsClient({ googleConnected }: { googleConnected: boolean }) {
  return (
    <SettingsShell title="Integrations">
      {/* Locator Beast's own tools appear first (Beast Companion, then Beast Sync),
          followed by third-party integrations. Presentation order only — the
          sections themselves are unchanged. */}

      {/* Beast Companion — upcoming Chrome extension (placeholder, above the desktop tools). */}
      <BeastCompanionExtensionSection />

      {/* Beast Sync + messaging grouped by device ecosystem: "Mac + iPhone"
          (Beast Sync for macOS + iPhone Messages) and "Windows + Android"
          (Beast Sync for Windows + Google Messages). Presentation only — Beast
          Sync's download/pending behaviour is byte-preserved. */}
      <DeviceEcosystemSection />

      {/* Third-party integrations — below Locator Beast's own tools. */}
      <SettingsCard>
        <div className="divide-y divide-[#eceef3]">
          {INTEGRATIONS.map((item) => (
            <div key={item.name} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-[#111318]">{item.name}</p>
                <p className="text-[12.5px] text-[#6b7280]">{item.description}</p>
              </div>
              {item.google ? (
                <div className="flex flex-none items-center gap-3">
                  {googleConnected && (
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#15803d]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
                      Connected
                    </span>
                  )}
                  {/* Full navigation to the existing OAuth initiation route — same
                      flow onboarding uses; no OAuth logic duplicated here. */}
                  <a
                    href={GOOGLE_CONNECT_URL}
                    className={
                      googleConnected
                        ? "rounded-lg border border-[#e5e7ee] bg-white px-4 py-2 text-[13px] font-semibold text-[#111318] transition-colors hover:bg-[#f4f5f8]"
                        : "rounded-lg bg-[#2f6bff] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#255ae0]"
                    }
                  >
                    {googleConnected ? "Reconnect" : "Connect"}
                  </a>
                </div>
              ) : (
                <button
                  type="button"
                  disabled
                  className="flex-none cursor-not-allowed rounded-lg border border-[#e5e7ee] bg-[#f4f5f8] px-4 py-2 text-[13px] font-semibold text-[#9098a8]"
                >
                  Soon
                </button>
              )}
            </div>
          ))}
          {/* Instagram & Facebook Ads (Meta) — interactive connect/manage row. */}
          <MetaAdsSection />
        </div>
      </SettingsCard>

      {/* Connected Devices — the paired Companions (any platform) + controls. */}
      <ConnectedDevicesSection />
    </SettingsShell>
  )
}
