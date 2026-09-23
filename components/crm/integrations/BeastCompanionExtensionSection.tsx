import { FaChrome } from "react-icons/fa6"
import { SettingsCard } from "@/components/crm/settings/SettingsShell"

// Beast Companion — the upcoming AI-powered browser companion (Chrome
// extension) that brings Locator Beast into the property search site the locator
// works in. Placeholder only: no functionality yet. Mirrors the Beast Sync card's
// exact layout, spacing, typography, "Coming Soon" pill, and disabled button styling.

// Same disabled button style as the other integrations' "Coming Soon" control.
const disabledBtn =
  "cursor-not-allowed rounded-lg border border-[#e5e7ee] bg-[#f4f5f8] px-4 py-2 text-[13px] font-semibold text-[#9098a8]"

export default function BeastCompanionExtensionSection() {
  return (
    <SettingsCard
      title="Beast Companion"
      description="Bring Locator Beast directly into your property search site with an AI-powered browser companion."
    >
      <div className="divide-y divide-[#eceef3]">
        <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
          {/* Platform identity + status — same layout as the Beast Sync rows. */}
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex w-6 flex-none items-center justify-center text-[#111318]">
              <FaChrome className="h-[18px] w-auto" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[14px] font-semibold text-[#111318]">
                Chrome Extension
                <span className="rounded-full bg-[#f4f5f8] px-2 py-0.5 text-[11px] font-semibold text-[#9098a8]">
                  Coming Soon
                </span>
              </p>
              <p className="text-[12.5px] text-[#6b7280]">Available in a future release.</p>
            </div>
          </div>

          <div className="flex flex-none items-center gap-2">
            <button type="button" disabled className={disabledBtn}>
              Coming Soon
            </button>
          </div>
        </div>
      </div>
    </SettingsCard>
  )
}
