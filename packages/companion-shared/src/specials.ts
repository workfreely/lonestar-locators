// Specials V1 — the fourth property-intelligence dimension. Compact row contract:
//
//   Specials: [special] · Base Rent: [$] · Avg Rent: [$]     (≤3; 3 is a MAX)
//
// This module is the INTERPRETATION half only: it normalizes an already-extracted
// concession string and rent figures into the row's exact display forms. It performs
// NO extraction and touches no DOM — the the external site reader feeds it (see the note in
// currentPropertyBridge about the still-missing specials/rent selectors).
//
// Display rules (verbatim from the approved contract):
//   • Natural wording, correctly singular/plural: "2 months free", "1 month free",
//     "8 weeks free"; qualifiers are PRESERVED ("Up to 8 weeks free")
//   • Base Rent: $1,725 — commas, no "/mo", no decimals
//   • No special → "None" (the external site renders "---" on the list and a "No ongoing
//     concessions…" placeholder on the detail page; both mean the same thing)
//
// AVG RENT IS NEVER MANUFACTURED. It is the effective rent after a concession, so it
// is computed ONLY when the concession can be tied to a specific rent and lease term
// with certainty. A QUALIFIED concession ("Up to 8 weeks free", "on select units",
// "call for details") states a ceiling or a condition, NOT a guaranteed term — those
// yield null and the row simply shows the special and Base Rent.

/** A concession as extracted from the external site, plus what we know about how it applies. */
export type SpecialInput = {
  /** the external site's specials block, one verbatim line per concession (the confirmed
   *  `#ctl00_ContentPlaceHolder_SpecialsBit1_specials` element). Preferred when present:
   *  the block mixes rent concessions with gift cards, fee waivers and disclaimers, so
   *  the RENT concession is selected from it (see selectRentConcession). */
  lines?: string[] | null;
  /** A single already-isolated concession string. Null/empty/placeholder → "None". */
  text?: string | null;
  /** Monthly base/quoted rent, when reliably extracted. */
  baseRent?: number | null;
  /** Lease term in months that the concession applies to, when reliably known. */
  leaseTermMonths?: number | null;
};

export type SpecialsResult = {
  /** Normalized rent concession, or "None". Always present. */
  special: string;
  /** True when the specials block existed but stated no RENT concession (it may still
   *  offer gift cards / fee waivers). The caller hides the row rather than claiming
   *  "None", which would misreport a property that does have non-rent concessions. */
  hasRentConcession: boolean;
  /** Lease term the winning concession explicitly names, preserved for LATER rent math
   *  (e.g. "on a 12 mo lease" → 12). Never used to manufacture Avg Rent on its own —
   *  that still requires an exact base rent bound to this term. */
  qualifyingTermMonths: number | null;
  /** Formatted base rent ("$1,725"), or null when unknown. */
  baseRent: string | null;
  /** Formatted effective rent ("$1,495"), or null whenever it cannot be trusted. */
  avgRent: string | null;
};

const NO_SPECIAL = /^\s*(-{2,}|—|n\/?a|none|no\s+(ongoing\s+)?(concession|special)s?\b.*)\s*$/i;
/** Language that makes a concession a CEILING or a CONDITION, not a guarantee. */
const QUALIFIED =
  /\b(up\s+to|as\s+much\s+as|select\s+(units|homes|floor\s?plans)|certain\s+units|call\s+for|inquire|varies|depend|restrictions|o\.?a\.?c\.?|on\s+approved)\b/i;

// the external site's specials block mixes several offer TYPES on separate lines, e.g.
//   Gift Card: $500 Gift Card ends 11/13/2026
//   App Fee Waived
//   100% off rent for 2 month(s) on a 12 mo lease
//   Other Concessions: Up to 8 Weeks Free Base Rent
//   BONUS: Credited App Back & a $500 Gift Card
//   *Minimum Term Required. Terms Apply.
// Only RENT concessions belong in the row — a gift card or a waived app fee is not a
// rent reduction and must never be shown as one.

/** Lines that are NOT a rent concession (gift cards, fee waivers, bonuses, footnotes). */
const NON_RENT_LINE =
  /^\s*\*|gift\s*card|app(lication)?\s*fee|admin(istration|istrative)?\s*fee|deposit|\bbonus\b|referral|terms?\s+apply|minimum\s+term\s+required/i;
/** A leading the external site label ("Other Concessions:") that is not part of the offer itself. */
const LINE_LABEL = /^\s*(other\s+concessions?|concessions?|specials?|current\s+specials?)\s*:\s*/i;

