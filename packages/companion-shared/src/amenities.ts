// Amenities V1 — the third property-intelligence dimension. Compact row contract:
//
//   Amenities: [amenity] · [amenity] · [amenity]      (≤3; 3 is a MAX, not a quota)
//
// There is deliberately NO verdict word here (no Good/Partial/Unverified): the useful
// information IS the matched amenity itself. The row lists ONLY the client's own
// requirements that SAD's own amenity text CONFIRMS, so every piece shown is a fact
// about this property that this client actually asked for. Nothing else is displayed —
// we never dump the property's full amenity list.
//
// Requirements are derived DETERMINISTICALLY from the resolved ClientContext (Smart
// Form criteria + Client Notes + Locator Notes + AI Insights, already assembled once
// per client) — no AI call, no per-property model, no second client-context system.
//
// CONSERVATIVE MATCHING — confirmed evidence is POSITIVE evidence; silence is UNKNOWN:
//   • Not found in SAD = unknown, NOT absent. A property is never penalized, flagged,
//     or annotated for an amenity SAD simply didn't mention — unconfirmed requirements
//     are omitted entirely (no "Yard unverified" filler).
//   • A broad feature never satisfies a specific one, so an amenity is shown only when
//     the evidence supports it at the REQUIRED specificity:
//       Large windows      ≠ Floor-to-Ceiling Windows
//       Garage available   ≠ Attached Garage
//       Yards available    ≠ Private/Fenced Yard      (and Courtyard ≠ Yard)
//       W/D Connections    ≠ Washer/Dryer included
//       Community townhome floor plans ≠ THIS unit is a townhome (`scope: "unit"`)
//       Pool Table ≠ Pool,  Dog/Walk Trail ≠ Dog Park
//   • Nothing is inferred from photos, property name, management, price, or geography.
//
// When no client-relevant amenity can be confirmed the row is omitted entirely (the
// evaluator returns []), rather than manufacturing a verdict or filler.

import type { ClientContext } from "./clientContext";

/**
 * Must-Have Amenities — the canonical client-facing option list. This ONE table is the
 * single source of truth for the Smart Form, the CRM edit surface, the stored value and
 * the Companion row, so a label change can never desync them.
 *
 *   value  — the STABLE stored key (never the label; labels are free to change)
 *   label  — full client-facing wording (Smart Form + CRM)
 *   short  — Companion presentation label, when a clear abbreviation exists
 */
export const MUST_HAVE_AMENITIES = [
  { value: "washer_dryer", label: "Washer/Dryer", short: "W/D" },
  { value: "detached_garage", label: "Detached Garage" },
  { value: "attached_garage", label: "Attached Garage" },
  { value: "private_yard", label: "Private Yard" },
  { value: "ev_charging", label: "EV Charging" },
  { value: "high_ceilings", label: "High Ceilings" },
  { value: "floor_to_ceiling_windows", label: "Floor-to-Ceiling Windows", short: "FTC Windows" },
  { value: "garden_tub", label: "Garden Tub" },
  { value: "walk_in_shower", label: "Walk-In Shower" },
  { value: "pool", label: "Pool" },
  { value: "fitness_center", label: "Fitness Center", short: "Gym" },
  { value: "gated_access", label: "Gated Access" },
  { value: "dog_park", label: "Dog Park" },
  { value: "golf_simulator", label: "Golf Simulator" },
] as const satisfies readonly { value: string; label: string; short?: string }[];

export type MustHaveAmenityValue = (typeof MUST_HAVE_AMENITIES)[number]["value"];

/** A client may select at most three must-haves. */
export const MAX_MUST_HAVE_AMENITIES = 3;

const BY_VALUE = new Map(MUST_HAVE_AMENITIES.map((a) => [a.value, a]));

export function isMustHaveAmenity(value: string): value is MustHaveAmenityValue {
  return BY_VALUE.has(value as MustHaveAmenityValue);
}
/** Full client-facing wording (Smart Form / CRM). */
export function mustHaveAmenityLabel(value: string): string {
  return BY_VALUE.get(value as MustHaveAmenityValue)?.label ?? value;
}
/** Companion row label — the short form when one exists, else the full label. */
export function mustHaveAmenityShortLabel(value: string): string {
  const a = BY_VALUE.get(value as MustHaveAmenityValue);
  return a ? (("short" in a && a.short) || a.label) : value;
}
/**
 * Keep only real, de-duplicated option values, in the CLIENT'S OWN SELECTION ORDER —
 * their first pick is their strongest preference, so the row leads with it.
 *
 * Entries are trimmed first: the stored form is comma-joined WITH spaces
 * ("pool, fitness_center"), so a raw `.split(",")` yields " fitness_center" and an
 * untrimmed check would silently drop every value after the first.
 */
