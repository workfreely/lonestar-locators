"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// Agent picker for "+ Add Publishing Destination". Searches EXISTING Locator Beast agents
// (profiles) via /agents/search (admin-only, definer-backed) and shows a compact autocomplete:
// avatar, first + last name, and email only when needed to disambiguate. Selecting one calls
// onSelect with the agent's id + display fields. No Instagram search — the connected identity
// still comes from OAuth later. Mirrors PropertySearchField's debounce/dropdown pattern.

export type AgentHit = { id: string; name: string; photoUrl: string | null; email: string | null }

function Avatar({ name, photoUrl, size = 22 }: { name: string; photoUrl: string | null; size?: number }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase()
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt="" width={size} height={size} className="rounded-full object-cover flex-none" style={{ width: size, height: size }} />
  }
  return (
    <span className="rounded-full flex-none inline-flex items-center justify-center bg-[var(--crm-inset)] text-[var(--crm-text-secondary)] font-semibold" style={{ width: size, height: size, fontSize: size * 0.5 }}>
      {initial}
    </span>
  )
}

export default function AgentSearchField({
  onSelect,
  inputClassName,
  placeholder,
}: {
  onSelect: (a: AgentHit) => void
  inputClassName?: string
  placeholder?: string
}) {
  const [value, setValue] = useState("")
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<AgentHit[]>([])
  const [searching, setSearching] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const run = useCallback(async (q: string) => {
    setSearching(true)
    try {
      const res = await fetch(`/api/admin/social-autopilot/agents/search?q=${encodeURIComponent(q.trim())}`)
      const data = await res.json().catch(() => null)
      const list: AgentHit[] = res.ok && Array.isArray(data?.agents) ? data.agents : []
      // Show email only when two results share the same display name.
      setResults(list)
      setOpen(list.length > 0)
    } catch {
      setResults([])
      setOpen(false)
    } finally {
      setSearching(false)
    }
  }, [])

  const onInput = (v: string) => {
    setValue(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void run(v), 300)
  }

  const nameCounts = results.reduce<Record<string, number>>((m, r) => ((m[r.name] = (m[r.name] ?? 0) + 1), m), {})

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => onInput(e.target.value)}
        onFocus={() => { if (results.length > 0) setOpen(true); else void run(value) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? "Search agents by name"}
        className={inputClassName}
        autoComplete="off"
      />
      {open && (results.length > 0 || searching) && (
        <div className="absolute z-30 mt-1 left-0 right-0 max-h-[240px] overflow-y-auto rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] shadow-lg">
          {searching && results.length === 0 && <div className="px-3 py-2 text-[11.5px] text-[var(--crm-text-muted)]">Searching…</div>}
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              // onMouseDown so it fires before the input's onBlur closes the list.
              onMouseDown={(e) => { e.preventDefault(); onSelect(r); setOpen(false); setValue("") }}
              className="flex w-full items-center gap-2 text-left px-3 py-1.5 hover:bg-[var(--crm-card)]"
            >
              <Avatar name={r.name} photoUrl={r.photoUrl} />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold text-[var(--crm-text-primary)] truncate">{r.name}</span>
                {(nameCounts[r.name] > 1 || !r.name) && r.email && (
                  <span className="block text-[11px] text-[var(--crm-text-muted)] truncate">{r.email}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