export type RentConcession = {
  /** Compact display form ("2 months free", "Up to 8 weeks free", "$1K off"). */
  display: string;
  /** The line it came from, verbatim (never shown; kept for traceability). */
  source: string;
  /** True when the offer states a ceiling/condition ("Up to", "select units"). */
  qualified: boolean;
  /** Free period in the unit the external site used — never converted between weeks and months. */
  free: { amount: number; unit: "weeks" | "months" } | null;
  /** Lease term the line explicitly names ("on a 12 mo lease" → 12), else null. */
  termMonths: number | null;
};

/** Free period stated by a line, in the external site's own unit. Handles both "N weeks/months free"
 *  and "100% off rent for N month(s)" (identical meaning, not an inference). */
function freePeriod(line: string): { amount: number; unit: "weeks" | "months"; at: number } | null {
  const pct = line.match(/100\s*%\s*off\s*rent\s*for\s*(\d+(?:\.\d+)?)\s*(month|week)/i);
  if (pct) return { amount: Number(pct[1]), unit: pct[2].toLowerCase().startsWith("month") ? "months" : "weeks", at: pct.index ?? 0 };
  const weeks = line.match(/\b(\d+(?:\.\d+)?)\s*(?:weeks?|wks?)\b[^.]{0,20}?\bfree\b/i);
  if (weeks) return { amount: Number(weeks[1]), unit: "weeks", at: weeks.index ?? 0 };
  const months = line.match(/\b(\d+(?:\.\d+)?)\s*(?:months?|mos?)\b[^.]{0,20}?\bfree\b/i);
  if (months) return { amount: Number(months[1]), unit: "months", at: months.index ?? 0 };
  return null;
}

/**
 * Is the concession at `at` a CEILING ("up to 6 weeks free") rather than a guarantee?
 *
 * Scoped to the text immediately BEFORE the matched clause, not the whole string, and that
 * scoping is the point. Master concession text routinely states a guaranteed offer and then a
 * separate qualified one:
 *
 *   "100% off rent for 2 month(s) on a 12 mo lease  Other Concessions: Receive up to 2 Months Free"
 *    └─ the clause the badge quotes — guaranteed      └─ a DIFFERENT offer, which is a ceiling
 *
 * Testing the whole string would label that guaranteed 2 months as "Up to", which is the mirror
 * image of the bug this fixes: it would understate a real concession instead of overstating one.
 *
 * Only CEILING wording counts here. "On select units" is a condition, not a ceiling — it narrows
 * WHO gets the offer, not HOW MUCH — and a four-word badge cannot carry it honestly, so it is
 * left to the detailed Specials row.
 */
const CEILING = /\b(up\s+to|as\s+much\s+as)\b/i;
function isCeilingAt(line: string, at: number): boolean {
  // 24 characters is enough for "Other Concessions: Receive up to " to reach the clause it
  // qualifies, without letting an unrelated ceiling elsewhere in the text bleed in.
  return CEILING.test(line.slice(Math.max(0, at - 24), at));
}

/** A free period in natural wording, correctly singular/plural: "2 months free",
 *  "1 month free", "8 weeks free", "1 week free". Never abbreviated. */
function freeLabel(free: { amount: number; unit: "weeks" | "months" }): string {
  const noun = free.unit === "weeks" ? "week" : "month";
  return `${free.amount} ${noun}${free.amount === 1 ? "" : "s"} free`;
}

/** Lease term a line explicitly names ("on a 12 mo lease"), else null. */
function statedTermMonths(line: string): number | null {
  const m = line.match(/\b(\d{1,2})\s*(?:mo|mos|month|months)\b[^.]{0,12}?\blease\b/i);
  return m ? Number(m[1]) : null;
}

/**
 * The single best RENT concession in the external site's specials block, or null when the block
 * states none. Ranking is by RELIABILITY first — an unqualified offer beats an "Up to"
 * ceiling — then by size. Qualifiers are always preserved in the display text.
 */
