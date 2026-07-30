"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import SettingsShell, { SettingsCard } from "@/components/crm/settings/SettingsShell"

type Device = {
  id: string
  device_name: string | null
  token_prefix: string
  app_version: string | null
  created_at: string
  last_used_at: string | null
  last_synced_at: string | null
  sync_paused: boolean | null
  revoked_at: string | null
}

// "Connected" if seen within this window, else "Idle".
const ONLINE_WINDOW_MS = 15 * 60 * 1000

function relative(ts: string | null): string {
  if (!ts) return "Never"
  const d = new Date(ts).getTime()
  if (isNaN(d)) return "—"
  const diff = Date.now() - d
  const mins = Math.round(diff / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`
  return new Date(ts).toLocaleDateString("en-US", { dateStyle: "medium" } as Intl.DateTimeFormatOptions)
}

function connectionStatus(d: Device): { label: string; tone: "ok" | "warn" | "bad" } {
  if (d.revoked_at) return { label: "Revoked", tone: "bad" }
  if (d.sync_paused) return { label: "Paused", tone: "warn" }
  const seen = d.last_used_at ? Date.now() - new Date(d.last_used_at).getTime() : Infinity
  if (seen < ONLINE_WINDOW_MS) return { label: "Connected", tone: "ok" }
  return { label: "Idle", tone: "warn" }
}

// Connected Devices — paired Mac Companions. Reads/revokes via the RLS-scoped
// client (members may read + revoke their own workspace's devices). Revoking
// sets revoked_at, which the server-side token guard enforces on the device's
// next heartbeat/upload (→ the device shows "disconnected" and stops syncing).
export default function ConnectedDevicesClient() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase
      .from("device_tokens")
      .select("id, device_name, token_prefix, app_version, created_at, last_used_at, last_synced_at, sync_paused, revoked_at")
      .order("created_at", { ascending: false })
    setDevices((data as Device[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function revoke(id: string) {
    setRevoking(id)
    await supabase.from("device_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id)
    setRevoking(null)
    load()
  }

  const toneClass = {
    ok: "bg-[#e7f6ee] text-[#16794c]",
    warn: "bg-[#fdf3e3] text-[#9a6a12]",
    bad: "bg-[#fdecec] text-[#c0392b]",
  }

  return (
    <SettingsShell
      title="Connected Devices"
      description="Macs running the Locator Beast Companion. Revoke a device to immediately stop its access on its next check-in."
    >
      <SettingsCard>
        {loading ? (
          <p className="text-[13px] text-[#6b7280]">Loading…</p>
        ) : devices.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-[14px] font-semibold text-[#111318]">No devices connected</p>
            <p className="mt-1 text-[12.5px] text-[#6b7280]">Open the Locator Beast Companion on your Mac and click Connect to pair it.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#eceef3]">
            {devices.map((d) => {
              const status = connectionStatus(d)
              const revoked = !!d.revoked_at
              return (
                <div key={d.id} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-[#111318]">
                      {d.device_name || "Mac Companion"}{" "}
                      <span className="font-mono text-[12px] text-[#9098a8]">{d.token_prefix}…</span>
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-[12.5px] text-[#4b5162]">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass[status.tone]}`}>
                        Messages Sync: {status.label}
                      </span>
                    </p>
                    <p className="mt-1 text-[12px] text-[#6b7280]">
                      Last Sync: {relative(d.last_synced_at)} · Version: {d.app_version || "—"} · Connected {relative(d.created_at)}
                    </p>
                  </div>
                  {!revoked && (
                    <button
                      type="button"
                      onClick={() => revoke(d.id)}
                      disabled={revoking === d.id}
                      className="flex-none rounded-lg border border-[#f0c9c9] bg-white px-4 py-2 text-[13px] font-semibold text-[#c0392b] transition-colors hover:bg-[#fdecec] disabled:opacity-60"
                    >
                      {revoking === d.id ? "Revoking…" : "Revoke Device"}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </SettingsCard>
    </SettingsShell>
  )
}
