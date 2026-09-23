"use client"

import { useEffect, useState, type ReactNode } from "react"
import { supabase } from "@/lib/supabase/client"
import { FaAndroid, FaCommentDots } from "react-icons/fa6"
import { SettingsCard } from "@/components/crm/settings/SettingsShell"
import { AppleIcon, WindowsIcon } from "@/components/icons/PlatformIcons"

// Integrations — Beast Sync + messaging grouped by DEVICE ECOSYSTEM so an agent
// immediately sees what applies to them: "Mac + iPhone" vs "Windows + Android".
//
// Presentation reorganization ONLY. Beast Sync's behaviour is byte-preserved from
// the previous standalone card: the installer URLs stay EMPTY (empty = pending,
// never fabricated), the macOS Download/Check-for-Updates buttons stay disabled
// until a signed installer is published, and the macOS connection state is still
// read from the same device_tokens query. iPhone Messages keeps the official
// Apple support link; Google Messages stays "Coming Soon" with no link. No
// integration/messaging logic changed.

// Beast Sync installer URLs — set once each platform's signed installer is
// published. Empty = not yet downloadable (button shows a pending state). Never
// fabricate a URL. (Unchanged from the previous Beast Sync card.)
const BEAST_SYNC_DOWNLOAD_URLS = { macos: "", windows: "" }

// Apple's official Messages support hub (stable canonical URL). Opens a new tab.
const APPLE_MESSAGES_SETUP_URL = "https://support.apple.com/messages"

const primaryBtn =
  "rounded-lg bg-[#2f6bff] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#255ae0]"
const disabledBtn =
  "cursor-not-allowed rounded-lg border border-[#e5e7ee] bg-[#f4f5f8] px-4 py-2 text-[13px] font-semibold text-[#9098a8]"
const updatesBtn =
  "cursor-not-allowed rounded-lg border border-[#e5e7ee] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#9098a8]"
const setupBtn =
  "rounded-lg border border-[#e5e7ee] bg-white px-4 py-2 text-[13px] font-semibold text-[#111318] transition-colors hover:bg-[#f4f5f8]"

const ComingSoonPill = (
  <span className="rounded-full bg-[#f4f5f8] px-2 py-0.5 text-[11px] font-semibold text-[#9098a8]">Coming Soon</span>
)
const ConnectedPill = (
  <span className="rounded-full bg-[#e7f6ee] px-2 py-0.5 text-[11px] font-semibold text-[#16794c]">Connected</span>
)
// Account-level Automated Texting capability status. Shown only for an authorized
// account (the row itself is authorization-gated). Status/capability only — this is
// NOT a per-client enrollment control (that stays in the Beast Companion menu).
const EnabledPill = (
  <span className="rounded-full bg-[#e7f6ee] px-2 py-0.5 text-[11px] font-semibold text-[#16794c]">Enabled</span>
)

// One shared row primitive so every row — Beast Sync and messaging, Mac and
// Windows — has identical height, spacing, icon alignment, and typography.
function Row({
  icon, name, pill, descriptor, actions,
}: {
  icon: ReactNode
  name: string
  pill?: ReactNode
  descriptor: string
  actions: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex w-6 flex-none items-center justify-center text-[#111318]">{icon}</span>
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-[#111318]">
            {name}
            {pill}
          </p>
          <p className="text-[12.5px] text-[#6b7280]">{descriptor}</p>
        </div>
      </div>
      <div className="flex flex-none items-center gap-2">{actions}</div>
    </div>
  )
}

export default function DeviceEcosystemSection({ automatedTextingAuthorized = false }: { automatedTextingAuthorized?: boolean }) {
  // macOS connection summary — same query as the previous Beast Sync card (any
  // active, non-revoked, non-reset device is a Mac today).
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

  const macUrl = BEAST_SYNC_DOWNLOAD_URLS.macos
  const beastSyncUpdates = (
    <button type="button" disabled className={updatesBtn}>
      Check for Updates
    </button>
  )

  return (
    <>
      {/* ── Mac + iPhone ─────────────────────────────────────────────────── */}
      <SettingsCard title="Mac + iPhone" description="Beast Sync on your Mac syncs your iPhone Messages into your CRM.">
        <div className="divide-y divide-[#eceef3]">
          <Row
            icon={<AppleIcon className="h-[18px] w-auto" />}
            name="Beast Sync for macOS"
            pill={macConnected ? ConnectedPill : undefined}
            descriptor={macConnected ? `Version ${macVersion ?? "—"} · Connected` : "Desktop app"}
            actions={
              <>
                {macUrl ? (
                  <a href={macUrl} className={primaryBtn}>Download</a>
                ) : (
                  <button type="button" disabled className={disabledBtn}>Download</button>
                )}
                {beastSyncUpdates}
              </>
            }
          />
          <Row
            icon={<AppleIcon className="h-[18px] w-auto" />}
            name="iPhone Messages"
            descriptor="Works with Beast Sync on Mac"
            actions={
              <a href={APPLE_MESSAGES_SETUP_URL} target="_blank" rel="noopener noreferrer" className={setupBtn}>
                Setup Guide
              </a>
            }
          />
          {/* Automated Texting (authorization-gated, account-level capability/status).
              Renders ONLY for an account authorized for unattended Automated Texting —
              an unauthorized account never receives the flag. Account-level ONLY: the
              per-client on/off enrollment control lives in the Beast Companion
              hamburger menu, not here. Inert safety + authorization behaviour unchanged. */}
          {automatedTextingAuthorized && (
            <Row
              icon={<FaCommentDots className="h-[18px] w-auto" />}
              name="Automated Texting"
              descriptor="Automated follow-up through Beast Sync"
              actions={EnabledPill}
            />
          )}
        </div>
      </SettingsCard>

      {/* ── Windows + Android ────────────────────────────────────────────── */}
      <SettingsCard title="Windows + Android" description="Windows Beast Sync and Android messaging support are on the way.">
        <div className="divide-y divide-[#eceef3]">
          <Row
            icon={<WindowsIcon className="h-[18px] w-auto" />}
            name="Beast Sync for Windows"
            pill={ComingSoonPill}
            descriptor="Desktop app"
            actions={
              <>
                <button type="button" disabled className={disabledBtn}>Coming Soon</button>
                {beastSyncUpdates}
              </>
            }
          />
          <Row
            icon={<FaAndroid className="h-[18px] w-auto" />}
            name="Google Messages"
            pill={ComingSoonPill}
            descriptor="Android messaging support"
            actions={<button type="button" disabled className={disabledBtn}>Coming Soon</button>}
          />
        </div>
      </SettingsCard>
    </>
  )
}