export function selectRentConcession(lines?: string[] | null): RentConcession | null {
  const candidates: RentConcession[] = [];
  for (const raw of lines ?? []) {
    const line = (raw ?? "").replace(/\s+/g, " ").trim();
    if (!line || NON_RENT_LINE.test(line) || NO_SPECIAL.test(line)) continue;
    const offer = line.replace(LINE_LABEL, "").trim();
    const free = freePeriod(offer);
    const dollarsOff = /\$\s*[\d,]+\s*off/i.test(offer);
    if (!free && !dollarsOff && !/free\s+rent/i.test(offer)) continue; // not a rent concession
    const qualified = isQualifiedSpecial(offer);
    // Canonical compact form when we parsed a free period — same unit the external site used, with
    // the qualifier kept. Otherwise the normalized line stands as written.
    const display = free ? `${qualified ? "Up to " : ""}${freeLabel(free)}` : formatSpecialText(offer);
    candidates.push({ display, source: line, qualified, free, termMonths: statedTermMonths(offer) });
  }
  if (candidates.length === 0) return null;
  // Unqualified beats qualified; then the larger free period (weeks compared in months
  // ONLY for ranking — never for display).
  const inMonths = (c: RentConcession) =>
    c.free ? (c.free.unit === "weeks" ? c.free.amount / (52 / 12) : c.free.amount) : 0;
  return candidates.sort((a, b) => Number(a.qualified) - Number(b.qualified) || inMonths(b) - inMonths(a))[0];
}

/** "$1,725" — commas, no decimals, no "/mo". Null for anything not a finite number. */
export function formatRent(amount?: number | null): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

/**
 * Normalize the external site's concession text for the row: "$1000 off" → "$1K off", whitespace
 * collapsed. Wording stays NATURAL ("8 weeks free", never "8 WKS free") and qualifiers
 * and every other word are PRESERVED — we never rewrite the offer or drop a condition.
 */
export function formatSpecialText(text?: string | null): string {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw || NO_SPECIAL.test(raw)) return "None";
  return raw
    .replace(/\$\s*(\d{1,3}),?000\b/g, (_m, n) => `$${n}K`)
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the concession states a guaranteed amount we could apply to a term. */
export function isQualifiedSpecial(text?: string | null): boolean {
  return QUALIFIED.test((text ?? "").trim());
}

/** Thousands separators for a whole-dollar integer: 1000 → "1,000". */
function withCommas(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/**
 * PROPERTY-CARD BADGE form: the shortest truthful label for a verified special,
 * in Title Case, for the compact green overlay on Map / Companion / /r cards —
 * NEVER the long raw master concession text. Extraction order (first match wins):
 *   1. free period ("100% off rent for 2 month(s)…" or "8 weeks free") → "2 Months Free" / "8 Weeks Free"
 *   2. dollars off ("$1,000 off") → "$1,000 Off"
 *   3. gift card ("$200 Gift Card") → "$200 Gift Card"
 *   4. rent credit ("$1,500 credit") → "$1,500 Credit"
 * Returns null for empty / "None" / "Unknown" / unrecognized text — the caller
 * then HIDES the badge rather than showing stale or long raw language. The badge
 * states the offer AS ADVERTISED, qualifier included: "Up to 6 Weeks Free" stays
 * "Up to 6 Weeks Free". The ceiling is preserved only when it qualifies the clause
 * the badge is quoting — a "100% off rent for N month(s)" guarantee followed by a
 * separate "up to" offer is still shown as the guarantee it is. Conditions that
 * narrow WHO qualifies ("on select units") remain the detailed Specials row's job.
 */
export function normalizeShortSpecial(raw?: string | null): string | null {
  const s = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!s || NO_SPECIAL.test(s) || /^\s*unknown\s*$/i.test(s)) return null;
  const free = freePeriod(s);
  if (free) {
    const noun = free.unit === "weeks" ? "Week" : "Month";
    // THE QUALIFIER IS PART OF THE OFFER. Dropping "Up to" turned a ceiling the property
    // advertised into a guarantee it never made — a renter reading "6 Weeks Free" had been told
    // something the property did not say. It is preserved only when it qualifies THIS clause.
    const prefix = isCeilingAt(s, free.at) ? "Up to " : "";
    return `${prefix}${free.amount} ${noun}${free.amount === 1 ? "" : "s"} Free`;
  }
  const off = s.match(/\$\s*([\d,]+(?:\.\d+)?)\s*off\b/i);
  if (off) return `${isCeilingAt(s, off.index ?? 0) ? "Up to " : ""}$${withCommas(Number(off[1].replace(/,/g, "")))} Off`;
  const gift = s.match(/\$\s*([\d,]+)\s*gift\s*card/i);
  if (gift) return `${isCeilingAt(s, gift.index ?? 0) ? "Up to " : ""}$${withCommas(Number(gift[1].replace(/,/g, "")))} Gift Card`;
  const credit = s.match(/\$\s*([\d,]+)\s*credit/i);
  if (credit) return `${isCeilingAt(s, credit.index ?? 0) ? "Up to " : ""}$${withCommas(Number(credit[1].replace(/,/g, "")))} Credit`;
  return null;
}

