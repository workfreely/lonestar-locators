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

/**
 * The commission STATUS a locator card shows. `Unknown ≠ No`: a blank/Unknown value
 * is NEVER treated as "does not pay" — it is `unverified`.
 *   • paying     — at least one real positive value; `text` is the compact line.
 *   • not_paying — an EXPLICIT negative was recorded (e.g. "No", "0%", "$0",
 *                  "Not Paying"); shown as a red "Not Paying Locators".
 *   • unverified — blank / Unknown / N/A / TBD / "None"; shown neutral as
 *                  "Commission Not Verified" (we do NOT assume no-pay).
 */
export type CommissionStatus =
  | { state: "paying"; text: string }
  | { state: "not_paying" }
  | { state: "unverified" };

// Classify a single commission field:
//   "zero"    = a VERIFIED zero ("0", "0%", "$0") — a real value we DISPLAY as "0%"
//   "value"   = a real non-zero commission ("125%", "$500")
//   "nopay"   = an explicit "does not pay locators" marker ("No", "Not Paying", …)
//   "unknown" = blank / Unknown / N/A / TBD / None — NOT verified, NOT no-pay
// A verified zero is DISTINCT from unknown (shown as "0%") and from an explicit
// not-paying marker (red status). Ambiguous words ("none", "n/a") stay UNKNOWN.
function classifyCommissionField(v?: string | null): "zero" | "value" | "nopay" | "unknown" {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (/^(unknown|n\/?a|tbd|none|null|-{1,2}|—|\?+)$/.test(s)) return "unknown";
  if (/^(no|not\s*paying|does\s*not\s*pay|non[-\s]?paying|no\s*commission|none\s*paying)$/.test(s)) return "nopay";
  if (/^\$?0(?:\.0+)?%?$/.test(s)) return "zero";
  return "value";
}

export function evaluateLocatorCommission(c?: LocatorCommission | null): CommissionStatus {
  if (!c) return { state: "unverified" };
  const send = classifyCommissionField(c.sendCommission);
  const escort = classifyCommissionField(c.escortCommission);
  const bonus = classifyCommissionField(c.bonusFlat);
  // Explicit "not paying locators" verification wins over everything.
  if (send === "nopay" || escort === "nopay" || bonus === "nopay") return { state: "not_paying" };
  const verified = (x: "zero" | "value" | "nopay" | "unknown") => x === "zero" || x === "value";
  // Any VERIFIED commission (a value OR an explicit 0%) → paying. Send + Escort are
  // ALWAYS shown when verified, with "0%" spelled out — never dropped merely for being
  // zero. Bonus appended only when it is a real non-zero amount.
  if (verified(send) || verified(escort) || verified(bonus)) {
    const parts: string[] = [];
    if (verified(send)) parts.push(`Send ${send === "zero" ? "0%" : (c.sendCommission ?? "").trim()}`);
    if (verified(escort)) parts.push(`Escort ${escort === "zero" ? "0%" : (c.escortCommission ?? "").trim()}`);
    if (bonus === "value") parts.push(`Bonus ${formatBonus((c.bonusFlat ?? "").trim())}`);
    return { state: "paying", text: parts.join(" · ") };
  }
  // No verified value and no explicit no-pay marker → unverified (Unknown ≠ No).
  return { state: "unverified" };
}
