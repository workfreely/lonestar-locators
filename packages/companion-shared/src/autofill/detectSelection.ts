/**
 * Read-only tour date/time detection.
 *
 * TWO halves, deliberately split so the smart part is testable without a DOM:
 *   1. collectTourSelectionCandidates() — a SELF-CONTAINED harvester injected into
 *      the bound scheduler tab (like autofillTourForm). It only EXTRACTS raw
 *      candidate values from the light DOM, open shadow roots, and same-origin
 *      iframes. No parsing, no decisions — it returns plain SelectionCandidate[].
 *   2. decideSelection() + the parsers/guards — PURE functions that run in the side
 *      panel (never injected), so they are unit-tested directly with candidate
 *      arrays (see detectSelection.test.mts). This is where all confidence and
 *      false-positive protection lives.
 *
 * NEVER guesses: a value is only accepted when it is explicitly SELECTED/current,
 * machine-parseable to a full value, and in an appointment/tour context (never
 * move-in date, move-in timeline, business hours, calendar navigation, or an
 * unselected available slot). Insufficient confidence → that field stays null.
 */

export type DetectedSelection = { date: string | null; time: string | null };

/** One harvested value from the scheduler DOM. */
export type SelectionCandidate = {
  /** "date"/"time" when the source is unambiguous (native input); "datetime" when
   *  the value is free-form and both parsers should be tried. */
  kind: "date" | "time" | "datetime";
  /** Raw value/text to parse (input value, data-*, aria-label, <time> datetime, …). */
  value: string;
  /** Is this an explicitly SELECTED / current value (input has a value, control is
   *  checked, element is aria-selected/pressed, or it is a confirmed summary)? An
   *  unselected available slot must be selected=false so it is ignored. */
  selected: boolean;
  /** Confidence tier: 1 (native input) best … 6 (confirmation summary) weakest. */
  tier: number;
  /** Lowercased label/name/id/heading blob around the value — used to tell an
   *  appointment apart from a move-in / timeline / hours / nav value. */
  context: string;
};

// ── Pure parsers ────────────────────────────────────────────────────────────
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const pad = (n: number) => String(n).padStart(2, "0");
function iso(y: number, mo: number, d: number): string | null {
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** → "YYYY-MM-DD" for a real, unambiguous date; null otherwise (a bare day number,
 *  a month/year with no day, or a date with no 4-digit year is REJECTED). */
export function parseDateValue(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/.exec(s); // ISO (optionally w/ time)
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s); // US MM/DD/YYYY
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return iso(y, +m[1], +m[2]); }
  // "Month Day, Year" / "Weekday, Month Day Year" — REQUIRES a 4-digit year.
  const mm = /(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i.exec(s);
  if (mm) { const mo = MONTHS[mm[1].toLowerCase()]; if (mo) return iso(+mm[3], mo, +mm[2]); }
  return null;
}

/** → 24-hour "HH:mm" for an unambiguous clock time; null otherwise. */
export function parseTimeValue(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let m = /(?:^|\b)(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?(?:$|\b)/i.exec(s); // 12h "9:00 AM"
  if (m) { let h = +m[1] % 12; if (/p/i.test(m[3])) h += 12; const mi = m[2] ? +m[2] : 0; if (h > 23 || mi > 59) return null; return `${pad(h)}:${pad(mi)}`; }
  m = /T(\d{2}):(\d{2})/.exec(s); // ISO datetime time part
  if (m) { const h = +m[1], mi = +m[2]; if (h > 23 || mi > 59) return null; return `${pad(h)}:${pad(mi)}`; }
  m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s); // 24h "HH:mm"
  if (m) { const h = +m[1], mi = +m[2]; if (h > 23 || mi > 59) return null; return `${pad(h)}:${pad(mi)}`; }
  return null;
}

// ── Context classification ──────────────────────────────────────────────────
const MOVE_RE = /move|movein|move-in|moveindate|desired|timeline|occupanc/;
const HOURS_RE = /\bhours\b|office|open\s|closed|business hour|availability/;
const TOUR_RE = /tour|appointment|appt|visit|showing|viewing|preferred (date|time)|selected (date|time)|scheduled for|see you on|reserved/;

export function isMoveContext(ctx: string): boolean { return MOVE_RE.test(ctx); }
export function isHoursContext(ctx: string): boolean { return HOURS_RE.test(ctx); }
export function isTourContext(ctx: string): boolean { return TOUR_RE.test(ctx); }

