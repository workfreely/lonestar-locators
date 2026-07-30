"use client"

import { useEffect, useState, type ComponentType } from "react"
import { supabase } from "@/lib/supabase/client"
import { SettingsCard } from "@/components/crm/settings/SettingsShell"
import { AppleIcon, WindowsIcon } from "@/components/icons/PlatformIcons"

// Beast Companion — the desktop app that syncs Apple Messages into the CRM.
// The PRODUCT is "Beast Companion"; macOS and Windows are supported platforms.
// Both rows share one layout so Windows becomes active later by flipping
// `released` + setting a download URL — no layout changes.
//
// Backend/pairing stays platform-agnostic: both desktop apps use the same
// /api/companion/{pair,messages,status} endpoints + device-token auth. (A
// future `platform` column on device_tokens would let each row show its own
// connection; today any paired device is the Mac.)

type PlatformKey = "macos" | "windows"

// Set once each platform's signed installer is published. Empty = not yet
// downloadable (the button shows a pending state until then).
const DOWNLOAD_URLS: Record<PlatformKey, string> = {
  macos: "",
  windows: "",
}

// Same monochrome platform glyphs as the landing page (shared component).
const PLATFORMS: {
  key: PlatformKey
  Icon: ComponentType<{ className?: string }>
  name: string
  released: boolean
}[] = [
  { key: "macos", Icon: AppleIcon, name: "macOS", released: true },
  { key: "windows", Icon: WindowsIcon, name: "Windows", released: false },
]

const primaryBtn =
  "rounded-lg bg-[#2f6bff] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#255ae0]"
const disabledBtn =
  "cursor-not-allowed rounded-lg border border-[#e5e7ee] bg-[#f4f5f8] px-4 py-2 text-[13px] font-semibold text-[#9098a8]"

export default function BeastCompanionSection() {
  // macOS connection summary, derived from the paired device (any active,
  // non-revoked, non-reset device is a Mac today).
  const [macConnected, setMacConnected] = useState(false)
  const [macVersion, setMacVersion] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await supabase
        .from("device_tokens")
        .select("app_version, revoked_at, pairing_reset_at")
        .is("revoked_at", null)
        .is("pairing_reset_at", null)
        .order("last_used_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!active) return
      if (data) {
        setMacConnected(true)
        setMacVersion((data.app_version as string) ?? null)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  return (
    <SettingsCard
      title="Beast Companion"
      description="Install Beast Companion on your desktop to sync your messages into your CRM."
    >
      <div className="divide-y divide-[#eceef3]">
        {PLATFORMS.map((p) => {
          const url = DOWNLOAD_URLS[p.key]
          const connected = p.key === "macos" && macConnected
          const version = p.key === "macos" ? macVersion : null

          const Icon = p.Icon
          const subline = !p.released
            ? "Available in a future release."
            : connected
              ? `Version ${version ?? "—"} · Connected`
              : "Not installed on this device."

          return (
            <div key={p.key} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
              {/* Platform identity + status (identical layout on both rows) */}
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex w-6 flex-none items-center justify-center text-[#111318]">
                  <Icon className="h-[18px] w-auto" />
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[14px] font-semibold text-[#111318]">
                    {p.name}
                    {p.released ? (
                      connected && (
                        <span className="rounded-full bg-[#e7f6ee] px-2 py-0.5 text-[11px] font-semibold text-[#16794c]">
                          Connected
                        </span>
                      )
                    ) : (
                      <span className="rounded-full bg-[#f4f5f8] px-2 py-0.5 text-[11px] font-semibold text-[#9098a8]">
                        Coming Soon
                      </span>
                    )}
                  </p>
                  <p className="text-[12.5px] text-[#6b7280]">{subline}</p>
                </div>
              </div>

              {/* Actions — same set on both rows; disabled for unreleased /
                  not-yet-published so Windows (and macOS pre-publish) match. */}
              <div className="flex flex-none items-center gap-2">
                {p.released && url ? (
                  <a href={url} className={primaryBtn}>
                    Download
                  </a>
                ) : (
                  <button type="button" disabled className={disabledBtn}>
                    {p.released ? "Download" : "Coming Soon"}
                  </button>
                )}
                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed rounded-lg border border-[#e5e7ee] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#9098a8]"
                >
                  Check for Updates
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </SettingsCard>
  )
}
