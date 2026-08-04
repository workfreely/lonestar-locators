"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { SettingsCard } from "@/components/crm/settings/SettingsShell"

// Live, URL-friendly username editor for the public Smart Lead Form URL
// (locatorbeast.com/{username}). Auto-hyphenates as the user types (spaces and
// any non [a-z0-9] become single hyphens; lowercase; no leading hyphens) and
// checks availability in real time via the lb_username_available RPC. Saving
// goes through lb_set_username, which re-validates + enforces reservations
// server-side (the client transform is UX only, never trusted).

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // spaces/underscores/punct → single hyphen
    .replace(/^-+/, "") // no leading hyphen (allow a transient trailing one)
}

type Status = "current" | "checking" | "available" | "unavailable"

export default function UsernameField({ initialUsername }: { initialUsername: string | null }) {
  const [saved, setSaved] = useState<string | null>(initialUsername)
  const [value, setValue] = useState<string>(initialUsername ?? "")
  const [status, setStatus] = useState<Status>("current")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setError(null)
    setOkMsg(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value === (saved ?? "")) {
      setStatus("current")
      return
    }
    if (value.length < 3 || value.length > 30) {
      setStatus("unavailable")
      return
    }

    setStatus("checking")
    debounceRef.current = setTimeout(async () => {
      const { data, error: rpcError } = await supabase.rpc("lb_username_available", {
        p_candidate: value,
      })
      if (rpcError) {
        setStatus("unavailable")
        return
      }
      setStatus(data === true ? "available" : "unavailable")
    }, 400)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value, saved])

  async function save() {
    setSaving(true)
    setError(null)
    setOkMsg(null)
    const { data, error: rpcError } = await supabase.rpc("lb_set_username", { p_candidate: value })
    setSaving(false)

    if (rpcError) {
      const msg = rpcError.message || ""
      setError(
        msg.includes("username_taken")
          ? "That username is already taken."
          : msg.includes("reserved_username")
          ? "That username is reserved and can't be used."
          : msg.includes("invalid_username")
          ? "Use 3–30 characters: lowercase letters, numbers, and hyphens."
          : "Couldn't save that username. Please try again."
      )
      return
    }

    const finalSlug = typeof data === "string" ? data : value
    setSaved(finalSlug)
    setValue(finalSlug)
    setStatus("current")
    setOkMsg("Saved")
  }

  const canSave = status === "available" && !saving

  return (
    <SettingsCard
      title="Public form URL"
      description="Your Smart Lead Form link. Choose a username — lowercase letters, numbers, and hyphens (spaces become hyphens automatically)."
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-[#e5e7ee] bg-[#f4f5f8] px-3 py-2.5">
          <span className="font-mono text-[13px] text-[#6b7280]">locatorbeast.com/</span>
          <input
            value={value}
            onChange={(e) => setValue(toSlug(e.target.value))}
            placeholder="jay-morris"
            maxLength={30}
            spellCheck={false}
            autoCapitalize="none"
            className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-[#111318] outline-none"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px]">
            {error ? (
              <span className="text-red-600">{error}</span>
            ) : okMsg ? (
              <span className="text-emerald-600">✓ {okMsg}</span>
            ) : status === "checking" ? (
              <span className="text-[#9098a8]">Checking availability…</span>
            ) : status === "available" ? (
              <span className="text-emerald-600">✓ Available</span>
            ) : status === "unavailable" ? (
              <span className="text-red-600">
                {value.length < 3 ? "At least 3 characters." : "Not available."}
              </span>
            ) : saved ? (
              <span className="text-[#9098a8]">This is your current URL.</span>
            ) : (
              <span className="text-[#9098a8]">Pick a username to activate your public form.</span>
            )}
          </span>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="flex-none rounded-lg bg-[#2f6bff] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#265fe0] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save username"}
          </button>
        </div>
      </div>
    </SettingsCard>
  )
}