export function normalizeMustHaveAmenities(values?: readonly string[] | null): MustHaveAmenityValue[] {
  const seen = new Set<string>();
  const out: MustHaveAmenityValue[] = [];
  for (const raw of values ?? []) {
    const value = (raw ?? "").trim();
    if (!isMustHaveAmenity(value) || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/** SAD's two amenity sections, kept separate (see `scope`). */
export type PropertyAmenities = {
  community?: string[] | null;
  unit?: string[] | null;
};

/** The compact row's whole budget: at most three pieces of intelligence. */
export const MAX_AMENITIES = 3;

type Requirement = {
  /** Canonical option value when this rule backs a structured must-have. */
  key: string;
  /** Exactly what the row displays when this requirement is CONFIRMED. */
  label: string;
  /** Does the CLIENT want this? Tested against their own free text. */
  want: RegExp;
  /** Does SAD explicitly state it, at this specificity? Tested per amenity value. */
  evidence: RegExp;
  /** Amenity values that must NEVER count as evidence (near-miss guards). */
  exclude?: RegExp;
  /** "unit" = only Unit Features confirms it; a community amenity is not this unit's. */
  scope?: "unit";
  /** When THIS requirement is wanted, these broader ones are redundant (one row piece,
   *  not two: a client who asked for an attached garage is not also shown "Garage"). */
  subsumes?: string[];
};

// Display order for the row when more than three are confirmed. Roughly "how much this
// changes the tour decision" — unit/structure first, then parking, outdoor space,
// laundry, then in-unit finishes, then community amenities.
const REQUIREMENTS: Requirement[] = [
  {
    key: "townhome",
    label: "Townhome",
    want: /town\s?home|town\s?house/i,
    evidence: /town\s?home|town\s?house/i,
    scope: "unit", // community floor-plan types never confirm THIS unit
  },
  {
    key: "attached_garage",
    label: "Attached Garage",
    want: /attached\s+garage/i,
    evidence: /attached\s+garage/i,
    subsumes: ["garage"],
  },
  {
    key: "detached_garage",
    label: "Detached Garage",
    want: /detached\s+garage/i,
    evidence: /detached\s+garage/i,
    subsumes: ["garage"],
  },
  {
    key: "garage",
    label: "Garage",
    want: /\bgarage\b/i,
    evidence: /\bgarage\b/i,
  },
  {
    key: "private_yard",
    label: "Private Yard",
    want: /(private|fenced|enclosed)[^.]{0,12}yard|yard[^.]{0,12}(fenced|enclosed|private)/i,
    evidence: /(private|fenced|enclosed)[^.]{0,12}yard|yard[^.]{0,12}(fenced|enclosed|private)/i,
    exclude: /courtyard/i,
    subsumes: ["yard"], // a fenced-yard requirement is not also reported as "Yard"
  },
  {
    key: "yard",
    label: "Yard",
    // \b already keeps "courtyard" out on both sides; `exclude` is belt-and-braces.
    want: /\byard\b/i,
    evidence: /\byard\b/i,
    exclude: /courtyard/i,
  },
  {
    key: "washer_dryer",
    label: "W/D",
    want: /washer|dryer|\bw\/d\b/i,
    evidence: /washer\s*\/?\s*(and\s*)?dryer|\bw\/d\b/i,
    exclude: /connection|hook.?up/i, // connections are NOT an included washer/dryer
  },
  {
    key: "wd_connections",
    label: "W/D Connections",
    want: /(washer|dryer|w\/?d)[^.]{0,25}(connection|hook.?up)|(connection|hook.?up)[^.]{0,25}(washer|dryer|w\/?d)/i,
    evidence: /(washer|dryer|w\/?d)[^.]{0,25}(connection|hook.?up)|(connection|hook.?up)[^.]{0,25}(washer|dryer|w\/?d)/i,
    subsumes: ["washer_dryer"], // asking for connections is not asking for included
  },
  {
    key: "first_floor",
    label: "First Floor",
    want: /\b(first|1st|ground)\s+floor\b|\bdownstairs\b/i,
    evidence: /\b(first|1st|ground)\s+floor\b/i,
  },
  {
    key: "floor_to_ceiling_windows",
    label: "Floor-to-Ceiling Windows",
    // "Large Windows" / "High Ceilings" never satisfy this — the phrase must be stated.
    want: /floor.{0,3}to.{0,3}ceiling/i,
    evidence: /floor.{0,3}to.{0,3}ceiling/i,
  },
  {
    key: "high_ceilings",
    label: "High Ceilings",
    want: /(high|tall|vaulted)\s+ceiling|\d+\s*(ft|foot|')\s*ceiling/i,
    evidence: /(high|tall|vaulted)\s+ceiling|\d+\s*(ft|foot|')\s*ceiling/i,
    exclude: /floor.{0,3}to.{0,3}ceiling/i, // a window feature, not ceiling height
  },
  {
    key: "walk_in_shower",
    label: "Walk-In Shower",
    want: /walk.?in\s+shower/i,
    evidence: /walk.?in\s+shower/i,
  },
  {
    key: "golf_simulator",
    label: "Golf Simulator",
    want: /golf\s+simulator/i,
    evidence: /golf\s+simulator/i,
  },
  {
    key: "garden_tub",
    label: "Garden Tub",
    want: /garden\s+tub|soaking\s+tub/i,
    evidence: /garden\s+tub|soaking\s+tub/i,
  },
  {
    key: "ev_charging",
    label: "EV Charging",
    want: /\bev\b[^.]{0,15}charg|electric\s+(car|vehicle)[^.]{0,15}charg|charging station/i,
    evidence: /electric\s+(car|vehicle)\s+charging|\bev\s+charging|charging station/i,
  },
  {
    key: "gated_access",
    label: "Gated Access",
    want: /\bgated\b|gate[^.]{0,10}access|controlled access/i,
    // SAD writes "Access Gates" (plural) — confirmed live wording, same specificity.
    evidence: /\bgated\b|controlled access|\bgates?\b/i,
  },
  {
    key: "fitness_center",
    label: "Gym",
    want: /\bgym\b|fitness|work\s?out\s+room/i,
    evidence: /fitness|\bgym\b|health club|work\s?out/i,
  },
  {
    key: "pool",
    label: "Pool",
    want: /\bpool\b/i,
    evidence: /\bpool\b/i,
    exclude: /pool\s*table/i, // a game-room item, not a swimming pool
  },
  {
    key: "dog_park",
    label: "Dog Park",
    // Strictly "dog park" — SAD's "Dog/Walk Trail" is a trail, not a dog park.
    want: /dog\s*park|bark\s*park/i,
    evidence: /dog\s*park|bark\s*park/i,
  },
];

/**
 * The client's own words — the SAME resolved context every other evaluator uses. The
 * Smart Form's free-text `interest` is included alongside the notes/insights layers
 * because amenity requirements are stated there too ("looking for a townhome w/ yard");
 * `city`/`desiredAreas` are location inputs and are deliberately not scanned here.
 */
function clientText(ctx: ClientContext): string {
  return [ctx.interest, ctx.clientNotes, ctx.overrideText].filter(Boolean).join(". ");
}

function isConfirmed(req: Requirement, amenities: PropertyAmenities): boolean {
  const community = amenities.community ?? [];
  const unit = amenities.unit ?? [];
  const pool = req.scope === "unit" ? unit : [...community, ...unit];
  return pool.some((value) => {
    const v = value ?? "";
    if (req.exclude && req.exclude.test(v)) return false;
    return req.evidence.test(v);
  });
}

/**
 * Amenities V1 → the ≤3 labels the row displays, in canonical order.
 *
 * PRIMARY SOURCE is the client's STRUCTURED Must-Have Amenities (ClientContext
 * .mustHaveAmenities, set on the Smart Form or in the CRM). When a client has none —
 * hidden form field, manually-created lead, or they skipped the optional question — we
 * fall back to the free-text requirement matching so nothing regresses.
 *
 * Either way only requirements SAD positively CONFIRMS are returned: the row never
 * shows an unconfirmed must-have, and never shows an amenity the client didn't ask for
 * just because the property has it. Missing SAD evidence is unknown, not absent, so an
 * empty array means "nothing to say" and the caller hides the row.
 */
export function evaluateAmenities(ctx: ClientContext, amenities?: PropertyAmenities | null): string[] {
  const evidence = amenities ?? {};

  // ── Structured must-haves (primary) ────────────────────────────────────────
  const mustHaves = normalizeMustHaveAmenities(ctx.mustHaveAmenities);
  if (mustHaves.length > 0) {
    return mustHaves
      .filter((value) => {
        const req = REQUIREMENTS.find((r) => r.key === value);
        return req ? isConfirmed(req, evidence) : false; // no rule → cannot confirm
      })
      .slice(0, MAX_AMENITIES)
      .map(mustHaveAmenityShortLabel);
  }

  // ── Free-text fallback (client stated requirements only in their notes) ─────
  const text = clientText(ctx);
  if (!text) return [];
  const wanted = REQUIREMENTS.filter((r) => r.want.test(text));
  // A specific want makes its broader parent redundant ("attached garage" → not "Garage").
  const redundant = new Set(wanted.flatMap((r) => r.subsumes ?? []));
  const relevant = wanted.filter((r) => !redundant.has(r.key));
  if (relevant.length === 0) return [];
  return relevant
    .filter((r) => isConfirmed(r, evidence))
    .slice(0, MAX_AMENITIES)
    .map((r) => r.label);
}