// ── Pure decision ───────────────────────────────────────────────────────────
/**
 * Decide the selected tour date and/or time from harvested candidates. Each field
 * is independent (partial detection allowed). Returns null for a field unless a
 * candidate is (a) selected, (b) parses to a full value, (c) not in a move-in /
 * timeline / hours context, and (d) either from a machine-readable source
 * (tier ≤ 3) or in an explicit tour/appointment context. `today` ("YYYY-MM-DD")
 * lets a today-valued weak candidate be rejected unless it is clearly the tour.
 */
export function decideSelection(cands: SelectionCandidate[], today?: string): DetectedSelection {
  const pick = (want: "date" | "time"): string | null => {
    const parsed = cands
      .filter((c) => c.selected)
      .filter((c) => c.kind === want || c.kind === "datetime")
      .filter((c) => !isMoveContext(c.context) && !isHoursContext(c.context))
      .map((c) => {
        const value = want === "date" ? parseDateValue(c.value) : parseTimeValue(c.value);
        return value ? { value, tier: c.tier, ctx: c.context } : null;
      })
      .filter((x): x is { value: string; tier: number; ctx: string } => x != null);
    // Weak sources (tier ≥ 4: selected-state elements, <time>, summaries) require an
    // explicit tour/appointment context; machine sources (tier ≤ 3) are trusted.
    let qualified = parsed.filter((p) => p.tier <= 3 || isTourContext(p.ctx));
    // A DATE equal to today from a weak, non-tour source is the classic false
    // positive (a "generated on" date) — drop it unless it is strongly sourced.
    if (want === "date" && today) {
      const strong = qualified.filter((p) => !(p.value === today && p.tier > 2 && !isTourContext(p.ctx)));
      if (strong.length) qualified = strong;
    }
    if (!qualified.length) return null;
    return qualified.sort((a, b) => a.tier - b.tier)[0].value;
  };
  return { date: pick("date"), time: pick("time") };
}

// ── Injected harvester (self-contained; no external references) ──────────────
/**
 * Runs INSIDE the scheduler page via chrome.scripting.executeScript. Must be fully
 * self-contained (all helpers nested) — it is serialized and injected. Returns
 * plain SelectionCandidate[]; all decisions happen panel-side in decideSelection().
 */
