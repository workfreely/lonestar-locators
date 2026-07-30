"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import SettingsShell, { SettingsCard } from "@/components/crm/settings/SettingsShell"

type Device = {
  id: string
  device_name: string | null
  token_prefix: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

function fmt(ts: string | null): string {
  if (!ts) return "Never"
  const d = new Date(ts)
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
}

// Connected Devices — lists the workspace's paired Mac Companions and lets the
// user revoke any of them. Reads/writes device_tokens via the RLS-scoped client
// (members may read + revoke their own workspace's devices).
export default function ConnectedDevicesClient() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase
      .from("device_tokens")
      .select("id, device_name, token_prefix, created_at, last_used_at, revoked_at")
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

  return (
    <SettingsShell
      title="Connected Devices"
      description="Macs running the Locator Beast Companion that sync your Apple Messages. Revoke a device to immediately stop its access."
    >
      <SettingsCard>
        {loading ? (
          <p className="text-[13px] text-[#6b7280]">Loading…</p>
        ) : devices.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-[14px] font-semibold text-[#111318]">No devices connected</p>
            <p className="mt-1 text-[12.5px] text-[#6b7280]">
              Open the Locator Beast Companion on your Mac and click Connect to pair it.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#eceef3]">
            {devices.map((d) => {
              const revoked = !!d.revoked_at
              return (
                <div key={d.id} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-[#111318]">
                      {d.device_name || "Mac Companion"}{" "}
                      <span className="font-mono text-[12px] text-[#9098a8]">{d.token_prefix}…</span>
                      {revoked && <span className="ml-2 rounded-full bg-[#fdecec] px-2 py-0.5 text-[11px] font-semibold text-[#c0392b]">Revoked</span>}
                    </p>
                    <p className="text-[12px] text-[#6b7280]">
                      Last synced {fmt(d.last_used_at)} · Added {fmt(d.created_at)}
                    </p>
                  </div>
                  {!revoked && (
                    <button
                      type="button"
                      onClick={() => revoke(d.id)}
                      disabled={revoking === d.id}
                      className="flex-none rounded-lg border border-[#f0c9c9] bg-white px-4 py-2 text-[13px] font-semibold text-[#c0392b] transition-colors hover:bg-[#fdecec] disabled:opacity-60"
                    >
                      {revoking === d.id ? "Revoking…" : "Revoke"}
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
