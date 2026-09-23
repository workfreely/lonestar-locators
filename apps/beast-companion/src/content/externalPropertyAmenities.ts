// Pure the external property site amenity-value parser — NO DOM / chrome / window, so it is
// unit-testable in isolation. On a the external site property-detail page each amenity CATEGORY's
// values live in one span whose id carries the "_Amenities_" marker, verbatim:
//
//   <span id="ctl00_ContentPlaceHolder_Amenities_sports" class="textSmall">
//     &nbsp; &nbsp; Swimming Pool<br>&nbsp; &nbsp; Jogging Trail<br>&nbsp; &nbsp; Fitness Center<br>
//   </span>
//
// So one span = one category's values, <br>-separated, each indented with &nbsp;. The
// CATEGORY HEADINGS themselves ("High Value", "Fitness & Sports", "Kitchen", "Living")
// are NOT in these spans — they are separate `td.subtitleBlue2` cells — so parsing the
// value spans alone can never mistake a heading for an amenity.
//
// Business rule: capture the external site's amenity text essentially VERBATIM. We only split on
// <br>, decode the handful of HTML entities the external site emits, collapse the indent whitespace,
// and drop empties/exact duplicates. We never re-word, re-case, expand, translate, or
// infer an amenity, and we never split a single value on "/" ("Black/Stainless
// Appliances" and "Dog/Walk Trail" stay one value each).

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)));
}

/**
 * The amenity values inside ONE the external site category span, given its innerHTML. Splits on
 * <br>, strips any residual markup, decodes entities, normalizes the &nbsp; indent to
 * ordinary spaces, and drops empties + exact duplicates (order preserved). Anything
 * without recognizable values yields [].
 */
export function parseAmenityValues(innerHTML: string | null | undefined): string[] {
  const source = innerHTML ?? "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const chunk of source.split(/<br\s*\/?>/i)) {
    const value = decodeEntities(chunk.replace(/<[^>]*>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/** Merge several category spans' values into ONE section list, de-duplicating exact
 *  repeats across categories (the external site can list the same value under two headings). */
export function mergeAmenityValues(perSpan: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const values of perSpan) {
    for (const v of values) {
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/**
 * One node from the amenities container, in DOCUMENT ORDER: either a section heading
 * ("Property Amenities" / "Unit Features") or one category's value span. Keeping this
 * a plain data shape makes the section-splitting logic pure and testable without a DOM
 * — the bridge only walks the container and labels what it finds.
 */
export type AmenityNode = { kind: "section"; title: string } | { kind: "values"; html: string };

const SECTION_COMMUNITY = /^property amenities$/i;
const SECTION_UNIT = /^unit features$/i;

/**
 * Split the container's nodes into the external site's two sections by DOCUMENT ORDER: every value
 * span belongs to the most recent preceding section heading. This is the relationship
 * the live DOM actually has — the value spans are NOT confined to a single sibling
 * element of the heading, so any position-based binding (heading → nextElementSibling)
 * silently drops the later categories or misses them entirely.
 *
 * Values before the first heading, or under an unrecognized heading, are IGNORED rather
 * than guessed into a section. Each section de-duplicates exact repeats, order preserved.
 */
export function groupAmenitySections(nodes: AmenityNode[]): { community: string[]; unit: string[] } {
  const community: string[][] = [];
  const unit: string[][] = [];
  let current: string[][] | null = null; // null = before/outside a known section
  for (const node of nodes) {
    if (node.kind === "section") {
      const title = node.title.replace(/\s+/g, " ").trim();
      current = SECTION_COMMUNITY.test(title) ? community : SECTION_UNIT.test(title) ? unit : null;
      continue;
    }
    if (!current) continue; // no known section yet → never guess
    current.push(parseAmenityValues(node.html));
  }
  return { community: mergeAmenityValues(community), unit: mergeAmenityValues(unit) };
}
