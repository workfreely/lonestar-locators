"use client"

import { HiOutlineComputerDesktop, HiOutlineDevicePhoneMobile } from "react-icons/hi2"
import { SettingsHeader } from "@/components/crm/settings/SettingsShell"

export default function EditorToolbar({
  device,
  onDeviceChange,
}: {
  device: "mobile" | "desktop"
  onDeviceChange: (device: "mobile" | "desktop") => void
}) {
  // Reuses the shared Business Settings header; the editor-specific controls
  // (device toggle, Publish) slot in between Dashboard and Profile.
  return (
    <SettingsHeader>
      <div className="flex rounded-full border border-[#e5e7ee] bg-[#f4f5f8] p-1">
        <button
          type="button"
          onClick={() => onDeviceChange("mobile")}
          aria-pressed={device === "mobile"}
          className={`flex h-8 w-9 items-center justify-center rounded-full transition-colors ${
            device === "mobile" ? "bg-white text-[#111318] shadow-sm" : "text-[#9098a8]"
          }`}
        >
          <HiOutlineDevicePhoneMobile className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onDeviceChange("desktop")}
          aria-pressed={device === "desktop"}
          className={`flex h-8 w-9 items-center justify-center rounded-full transition-colors ${
            device === "desktop" ? "bg-white text-[#111318] shadow-sm" : "text-[#9098a8]"
          }`}
        >
          <HiOutlineComputerDesktop className="h-4 w-4" />
        </button>
      </div>

      <button
        type="button"
        disabled
        className="cursor-not-allowed rounded-full bg-[#111318]/40 px-5 py-2 text-[13px] font-semibold text-white"
        title="Publishing comes in a future milestone"
      >
        Publish
      </button>
    </SettingsHeader>
  )
}
