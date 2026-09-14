"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { SOCIAL_SPECIAL_OPTIONS, giftCardLabel, isGiftCardSpecial, sanitizeCustomSpecial } from "@/lib/social/socialSpecial"

// Single-select Social Special for a post: standardized short-forms + Gift Card (optional amount) +
// Custom. ONE primary value per post. The parent stores the resolved display string; when empty,
// generated copy falls back to the normalized raw Current Special (shown as `fallbackHint`).

type Mode = "idle" | "giftcard" | "custom"

export default function SpecialSelect({
  value,
  onChange,
  fallbackHint,
}: {
  value: string
  onChange: (v: string) => void
  fallbackHint?: string
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>("idle")
  const [amount, setAmount] = useState("")
  const [custom, setCustom] = useState("")
  const wrapRef = useRef<HTMLDivElement>(null)

  // Infer the editing mode from an existing stored value when it changes externally (load/sync).
  useEffect(() => {
    if (isGiftCardSpecial(value)) {
      setMode("giftcard")
      setAmount((value.match(/[\d,]+/)?.[0] ?? "").replace(/,/g, ""))
    } else if (value && !SOCIAL_SPECIAL_OPTIONS.includes(value)) {
      setMode("custom")
      setCustom(value)
    } else {
      setMode("idle")
    }
  }, [value])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  const control = "rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)]"

  const chip = useMemo(() => value.trim(), [value])

  const pickOption = (opt: string) => { setMode("idle"); onChange(opt); setOpen(false) }
  const pickGiftCard = () => { setMode("giftcard"); onChange(giftCardLabel(amount)); setOpen(false) }
  const pickCustom = () => { setMode("custom"); setOpen(false) }
  const clear = () => { setMode("idle"); setAmount(""); setCustom(""); onChange("") }

  return (
    <div ref={wrapRef} className="relative">
      <div className={`mt-1 flex flex-wrap items-center gap-1.5 ${control} p-2 min-h-[40px]`}>
        {chip ? (
          <span className="inline-flex items-center gap-1 h-fit text-[12px] font-semibold px-2 py-0.5 rounded-full bg-[var(--crm-panel)] border border-[var(--crm-border)] text-[var(--crm-text-primary)]">
            {chip}
            <button type="button" aria-label="Clear social special" className="text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)]" onClick={clear}>×</button>
          </span>
        ) : (
          <button type="button" className="text-[12.5px] text-[var(--crm-text-muted)]" onClick={() => setOpen((o) => !o)}>
            {fallbackHint ? `Auto: ${fallbackHint} — choose to override…` : "Choose a special…"}
          </button>
        )}
        <button type="button" aria-label="Open special options" className="ml-auto text-[12px] text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)]" onClick={() => setOpen((o) => !o)}>▾</button>
      </div>

      {/* Gift Card amount (shown while editing a gift-card special). */}
      {mode === "giftcard" && (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[11px] text-[var(--crm-text-muted)]">Amount $</span>
          <input
            className={`${control} px-2 py-1 text-[13px] w-28 text-[var(--crm-text-primary)]`}
            inputMode="numeric"
            value={amount}
            onChange={(e) => { const a = e.target.value.replace(/[^\d]/g, ""); setAmount(a); onChange(giftCardLabel(a)) }}
            placeholder="500 (optional)"
          />
          <span className="text-[11px] text-[var(--crm-text-muted)]">→ {giftCardLabel(amount)}</span>
        </div>
      )}

      {/* Custom promo entry. */}
      {mode === "custom" && (
        <div className="mt-1 flex items-center gap-2">
          <input
            className={`${control} px-2 py-1 text-[13px] flex-1 text-[var(--crm-text-primary)]`}
            value={custom}
            onChange={(e) => { setCustom(e.target.value); onChange(sanitizeCustomSpecial(e.target.value)) }}
            placeholder="Concise custom promo"
            maxLength={60}
          />
        </div>
      )}

      {open && (
        <div className={`absolute z-20 mt-1 w-full max-h-[260px] overflow-auto ${control} shadow-lg py-1`}>
          {SOCIAL_SPECIAL_OPTIONS.map((opt) => (
            <button key={opt} type="button" className="block w-full text-left text-[13px] px-3 py-1.5 text-[var(--crm-text-primary)] hover:bg-[var(--crm-panel)]" onMouseDown={(e) => { e.preventDefault(); pickOption(opt) }}>
              {opt}
            </button>
          ))}
          <button type="button" className="block w-full text-left text-[13px] px-3 py-1.5 text-[var(--crm-text-primary)] hover:bg-[var(--crm-panel)] border-t border-[var(--crm-border)]" onMouseDown={(e) => { e.preventDefault(); pickGiftCard() }}>
            Gift Card <span className="text-[var(--crm-text-muted)]">(add amount)</span>
          </button>
          <button type="button" className="block w-full text-left text-[13px] px-3 py-1.5 text-[var(--crm-text-secondary)] hover:bg-[var(--crm-panel)]" onMouseDown={(e) => { e.preventDefault(); pickCustom() }}>
            Custom…
          </button>
        </div>
      )}
    </div>
  )
}
