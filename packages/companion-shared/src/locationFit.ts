// Location Fit V1 — the first property-intelligence dimension (no %, no budget,
// no beds, no Maps/coordinates, no AI call). A small CONSERVATIVE, DETERMINISTIC,
// MARKET-AGNOSTIC evaluator: it compares the resolved Current Client Context
// (see resolveClientContext) against the SAD property's submarket / name / address
// and returns one of three fits plus terse pieces for the compact row:
//
//   Location: [Fit] · [Area] · [Proximity]
//     • Good        — a client location term matches the property's area.
//     • Bad         — the property location clearly conflicts (reliable CITY mismatch).
//     • Unverified  — not enough verified info (incl. proximity we can't check w/o Maps).
//
// Order matters: a reliable structured CITY mismatch is decided FIRST, before any
// ambiguous notes/AI context — an obvious Austin→San Antonio mismatch is Bad, not
// Unverified, unless the override text clearly references the property's city (a
// signal the requirement changed). Only when the cities match (or can't be read) do
// we evaluate desired areas against the submarket/address. NO landmark or city
// geography is hard-coded: proximity language is detected generically and left
// explicitly unverified — the [Proximity] slot stays empty until Maps can verify it.

import type { ClientContext } from "./clientContext";

export type LocationFitVerdict = "good" | "bad" | "unknown";
/** Display word for the compact row's fit position. "unknown" → "Unverified". */
export type LocationFit = "Good" | "Bad" | "Unverified";
export type LocationFitResult = {
  verdict: LocationFitVerdict;
  /** Colored fit word shown after "Location:". */
  fit: LocationFit;
  /** The single terse piece after the fit word (area / "Wrong city" / "Near X" / …),
   *  or null when the fit word stands alone. Never a full sentence. */
  detail: string | null;
};

export type PropertyLocation = {
  propertyName?: string | null;
  propertySubmarket?: string | null;
  propertyAddress?: string | null;
};

