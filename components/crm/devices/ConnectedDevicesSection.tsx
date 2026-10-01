"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { SettingsCard } from "@/components/crm/settings/SettingsShell"
import {
  deriveBeastSyncStatus,
  statusForDevice,
  lastSyncText,
  FULL_DISK_ACCESS_SETTINGS_URL,
  type DeviceRow,
} from "@/lib/companion/syncStatus"

// Beast Sync — the paired Macs that sync Apple Messages into the CRM.
//
// Reads/updates device_tokens via the RLS-scoped client (members may read +
// pause/reset/disconnect their own workspace's devices); the server-side token
// guard enforces the effect on the device's next check-in. Rendered as an
// embeddable SettingsCard (no shell) so it lives on the Integrations page.
//
// ONE STATUS SYSTEM. Every label here comes from lib/companion/syncStatus, which
// the Mac-facing heartbeat and this card both answer to. This file used to carry
// its own five labels ("Idle", "Revoked", "Reset — reconnect required") that no
// other surface used, so the CRM and the app could disagree about the same Mac.
type Device = DeviceRow & { token_prefix?: string | null }

export default function ConnectedDevicesSection() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    // select("*") deliberately, NOT a column list: fda_granted / sync_phase
    // (migration 20261011) may not be applied yet, and naming a missing column
    // makes PostgREST fail the whole request — which would blank the card rather
    // than degrade. Absent columns simply arrive undefined, which the deriver
    // treats as "not reported".
    const { data } = await supabase
      .from("device_tokens")
      .select("*")
      .order("created_at", { ascending: false })
    setDevices((data as Device[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function apply(id: string, patch: Record<string, unknown>) {
    setBusy(id)
    await supabase.from("device_tokens").update(patch).eq("id", id)
    setBusy(null)
    load()
  }

  const pause = (id: string) => apply(id, { sync_paused: true })
  const resume = (id: string) => apply(id, { sync_paused: false })
  const revoke = (id: string) => apply(id, { revoked_at: new Date().toISOString() })
  // Reset = invalidate the current token + require re-pair, preserving history.
  const resetPairing = (id: string) =>
    apply(id, { pairing_reset_at: new Date().toISOString(), sync_paused: false })

  const toneClass = {
    ok: "bg-[#e7f6ee] text-[#16794c]",
    warn: "bg-[#fdf3e3] text-[#9a6a12]",
    bad: "bg-[#fdecec] text-[#c0392b]",
    muted: "bg-[#f1f2f6] text-[#6b7280]",
  }
  const neutralBtn =
    "rounded-lg border border-[#e5e7ee] bg-white px-2.5 py-1 text-[12px] font-medium text-[#4b5162] transition-colors hover:bg-[#f4f5f8] disabled:opacity-60"
  const dangerBtn =
    "rounded-lg border border-[#f0c9c9] bg-white px-2.5 py-1 text-[12px] font-medium text-[#c0392b] transition-colors hover:bg-[#fdecec] disabled:opacity-60"
  const primaryBtn =
    "flex-none rounded-lg bg-[#2f6bff] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#255ae0]"

  const live = devices.filter((d) => !d.revoked_at)
  const status = deriveBeastSyncStatus(devices)
  const pausedDevice = live.find((d) => d.sync_paused)

  return (
    <SettingsCard title="Beast Sync">
      {loading ? (
        <p className="text-[13px] text-[#6b7280]">Loading…</p>
      ) : (
        <>
          {/* ── Workspace status: the one line an agent reads ─────────────────
              Answers "is Beast Sync working for me?" without mentioning tokens,
              pairing records or revocation. Device-level management lives below
              and is only rendered once there is a device to manage. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <p className="text-[14px] font-semibold text-[#111318]">{status.label}</p>
                {status.state === "connected" && (
                  <span className={`flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass.ok}`}>
                    Last sync: {lastSyncText(status.lastSyncedAt)}
                  </span>
                )}
              </div>
              {status.detail && <p className="mt-1 text-[12.5px] leading-relaxed text-[#6b7280]">{status.detail}</p>}
            </div>

            {/* Exactly one primary action, chosen by the state. Nothing here is
                offered unless it does something now: the Mac starts pairing
                itself (it opens /companion/pair), so there is no browser-side
                "Connect" to press — the honest action is telling the agent what
                to open. */}
            {status.needsPermission ? (
              <a href={FULL_DISK_ACCESS_SETTINGS_URL} className={primaryBtn}>
                Open System Settings
              </a>
            ) : status.state === "sync_paused" && pausedDevice ? (
              <button
                type="button"
                onClick={() => resume(pausedDevice.id)}
                disabled={busy === pausedDevice.id}
                className={primaryBtn}
              >
                Resume Sync
              </button>
            ) : null}
            {/* STEP 6 SLOT — "Refresh Sync" belongs here, next to the Connected
                state. Deliberately not rendered yet: the outbound pull queue it
                needs does not exist, and a button that cannot refresh anything is
                worse than the "Last sync" line above, which is true. */}
          </div>

          {status.state === "not_connected" && (
            <ol className="mt-4 space-y-1.5 border-t border-[#eceef3] pt-4 text-[12.5px] leading-relaxed text-[#4b5162]">
              <li>1. Open <span className="font-semibold text-[#111318]">Beast Sync</span> on your Mac.</li>
              <li>2. Choose <span className="font-semibold text-[#111318]">Connect Locator Beast</span> from its menu-bar icon.</li>
              <li>3. Approve this workspace in the browser tab it opens.</li>
            </ol>
          )}

          {/* ── Per-Mac management ──────────────────────────────────────────── */}
          {live.length > 0 && (
            <div className="mt-5 divide-y divide-[#eceef3] border-t border-[#eceef3] pt-1">
              {live.map((d) => {
                const s = statusForDevice(d)
                return (
                  <div key={d.id} className="flex items-center justify-between gap-4 py-4 last:pb-0">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <p className="truncate text-[14px] font-semibold text-[#111318]">
                        {d.device_name || "Beast Sync (Mac)"}
                      </p>
                      <span className={`flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass[s.tone]}`}>
                        {s.label}
                      </span>
                    </div>
                    <div className="flex flex-none flex-wrap items-center justify-end gap-2">
                      {!d.pairing_reset_at &&
                        (d.sync_paused ? (
                          <button type="button" onClick={() => resume(d.id)} disabled={busy === d.id} className={neutralBtn}>
                            Resume
                          </button>
                        ) : (
                          <button type="button" onClick={() => pause(d.id)} disabled={busy === d.id} className={neutralBtn}>
                            Pause
                          </button>
                        ))}
                      <button type="button" onClick={() => resetPairing(d.id)} disabled={busy === d.id} className={neutralBtn}>
                        Reconnect
                      </button>
                      <button type="button" onClick={() => revoke(d.id)} disabled={busy === d.id} className={dangerBtn}>
                        Disconnect
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </SettingsCard>
  )
}
