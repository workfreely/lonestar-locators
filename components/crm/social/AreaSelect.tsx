"use client"

import { useState } from "react"
import {
  areaOptionsForMarket,
  preservedAreaValue,
  districtOptionsForMarket,
  preservedDistrictValue,
} from "@/lib/social/intakeFields"

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
 *
 * ── TWO LAYERS, ONE COMPONENT ───────────────────────────────────────────────────────────────
 * `layer` chooses which bank and labels to render. "area" (the default — unchanged behaviour for
 * every existing caller) offers the market's Neighborhoods/Areas and Submarkets. "district"
 * offers the market's `districts`, the finer layer, so "Downtown Dallas" and "Arts District" can
 * be stored side by side instead of competing for one field.
 *
 * Both layers read the SAME canonical catalog through lib/social/intakeFields — a second options
 * array would be the duplicate list this component exists to avoid. Every district bank is empty
 * today, so the district layer opens straight into free text; the preservation guarantee above is
 * what keeps a value typed there safe across a market switch.
 */
export default function AreaSelect({
  market,
  value,
  onChange,
  className,
  layer = "area",
}: {
  market: string
  value: string
  onChange: (v: string) => void
  className?: string
  layer?: "area" | "district"
}) {
  const isDistrict = layer === "district"
  const area = areaOptionsForMarket(market)
  const neighborhoods = isDistrict ? districtOptionsForMarket(market) : area.neighborhoods
  const submarkets = isDistrict ? [] : area.submarkets
  const preserved = isDistrict ? preservedDistrictValue(market, value) : preservedAreaValue(market, value)
  const groupLabel = isDistrict ? "Neighborhoods / Districts" : "Neighborhoods / Areas"
  const emptyLabel = isDistrict ? "Select district…" : "Select area / neighborhood…"
  const typePlaceholder = isDistrict ? "Type a specific district" : "Type an area / neighborhood"
  // "Other…" is sticky: once chosen it stays a free-text field until the user picks a canonical
  // option, so typing is not interrupted by a re-render.
  const hasBank = neighborhoods.length > 0 || submarkets.length > 0
  // A select whose only real option is "Other…" is a dead end, so a DISTRICT layer with no bank
  // opens straight into the text field. Scoped to the district layer on purpose: the area layer
  // mounts before a market is chosen, when its bank is also momentarily empty, and keying off
  // hasBank alone would leave it stuck in free text after the market arrived.
  const [freeText, setFreeText] = useState(isDistrict && !hasBank)

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
          placeholder={typePlaceholder}
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
      <option value="">{emptyLabel}</option>
      {/* A saved value the current market's bank does not contain — kept so switching markets
          cannot destroy it. */}
      {preserved && (
        <optgroup label="Current value">
          <option value={preserved}>{preserved}</option>
        </optgroup>
      )}
      {neighborhoods.length > 0 && (
        <optgroup label={groupLabel}>
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
