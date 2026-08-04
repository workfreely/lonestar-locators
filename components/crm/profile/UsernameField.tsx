"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { SettingsCard } from "@/components/crm/settings/SettingsShell"

// Live, URL-friendly username editor for the public Smart Lead Form URL
// (locatorbeast.com/{username}). Auto-hyphenates as the user types (spaces and
// any non [a-z0-9] become single hyphens; lowercase; no leading hyphens),
// checks availability in real time, shows a live URL preview, and — when a
// name is taken — offers AVAILABLE alternatives to choose from (never auto-
// assigned). Saving goes through lb_set_username, which re-validates + enforces
// reservations server-side (the client transform is UX only, never trusted).

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
  const [suggestions, setSuggestions] = useState<string[]>([])
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
      setSuggestions([])
      return
    }
    if (value.length < 3 || value.length > 30) {
      setStatus("unavailable")
      setSuggestions([])
      return
    }

    setStatus("checking")
    setSuggestions([])
    const candidate = value
    debounceRef.current = setTimeout(async () => {
      const { data, error: rpcError } = await supabase.rpc("lb_username_available", {
        p_candidate: candidate,
      })
      if (rpcError) {
        setStatus("unavailable")
        return
      }
      if (data === true) {
        setStatus("available")
        setSuggestions([])
        return
      }
      // Taken/reserved — offer available alternatives (server-generated, all
      // guaranteed available under the same rules).
      setStatus("unavailable")
      const { data: sugg } = await supabase.rpc("lb_suggest_usernames", {
        p_base: candidate,
        p_limit: 6,
      })
      setSuggestions(Array.isArray(sugg) ? (sugg as string[]) : [])
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
    setSuggestions([])
    setOkMsg("Saved")
  }

  const canSave = status === "available" && !saving
  const showPreview = value.length >= 3 && status !== "unavailable"

  return (
    <SettingsCard
      title="Public form URL"
      description="Your Smart Lead Form link. Choose a username — lowercase letters, numbers, and hyphens (spaces become hyphens automatically)."
    >
      <div className="flex flex-col gap-3">
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

        {/* Live URL preview — updates in real time as the user types. */}
        {showPreview && (
          <div className="rounded-lg border border-[#dbe6ff] bg-[#f4f8ff] px-4 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">
              Your Smart Lead Form URL
            </p>
            <p className="mt-0.5 font-mono text-[14px] font-semibold text-[#2f6bff]">
              locatorbeast.com/{value}
            </p>
          </div>
        )}

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
                {value.length < 3 ? "At least 3 characters." : "That username is taken."}
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

        {/* Available alternatives — shown only when the entered name is taken.
            User must explicitly pick one; nothing is auto-assigned. */}
        {status === "unavailable" && suggestions.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-[#eceef3] pt-3">
            <p className="text-[12px] font-medium text-[#6b7280]">These are available — pick one:</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setValue(s)}
                  className="rounded-full border border-[#d9deea] bg-white px-3 py-1.5 font-mono text-[12.5px] text-[#111318] transition-colors hover:border-[#2f6bff] hover:bg-[#f4f8ff] hover:text-[#2f6bff]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </SettingsCard>
  )
}