export function collectTourSelectionCandidates(): SelectionCandidate[] {
  const out: SelectionCandidate[] = [];
  const seenValue = new Set<string>();
  // Local copies — this function is serialized/injected, so it cannot reference the
  // module-level regexes above.
  const MOVE_L = /move|movein|move-in|moveindate|desired|timeline|occupanc/;
  const TOUR_L = /tour|appointment|appt|visit|showing|viewing|preferred (date|time)|selected (date|time)|scheduled for|see you on|reserved/;

  const lc = (s: unknown) => (s == null ? "" : String(s)).toLowerCase();
  const attr = (el: any, a: string) => (el && el.getAttribute ? el.getAttribute(a) : null);
  const isVisible = (el: any): boolean => {
    try {
      if (!el) return false;
      const rects = el.getClientRects && el.getClientRects();
      if ((!rects || rects.length === 0) && el.offsetParent === null) return false;
      const cs = (el.ownerDocument && el.ownerDocument.defaultView ? el.ownerDocument.defaultView : window).getComputedStyle(el);
      if (cs && (cs.display === "none" || cs.visibility === "hidden")) return false;
      return true;
    } catch (e) { return true; }
  };
  // Label/name/id/heading blob around an element, for context classification.
  const contextOf = (el: any): string => {
    const bits: string[] = [];
    try {
      bits.push(lc(attr(el, "name")), lc(el.id), lc(attr(el, "aria-label")), lc(attr(el, "placeholder")), lc(attr(el, "data-selenium-id")));
      if (el.labels) for (let i = 0; i < el.labels.length; i++) bits.push(lc(el.labels[i].textContent));
      const forLbl = el.id && el.getRootNode ? (el.getRootNode().querySelector ? el.getRootNode().querySelector('label[for="' + el.id + '"]') : null) : null;
      if (forLbl) bits.push(lc(forLbl.textContent));
      let p = el.closest ? el.closest("label") : null;
      if (p) bits.push(lc(p.textContent));
      // A few ancestors' class/id + any heading/legend text inside them.
      let anc = el.parentElement, hops = 0;
      while (anc && hops < 4) {
        bits.push(lc(anc.className), lc(anc.id));
        const h = anc.querySelector ? anc.querySelector("h1,h2,h3,h4,h5,legend,[class*='title'],[class*='heading'],[class*='question']") : null;
        if (h) bits.push(lc(h.textContent).slice(0, 80));
        anc = anc.parentElement; hops++;
      }
    } catch (e) { /* noop */ }
    return bits.filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 400);
  };
  const push = (kind: "date" | "time" | "datetime", value: string, selected: boolean, tier: number, ctx: string) => {
    const v = (value || "").trim();
    if (!v) return;
    const key = kind + "|" + tier + "|" + v + "|" + selected;
    if (seenValue.has(key)) return;
    seenValue.add(key);
    out.push({ kind, value: v.slice(0, 120), selected, tier, context: ctx });
  };
  const selectedAncestor = (el: any): boolean => {
    let n: any = el, hops = 0;
    while (n && hops < 5) {
      if (attr(n, "aria-selected") === "true" || attr(n, "aria-pressed") === "true" || attr(n, "aria-checked") === "true" || attr(n, "data-selected") != null) return true;
      const cls = " " + lc(n.className) + " ";
      if (/\bselected\b|\bis-selected\b|\bactive\b|\bis-active\b|\bchosen\b/.test(cls)) return true;
      n = n.parentElement; hops++;
    }
    return false;
  };

  const scanRoot = (root: any) => {
    if (!root || !root.querySelectorAll) return;
    // Tier 1 — native date/time inputs with a value.
    const inputs = root.querySelectorAll("input");
    for (let i = 0; i < inputs.length; i++) {
      const el: any = inputs[i];
      const type = lc(el.type);
      const ctx = contextOf(el);
      if ((type === "date" || type === "datetime-local") && el.value) push("date", el.value, true, 1, ctx);
      else if (type === "time" && el.value) push("time", el.value, true, 1, ctx);
      // Tier 2 — a CHECKED radio/checkbox whose value/label is a date or time.
      else if ((type === "radio" || type === "checkbox") && el.checked) {
        const v = el.value && el.value !== "on" ? el.value : (attr(el, "aria-label") || contextOf(el));
        if (v) push("datetime", String(v), true, 2, ctx);
      }
      // Tier 3 — hidden APPOINTMENT state (name/id must be tour+date/time-ish, never
      // move/timeline) with a real value.
      else if (type === "hidden" && el.value) {
        const idn = lc(el.name) + " " + lc(el.id) + " " + lc(attr(el, "class"));
        if (/(appointment|appt|tour|visit|schedule|selected|preferred)/.test(idn) && /(date|time|slot|start|datetime|appt)/.test(idn) && !MOVE_L.test(idn)) {
          push("datetime", el.value, true, 3, ctx);
        }
      }
    }
    // Tier 4 — selected-state elements carrying an explicit date/time value.
    const marked = root.querySelectorAll('[aria-selected="true"],[aria-pressed="true"],[data-selected],[class*="selected" i],[class*="active" i]');
    for (let i = 0; i < marked.length; i++) {
      const el: any = marked[i];
      if (!isVisible(el)) continue;
      const v = attr(el, "data-date") || attr(el, "data-time") || attr(el, "data-datetime") || attr(el, "data-value") || attr(el, "aria-label") || (el.querySelector && el.querySelector("time") ? attr(el.querySelector("time"), "datetime") : null) || el.textContent;
      if (v) push("datetime", String(v), true, 4, contextOf(el));
    }
    // Tier 5 — <time datetime> that is within a selected/appointment context.
    const times = root.querySelectorAll("time[datetime]");
    for (let i = 0; i < times.length; i++) {
      const el: any = times[i];
      const ctx = contextOf(el);
      if (selectedAncestor(el) || TOUR_L.test(ctx)) push("datetime", attr(el, "datetime") || el.textContent, true, 5, ctx);
    }
    // Tier 6 — an explicit appointment confirmation/summary line.
    const summaries = root.querySelectorAll('[class*="appointment" i],[class*="confirm" i],[class*="summary" i],[data-selenium-id="appointmentinfo"]');
    for (let i = 0; i < summaries.length; i++) {
      const el: any = summaries[i];
      if (!isVisible(el)) continue;
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (t && t.length < 160 && TOUR_L.test(lc(t))) push("datetime", t, true, 6, lc(t));
    }
    // Descend into OPEN shadow roots (same capability autofill uses).
    const hosts = root.querySelectorAll("*");
    for (let i = 0; i < hosts.length; i++) { const sr = (hosts[i] as any).shadowRoot; if (sr) scanRoot(sr); }
  };

  try {
    scanRoot(document);
    const frames = document.querySelectorAll("iframe");
    for (let f = 0; f < frames.length; f++) {
      try { const d = (frames[f] as HTMLIFrameElement).contentDocument; if (d && d.body) scanRoot(d); } catch (e) { /* cross-origin */ }
    }
  } catch (e) { /* noop */ }
  return out;
}
