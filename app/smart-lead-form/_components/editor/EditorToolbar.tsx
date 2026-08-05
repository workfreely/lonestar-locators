"use client"

import { HiOutlineComputerDesktop, HiOutlineDevicePhoneMobile } from "react-icons/hi2"
import { SettingsHeader } from "@/components/crm/settings/SettingsShell"
import { publicPageUrl, publicPagePath } from "../../_lib/shareConfig"

export default function EditorToolbar({
  device,
  onDeviceChange,
  onSave,
  saving,
  saved,
  slug,
  saveError,
}: {
  device: "mobile" | "desktop"
  onDeviceChange: (device: "mobile" | "desktop") => void
  onSave: () => void
  saving: boolean
  saved: boolean
  slug: string | null
  saveError: string | null
}) {
  // Reuses the shared Business Settings header; the editor-specific controls
  // (device toggle, always-live link, Save) slot in between Dashboard and
  // Profile. Every account has ONE always-live form, so the public link is
  // ALWAYS shown (never gated on a publish state) and opens the live public URL.
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

      <div className="flex items-center gap-3">
        {slug && (
          <a
            href={publicPageUrl(slug)}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden text-[12.5px] font-medium text-emerald-600 hover:underline sm:inline"
          >
            ● Live at {publicPagePath(slug)}
          </a>
        )}
        {saveError && <span className="text-[12.5px] font-medium text-red-600">{saveError}</span>}
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-full bg-[#111318] px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#2f6bff] disabled:opacity-60"
        >
          {saving ? "Saving…" : saved ? "Saved" : "Save Changes"}
        </button>
      </div>
    </SettingsHeader>
  )
}
