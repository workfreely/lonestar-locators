"use client"

import { useState } from "react"
import { areaOptionsForMarket, preservedAreaValue } from "@/lib/social/intakeFields"

/**
 * SOCIAL BEAST — Area / Neighborhood, market-aware.
 *
 * Options come from the CANONICAL market catalog (lib/markets/catalog.ts) — the same
 * `neighborhoods` and `submarkets` the Smart Lead Form reads. Social Beast stores ONE free-text
 * area_neighborhood value, so the two groups share a single <select> but keep their own <optgroup>
 * labels; the stored format is unchanged.
 *
 * ── WHY A VALUE IS NEVER SILENTLY LOST ──────────────────────────────────────────────────────
 * Changing Market changes the option list. A previously saved area that is not in the new market's
 * bank is rendered as its own option and stays selected, so switching markets cannot delete it. The
 * operator can then pick a canonical option or keep theirs — but the deletion is always their act.
 *
 * "Other…" keeps free text reachable for an area the catalog does not carry yet.
 */
export default function AreaSelect({
  market,
  value,
  onChange,
  className,
}: {
  market: string
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  const { neighborhoods, submarkets } = areaOptionsForMarket(market)
  const preserved = preservedAreaValue(market, value)
  // "Other…" is sticky: once chosen it stays a free-text field until the user picks a canonical
  // option, so typing is not interrupted by a re-render.
  const [freeText, setFreeText] = useState(false)
  const hasBank = neighborhoods.length > 0 || submarkets.length > 0

  if (!market) {
    return (
      <select className={className} disabled value="">
        <option value="">Select a market first…</option>
      </select>
    )
  }

  if (freeText) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          className={className}
          value={value}
          autoFocus
          placeholder="Type an area / neighborhood"
          onChange={(e) => onChange(e.target.value)}
        />
        {hasBank && (
          <button
            type="button"
            onClick={() => setFreeText(false)}
            className="flex-none text-[11px] font-semibold text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)]"
          >
            List
          </button>
        )}
      </div>
    )
  }

  return (
    <select
      className={className}
      value={value}
      onChange={(e) => {
        if (e.target.value === "__other__") { setFreeText(true); return }
        onChange(e.target.value)
      }}
    >
      <option value="">Select area / neighborhood…</option>
      {/* A saved value the current market's bank does not contain — kept so switching markets
          cannot destroy it. */}
      {preserved && (
        <optgroup label="Current value">
          <option value={preserved}>{preserved}</option>
        </optgroup>
      )}
      {neighborhoods.length > 0 && (
        <optgroup label="Neighborhoods / Areas">
          {neighborhoods.map((n) => <option key={n} value={n}>{n}</option>)}
        </optgroup>
      )}
      {submarkets.length > 0 && (
        <optgroup label="Submarkets">
          {submarkets.map((s) => <option key={s} value={s}>{s}</option>)}
        </optgroup>
      )}
      <option value="__other__">Other…</option>
    </select>
  )
}
