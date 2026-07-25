"use client"

import Link from "next/link"
import { HiOutlineArrowLeft, HiOutlineComputerDesktop, HiOutlineDevicePhoneMobile } from "react-icons/hi2"

export default function EditorToolbar({
  device,
  onDeviceChange,
  onReset,
}: {
  device: "mobile" | "desktop"
  onDeviceChange: (device: "mobile" | "desktop") => void
  onReset: () => void
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#e5e7ee] bg-white px-5">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#6b7280] transition-colors hover:bg-[#f4f5f8] hover:text-[#111318]"
          aria-label="Back"
        >
          <HiOutlineArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <p className="text-[14px] font-semibold text-[#111318]">Smart Lead Form</p>
          <p className="text-[12px] text-[#9098a8]">Editing your lead page</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
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
          onClick={onReset}
          className="rounded-full border border-[#e5e7ee] px-4 py-2 text-[13px] font-semibold text-[#4b5162] transition-colors hover:bg-[#f4f5f8]"
        >
          Reset
        </button>

        <button
          type="button"
          disabled
          className="cursor-not-allowed rounded-full bg-[#111318]/40 px-5 py-2 text-[13px] font-semibold text-white"
          title="Publishing comes in a future milestone"
        >
          Publish
        </button>
      </div>
    </header>
  )
}
