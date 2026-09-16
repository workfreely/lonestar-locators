import { FaApple, FaAndroid } from "react-icons/fa6"
import { SettingsCard } from "@/components/crm/settings/SettingsShell"

// Messaging Setup — how Locator Beast connects to the agent's text messages.
//
// Apple Messages is CURRENTLY supported (Beast Sync syncs Apple Messages on
// macOS), so it gets an active "Setup Guide" link to Apple's official Messages
// support — NOT a download (Messages ships with macOS) and NOT "Coming Soon".
//
// Google Messages / Android is NOT implemented yet, so it shows an honest
// "Coming Soon" state with no link — nothing here implies live Android support.
//
// Presentation only: this card adds no messaging logic and does not touch Beast
// Sync / Beast Companion / Meta. It mirrors the exact row + button styling of the
// Beast Sync and Beast Companion (extension) cards.

// Apple's official Messages support hub (stable canonical URL). Opens in a new tab.
const APPLE_MESSAGES_SETUP_URL = "https://support.apple.com/messages"

const setupBtn =
  "rounded-lg border border-[#e5e7ee] bg-white px-4 py-2 text-[13px] font-semibold text-[#111318] transition-colors hover:bg-[#f4f5f8]"
const disabledBtn =
  "cursor-not-allowed rounded-lg border border-[#e5e7ee] bg-[#f4f5f8] px-4 py-2 text-[13px] font-semibold text-[#9098a8]"

export default function MessagingSetupSection() {
  return (
    <SettingsCard
      title="Messaging Setup"
      description="How Locator Beast connects to your text messages."
    >
      <div className="divide-y divide-[#eceef3]">
        {/* Apple Messages — supported today via Beast Sync on macOS. */}
        <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex w-6 flex-none items-center justify-center text-[#111318]">
              <FaApple className="h-[18px] w-auto" />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-[#111318]">Apple Messages</p>
              <p className="text-[12.5px] text-[#6b7280]">Works with Beast Sync on macOS</p>
            </div>
          </div>
          <a
            href={APPLE_MESSAGES_SETUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex-none ${setupBtn}`}
          >
            Setup Guide
          </a>
        </div>

        {/* Google Messages — Android support not implemented yet; no link. */}
        <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex w-6 flex-none items-center justify-center text-[#111318]">
              <FaAndroid className="h-[18px] w-auto" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[14px] font-semibold text-[#111318]">
                Google Messages
                <span className="rounded-full bg-[#f4f5f8] px-2 py-0.5 text-[11px] font-semibold text-[#9098a8]">
                  Coming Soon
                </span>
              </p>
              <p className="text-[12.5px] text-[#6b7280]">Android messaging support</p>
            </div>
          </div>
          <button type="button" disabled className={`flex-none ${disabledBtn}`}>
            Coming Soon
          </button>
        </div>
      </div>
    </SettingsCard>
  )
}