/**
 * Specials expire — a verified special is shown only while its source record is
 * still fresh. `verifiedAt` is the canonical `property_catalog.verified_at`.
 * Null/absent/unparseable or older than `maxAgeDays` (default 45) → not current,
 * so the caller hides the badge (the "stale / unverified" gate). Kept
 * intentionally strict: a missing timestamp is treated as unverified.
 */
export function isSpecialCurrent(verifiedAt?: string | Date | null, maxAgeDays = 45): boolean {
  if (!verifiedAt) return false;
  const t = verifiedAt instanceof Date ? verifiedAt.getTime() : Date.parse(verifiedAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= maxAgeDays * 86_400_000;
}

/** Free MONTHS a concession guarantees, or null when it guarantees nothing specific. */
function guaranteedFreeMonths(text: string): number | null {
  if (isQualifiedSpecial(text)) return null; // a ceiling/condition, not a guarantee
  const weeks = text.match(/\b(\d+(?:\.\d+)?)\s*(?:weeks?|wks?)\s+free\b/i);
  if (weeks) return Number(weeks[1]) / (52 / 12); // 52 weeks ÷ 12 months
  const months = text.match(/\b(\d+(?:\.\d+)?)\s*(?:months?|mos?)\s+free\b/i);
  if (months) return Number(months[1]);
  return null;
}

/**
 * Effective monthly rent after the concession, or null. Requires ALL of: a base rent,
 * a lease term, and a concession that guarantees a specific free period. Anything
 * missing, qualified ("Up to 8 weeks free"), or out of range → null, and the caller
 * simply omits Avg Rent rather than showing a number we cannot stand behind.
 */
export function computeAvgRent(input: SpecialInput): number | null {
  const { baseRent, leaseTermMonths } = input;
  if (baseRent == null || !Number.isFinite(baseRent) || baseRent <= 0) return null;
  if (leaseTermMonths == null || !Number.isFinite(leaseTermMonths) || leaseTermMonths <= 0) return null;
  const free = guaranteedFreeMonths((input.text ?? "").trim());
  if (free == null || free <= 0 || free >= leaseTermMonths) return null;
  return (baseRent * (leaseTermMonths - free)) / leaseTermMonths;
}

/**
 * The ≤3 pieces of the Specials row, already formatted. When `lines` (the external site's specials
 * block) is supplied it is the source of truth and the best RENT concession is chosen
 * from it; otherwise a directly-supplied `text` is normalized.
 *
 * Base Rent and Avg Rent are null unless real figures are supplied — neither is ever
 * manufactured. A concession's stated lease term is preserved on
 * `qualifyingTermMonths` for later use, but on its own it never produces an Avg Rent.
 */
export function evaluateSpecials(input?: SpecialInput | null): SpecialsResult {
  const src = input ?? {};
  const fromLines = src.lines != null ? selectRentConcession(src.lines) : null;
  const hasLines = (src.lines ?? []).some((l) => (l ?? "").trim().length > 0);

  const special = fromLines ? fromLines.display : formatSpecialText(src.text);
  const hasRentConcession = fromLines != null || (!hasLines && special !== "None");
  const qualifyingTermMonths = fromLines?.termMonths ?? src.leaseTermMonths ?? null;

  return {
    special,
    hasRentConcession,
    qualifyingTermMonths,
    baseRent: formatRent(src.baseRent),
    // Avg Rent still requires an exact base rent bound to the qualifying term; a term
    // alone is not enough, so this stays null until real rent data is extracted.
    avgRent: formatRent(computeAvgRent({ ...src, text: fromLines?.source ?? src.text })),
  };
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * PROMOTIONAL BADGES — the one place that decides what a card shows.
 *
 * Four surfaces render these pills (Map, Recommended, Favorites, and the client-facing
 * recommendation page). Each keeps its own classes, sizing and placement; none of them decides
 * WHAT to show. That lives here, so gating and de-duplication cannot drift between the page a
 * client sees and the one a locator does — which is exactly how the client page ended up with
 * no freshness gate at all while the three internal surfaces had one.
 *
 * ── NOTHING EXPIRES ON A TIMER ──────────────────────────────────────────────────────────────
 * The last known offer is shown until an agent CHANGES it. There is no age cutoff here, for
 * either incentive.
 *
 * A 45-day rule used to hide specials on the locator cards. It solved the wrong problem: a
 * promotion does not stop existing because nobody re-checked it, and silently blanking one made
 * a verified concession look like a property that had none — an absence presented as a finding,
 * which is the one thing this model exists to prevent. The age is now SURFACED instead, as a
 * line in the Map Property Editor ("Updated 2 months ago"), so a locator can see what might want
 * a phone call and decide. Removal is a deliberate act: No Special, a cleared field, or a gift
 * card set to No.
 *
 * The dates are therefore not inputs here at all. Keeping them as unused parameters would invite
 * exactly the gate this comment is removing, so they are gone from the signature; the editor
 * reads them from its own endpoint, where they are displayed rather than enforced.
 *
 * THE AGENT BONUS IS NOT AN INPUT HERE. bonus_flat is locator compensation; it is not a resident
 * incentive and must never reach a card as one. It is absent from the signature on purpose —
 * there is no field for a caller to pass it through by mistake.
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export type PromoBadgeKind = "special" | "gift_card";
export type PromoBadge = { kind: PromoBadgeKind; text: string };

/** Does a normalized badge string describe a gift card? normalizeShortSpecial already extracts
 *  "$500 Gift Card" from free text, which is why de-duplication is needed at all. */
function isGiftCardText(text: string): boolean {
  return /gift\s*card/i.test(text);
}

/**
 * A badge label is already short by construction — normalizeShortSpecial returns a canonical
 * form or null, never raw text. This is the last guard for an unusually long canonical form (a
 * large amount, say): truncate on a word boundary with an ellipsis.
 *
 * It can only ever SHORTEN. Nothing here rewrites, strengthens or qualifies a claim — a
 * truncated "Up to 12 Weeks Free" never becomes "12 Weeks Free", because the prefix is kept and
 * the tail is what is dropped.
 */
export function truncateBadgeLabel(text: string, maxChars = 22): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars - 1);
  const atSpace = cut.lastIndexOf(" ");
  return `${(atSpace > maxChars * 0.5 ? cut.slice(0, atSpace) : cut).trimEnd()}…`;
}

