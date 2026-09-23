// Locator-facing commission — the operational payout info shown on the LOCATOR
// surfaces only (Map card + Beast Companion Current Property card). It is NEVER
// shown on the client recommendation page (/r). Values come verbatim from the
// canonical property_catalog trusted-master columns (send_commission /
// escort_commission / bonus_flat) — never inferred from the web.

export type LocatorCommission = {
  /** e.g. "125%", "100%" — verbatim from property_catalog.send_commission. */
  sendCommission?: string | null;
  /** e.g. "125%", "75%" — verbatim from property_catalog.escort_commission. */
  escortCommission?: string | null;
  /** e.g. "$500", "500", "1 month" — verbatim from property_catalog.bonus_flat. */
  bonusFlat?: string | null;
};

function clean(v?: string | null): string | null {
  const s = (v ?? "").trim();
  if (!s || /^(unknown|n\/?a|none|-{1,2}|—)$/i.test(s)) return null;
  return s;
}

/** A bonus/flat value gets a leading "$" only when it reads as a bare dollar amount. */
function formatBonus(v: string): string {
  return /^\d[\d,]*(\.\d+)?$/.test(v) ? `$${v}` : v;
}

/**
 * Compact one-line locator commission, e.g. "Send 125% · Escort 125%" or
 * "Send 100% · Escort 75% · Bonus $500". Only the parts that are present and
 * verified are shown; returns null when nothing usable exists (caller hides the
 * row). Operational info — kept terse, not client-facing copy.
 */
export function formatLocatorCommission(c?: LocatorCommission | null): string | null {
  if (!c) return null;
  const parts: string[] = [];
  const send = clean(c.sendCommission);
  const escort = clean(c.escortCommission);
  const bonus = clean(c.bonusFlat);
  if (send) parts.push(`Send ${send}`);
  if (escort) parts.push(`Escort ${escort}`);
  if (bonus) parts.push(`Bonus ${formatBonus(bonus)}`);
  return parts.length ? parts.join(" · ") : null;
}