// Generic, MARKET-AGNOSTIC proximity/commute LANGUAGE. We keep NO landmark/city
// knowledge — such language only tells us the client has a distance-based need we
// CANNOT verify without map data, so it yields Unverified (never Good/Bad), preserving
// the client's own words. PROXIMITY_OBJECT captures the phrase AFTER a proximity
// preposition (e.g. "near Lackland"); PROXIMITY_ANY is the broader keyword net.
const PROXIMITY_OBJECT =
  /\b(near(?:by)?|close to|next to|right by|by the|walking distance (?:to|of|from)|within [^,.;]*?minutes?(?: of| from| to)?|\d+\s*min(?:ute)?s?(?: from| to| away)?|drive to|commute to)\s+([A-Za-z0-9][A-Za-z0-9 .'&/-]{1,40}?)(?=[,.;—]|\bfor\b|\band\b|\bbut\b|\bwith\b|\bin the\b|\bso\b|\bbecause\b|\bwho\b|$)/i;
const PROXIMITY_ANY =
  /\b(commute|near(?:by)?|close to|within[^.]*?minutes?|\d+\s*min|drive to|work(?:s|place|ing)?|job|airport|highway|freeway|interstate|intersection|cross streets?)\b/i;

const GENERIC_NAME_WORDS = new Set([
  "the", "at", "of", "apartments", "apartment", "apts", "lofts", "loft", "residences",
  "residence", "flats", "villas", "homes", "home", "place", "park", "tower", "towers",
  "luxury", "living", "on", "and",
]);
const STOP_AREA = new Set(["", "area", "side", "of", "town", "the", "and", "or", "near", "sa"]);

function norm(s?: string | null): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
function tokens(s: string): string[] {
  return norm(s).split(" ").filter(Boolean);
}
function bigrams(ts: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < ts.length - 1; i++) out.push(`${ts[i]} ${ts[i + 1]}`);
  return out;
}
/** City from an address like "…, City, ST 78215" OR a leading "City, ST 78215". */
function cityFromAddress(addr?: string | null): string | null {
  const m = (addr ?? "").match(/(?:^|,)\s*([A-Za-z][A-Za-z .'-]+?),\s*[A-Z]{2}\b/);
  return m ? m[1].trim() : null;
}
/** Multiword area phrases the client typed (desiredAreas/interest), city excluded. */
function clientAreaPhrases(ctx: ClientContext): string[] {
  const raw = [ctx.desiredAreas, ctx.interest].filter(Boolean).join(" , ");
  const city = norm(ctx.city);
  return raw
    .split(/[,/;|]| and | or /i)
    .map((p) => norm(p))
    .filter((p) => p.length >= 4 && !STOP_AREA.has(p) && p !== city);
}
/** Distinctive property area phrases to search inside the client's override text:
 *  the submarket, plus name bigrams (drops generic apartment words). */
function propertyAreaPhrases(property: PropertyLocation): string[] {
  const phrases = new Set<string>();
  const sub = norm(property.propertySubmarket);
  if (sub.length >= 4 && !STOP_AREA.has(sub)) phrases.add(sub);
  const nameToks = tokens(property.propertyName ?? "").filter((t) => !GENERIC_NAME_WORDS.has(t));
  for (const bg of bigrams(nameToks)) phrases.add(bg);
  return [...phrases].filter((p) => p.length >= 5);
}
/** Detect a stated proximity/commute need in the override text — WITHOUT geography.
 *  Returns whether present and, when a clean object follows a proximity preposition,
 *  the client's own phrase (e.g. "near Lackland"). Never resolves where that is. */
function extractProximity(rawText: string): { hit: boolean; clause: string | null } {
  const t = (rawText ?? "").replace(/\s+/g, " ").trim();
  if (!t) return { hit: false, clause: null };
  const m = t.match(PROXIMITY_OBJECT);
  if (m) {
    const cue = m[1].toLowerCase().replace(/\s+/g, " ").trim();
    const obj = m[2].replace(/\s+/g, " ").trim();
    return { hit: true, clause: `${cue} ${obj}`.trim() };
  }
  if (PROXIMITY_ANY.test(t)) return { hit: true, clause: null };
  return { hit: false, clause: null };
}

const FIT_WORD: Record<LocationFitVerdict, LocationFit> = { good: "Good", bad: "Bad", unknown: "Unverified" };

export function evaluateLocationFit(ctx: ClientContext, property: PropertyLocation): LocationFitResult {
  const make = (verdict: LocationFitVerdict, detail: string | null): LocationFitResult => ({
    verdict,
    fit: FIT_WORD[verdict],
    detail,
  });

  const newerText = norm(ctx.overrideText);
  const propBlob = norm([property.propertySubmarket, property.propertyName, property.propertyAddress].filter(Boolean).join(" "));

  const hasClientLocation = !!(ctx.city || ctx.desiredAreas || ctx.interest || ctx.locatorNotes || ctx.aiInsights.length);
  if (!hasClientLocation) return make("unknown", "No location set");

  const clientCity = norm(ctx.city);
  const propCityNorm = norm(cityFromAddress(property.propertyAddress));

  // 1) Reliable structured CITY mismatch → Bad, decided FIRST. Override text does NOT
  //    soften an obvious mismatch UNLESS it clearly references the property's city.
  if (clientCity && propCityNorm && clientCity !== propCityNorm) {
    const cityChanged = newerText.includes(propCityNorm);
    if (!cityChanged) return make("bad", "Wrong city");
  }

  // 2) Area match — the client's stated area, OR an area named in the override text,
  //    appearing in the property's submarket/name/address → Good (show the area).
  const areaPhrases = clientAreaPhrases(ctx);
  const propPhrases = propertyAreaPhrases(property);
  const areaHit = areaPhrases.find((c) => propBlob.includes(c)) ?? propPhrases.find((p) => newerText.includes(p)) ?? null;
  if (areaHit) return make("good", titleCase(areaHit));

  // 3) A stated proximity/commute need we cannot verify without map data → Unverified,
  //    preserving the client's own short phrase in the detail ("Near Lackland").
  const prox = extractProximity(ctx.overrideText);
  if (prox.hit) return make("unknown", prox.clause ? capFirst(prox.clause) : null);

  // 4) Cities match but the specific area wasn't confirmed. A stated-but-unconfirmed
  //    desired area → Unverified · Area not confirmed; if the city is the only stated
  //    requirement and it matches → Good on the city.
  if (clientCity && propCityNorm && clientCity === propCityNorm) {
    if (areaPhrases.length > 0) return make("unknown", "Area not confirmed");
    return make("good", titleCase(clientCity));
  }

  // 5) Not enough verified info to decide.
  return make("unknown", null);
}

function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
function capFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
