"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useState, useRef, useEffect } from "react"
import { ALL_AGENTS, UNASSIGNED, type RosterAgent } from "@/lib/social/agentRoster"

// The Social Beast agent selector. Sits in the shell's tab bar, so it is present on every section
// and survives a tab change.
//
// ── IT CHANGES A QUERY STRING. THAT IS ALL IT CAN DO. ───────────────────────────────────────
// Selecting an agent calls router.push with ?agent=<id>. There is no mutation here, no fetch, no
// form, no action — nothing in this file can alter a destination, a schedule, a token, a
// permission or an ownership field. A section that does not read the parameter is unaffected by
// it, which is what keeps Queue, Calendar, History and Analytics exactly as they were.
//
// The choice lives in the URL rather than component state so a refresh, a copied link and a tab
// change all land on the same view, with no second place for the selection to be stored.

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?"
}

function Dot({ tone }: { tone: "ok" | "warn" | "idle" }) {
  const color = tone === "warn" ? "#d97706" : tone === "ok" ? "#1f9d55" : "var(--crm-text-muted)"
  return <span aria-hidden className="inline-block h-1.5 w-1.5 flex-none rounded-full" style={{ background: color }} />
}

/** One line of health, the reason the All Accounts view exists. */
function health(a: RosterAgent): { tone: "ok" | "warn" | "idle"; text: string } {
  const accounts = a.instagram + a.tiktok
  const bits: string[] = []
  // The account count comes FIRST and is never dropped. An earlier version replaced it with
  // whatever needed attention, so an agent with one working account and one pending invitation
  // read "1 pending invite" — which looks like an agent who has nothing connected.
  bits.push(accounts === 0 ? "no accounts yet" : `${accounts} account${accounts > 1 ? "s" : ""}`)
  if (a.problems > 0) bits.push(`${a.problems} needs attention`)
  if (a.paused > 0) bits.push(`${a.paused} paused`)
  if (a.pendingInvites > 0) bits.push(`${a.pendingInvites} pending invite${a.pendingInvites > 1 ? "s" : ""}`)
  const tone: "ok" | "warn" | "idle" = a.problems > 0 ? "warn" : accounts === 0 ? "idle" : "ok"
  return { tone, text: bits.join(" · ") }
}

export default function AgentSelector({ roster }: { roster: RosterAgent[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const selected = params.get("agent") || ALL_AGENTS
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", away)
    document.addEventListener("keydown", esc)
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc) }
  }, [open])

  const choose = (id: string) => {
    setOpen(false)
    const next = new URLSearchParams(params.toString())
    // ALL is the default, so it is represented by the ABSENCE of the parameter rather than by
    // ?agent=all — one canonical URL for the default view.
    if (id === ALL_AGENTS) next.delete("agent")
    else next.set("agent", id)
    const qs = next.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  const totals = roster.reduce(
    (acc, a) => ({
      accounts: acc.accounts + a.instagram + a.tiktok,
      paused: acc.paused + a.paused,
      problems: acc.problems + a.problems,
    }),
    { accounts: 0, paused: 0, problems: 0 },
  )
  const current = selected === ALL_AGENTS ? null : roster.find((a) => a.id === selected) ?? null
  const label = current ? current.name : "All Accounts"

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--crm-border)] bg-[var(--crm-card)] px-3 py-2 text-[12.5px] font-semibold text-[var(--crm-text-primary)] hover:bg-[var(--crm-border)] transition-colors"
      >
        {current ? (
          current.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.photoUrl} alt="" className="h-5 w-5 flex-none rounded-full object-cover" />
          ) : (
            <span className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[var(--crm-panel)] text-[9px] font-bold text-[var(--crm-text-secondary)]">
              {initials(current.name)}
            </span>
          )
        ) : (
          <Dot tone={totals.problems > 0 ? "warn" : "ok"} />
        )}
        <span className="max-w-[150px] truncate">{label}</span>
        <span aria-hidden className="text-[var(--crm-text-muted)]">▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-30 mt-1.5 w-[268px] overflow-hidden rounded-xl border border-[var(--crm-border)] bg-[var(--crm-card)] shadow-lg"
        >
          <button
            type="button"
            role="option"
            aria-selected={selected === ALL_AGENTS}
            onClick={() => choose(ALL_AGENTS)}
            className={
              "flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[var(--crm-panel)] " +
              (selected === ALL_AGENTS ? "bg-[var(--crm-panel)]" : "")
            }
          >
            <Dot tone={totals.problems > 0 ? "warn" : "ok"} />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-semibold text-[var(--crm-text-primary)]">All Accounts</span>
              <span className="block text-[11px] text-[var(--crm-text-muted)]">
                {totals.accounts} account{totals.accounts === 1 ? "" : "s"}
                {totals.problems > 0 ? ` · ${totals.problems} needs attention` : ""}
                {totals.paused > 0 ? ` · ${totals.paused} paused` : ""}
              </span>
            </span>
          </button>

          <div className="h-px bg-[var(--crm-border)]" />

          {roster.map((a) => {
            const h = health(a)
            const isSel = selected === a.id
            return (
              <button
                key={a.id}
                type="button"
                role="option"
                aria-selected={isSel}
                onClick={() => choose(a.id)}
                className={
                  "flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[var(--crm-panel)] " +
                  (isSel ? "bg-[var(--crm-panel)]" : "")
                }
              >
                {a.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.photoUrl} alt="" className="h-6 w-6 flex-none rounded-full object-cover" />
                ) : (
                  <span className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[var(--crm-panel)] text-[9.5px] font-bold text-[var(--crm-text-secondary)]">
                    {a.id === UNASSIGNED ? "—" : initials(a.name)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-[var(--crm-text-primary)]">{a.name}</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-[var(--crm-text-muted)]">
                    <Dot tone={h.tone} />
                    <span className="truncate">{h.text}</span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