export type PromoBadgeInput = {
  /** property_catalog.current_special — verbatim master text. Shown until an agent changes it. */
  currentSpecial?: string | null;
  /** property_catalog.gift_card_status — null/'yes'/'no'. Only 'yes' can produce a badge. */
  giftCardStatus?: string | null;
  giftCardAmount?: number | string | null;
};

/**
 * The ordered badges a card should render: the move-in special first, the gift card second.
 *
 * Returns [] when there is nothing confirmed and current to show. Unknown is not an offer and
 * neither is a confirmed absence, so both render nothing at all.
 */
export function resolvePromoBadges(input: PromoBadgeInput): PromoBadge[] {
  // ── The move-in special ──────────────────────────────────────────────────────────────────
  // normalizeShortSpecial is the ONLY filter: it returns null for "None" / "N/A" / "--" and for
  // text it cannot read, which is how a cleared or explicitly-absent special stops rendering.
  // Age is not consulted.
  const specialText = normalizeShortSpecial(input.currentSpecial);

  // ── The structured gift card ─────────────────────────────────────────────────────────────
  // Its own state machine. A positive amount is required: the schema enforces "yes ⇒ amount > 0",
  // and a badge reading "$0 Gift Card" would be worse than none.
  const amount =
    typeof input.giftCardAmount === "number"
      ? input.giftCardAmount
      : Number(String(input.giftCardAmount ?? "").replace(/[$,\s]/g, ""));
  const giftConfirmed =
    String(input.giftCardStatus ?? "").toLowerCase() === "yes" && Number.isFinite(amount) && amount > 0;
  // No freshness gate — see the note above. The age is surfaced in the editor, not enforced here.
  const structuredGift = giftConfirmed ? `$${withCommas(amount)} Gift Card` : null;

  const badges: PromoBadge[] = [];

  // ── DE-DUPLICATION ───────────────────────────────────────────────────────────────────────
  // The special TEXT may itself describe a gift card, because normalizeShortSpecial extracts
  // one. Three cases, and only the first is a duplicate:
  //
  //   text is a gift card AND a structured one exists → drop the text one; the column is the
  //                                                     better record and carries its own date
  //   text is a gift card and there is no structured  → render it, as a GIFT CARD badge
  //   text is a concession                            → render it as the special
  //
  // A concession and a gift card are never duplicates of each other, so both show.
  if (specialText) {
    if (isGiftCardText(specialText)) {
      if (!structuredGift) badges.push({ kind: "gift_card", text: specialText });
    } else {
      badges.push({ kind: "special", text: specialText });
    }
  }
  if (structuredGift) badges.push({ kind: "gift_card", text: structuredGift });

  // Special first, gift card second — the order is part of the approved design, and asserting
  // it here means no surface has to remember it.
  return badges.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "special" ? -1 : 1));
}
