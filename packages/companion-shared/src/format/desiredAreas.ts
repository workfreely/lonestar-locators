// DESIRED AREAS — the compact display, and the rules that keep it unambiguous.
//
// The panel already shows the client's city on its own line, so "Downtown San Antonio, Alamo
// Heights" says "San Antonio" twice in a card built to be read at a glance. This trims the
// redundant half and nothing else.
//
// DISPLAY ONLY. The database keeps the canonical neighborhood names, matching and every location
// filter read those, and this function is never an input to any of them. It is called at the two
// render sites and nowhere else.

/**
 * Drop a redundant city suffix from each saved area label.
 *
 *   compactDesiredAreas("Downtown San Antonio, Alamo Heights", "San Antonio")
 *     → "Downtown, Alamo Heights"
 *
 * ── WHEN IT REFUSES ─────────────────────────────────────────────────────────────────────────
 * Every refusal exists because the short form would mean something different, or nothing:
 *
 *   • NO CITY, NO TRIM. Without the lead's own city there is no redundancy to remove, and
 *     stripping a guessed one would be editing a person's stated criteria.
 *   • THE LABEL THAT IS JUST THE CITY STAYS WHOLE. "San Antonio" → "San Antonio", never "".
 *     A client who asked for the whole market asked for the whole market.
 *   • THE CITY MUST BE A WHOLE-WORD SUFFIX. "Downtown San Antonio" trims; "San Antonio Heights"
 *     does not (the city is not at the end, and the name is not the city plus a qualifier);
 *     "Northwest San Antonio Ranch" does not.
 *   • A ONE-WORD REMAINDER THAT IS A DIRECTION STAYS WHOLE. "North San Antonio" → "North" reads
 *     as a fragment rather than a place, so it keeps its city.
 *   • ONLY THE LEAD'S OWN CITY. No other city name is ever removed from any label, so an area in
 *     a neighbouring metro keeps the word that distinguishes it.
 */
const BARE_DIRECTIONS = new Set([
  "north", "south", "east", "west", "northeast", "northwest", "southeast", "southwest", "central",
])

export function compactDesiredAreas(areas: string | null | undefined, city: string | null | undefined): string {
  const raw = (areas ?? "").trim()
  const town = (city ?? "").trim()
  if (!raw || !town) return raw

  const townLower = town.toLowerCase()
  return raw
    .split(",")
    .map((part) => {
      const label = part.trim()
      if (!label) return label
      const lower = label.toLowerCase()
      // The whole market: nothing to shorten.
      if (lower === townLower) return label
      // The city must sit at the END, on a word boundary.
      if (!lower.endsWith(townLower)) return label
      const head = label.slice(0, label.length - town.length).trim()
      if (!head) return label
      // A boundary, not a coincidence: "…Antonio" must have been preceded by a space.
      if (!/\s$/.test(label.slice(0, label.length - town.length))) return label
      // A lone compass word is a fragment, not a place.
      if (BARE_DIRECTIONS.has(head.toLowerCase())) return label
      return head
    })
    .filter(Boolean)
    .join(", ")
}
