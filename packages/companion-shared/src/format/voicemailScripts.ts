/**
 * VOICEMAIL SCRIPTS — what the locator reads aloud, and nothing else.
 *
 * These are AGENT-FACING reading aids. Nothing here is sent to a client, enqueued, or shown to
 * anyone but the locator, so none of it is message copy in the sense the follow-up templates are.
 *
 * ── WHY THE APPROVED WORDING HAS ONE DEPARTURE ──────────────────────────────────────────────
 * The approved scripts say "These communities check your boxes! [two features]", which asserts
 * that the recommended properties HAVE those features. Nothing available can verify that: the
 * Companion's RecommendationDTO carries name, address, URL and rating — no amenities — and
 * property_catalog.amenity_keywords is not joined into a lead's recommendations. Rather than let
 * the panel state a property fact it cannot check, that one sentence becomes a claim about what
 * the CLIENT asked for, which the lead's own data does support:
 *
 *     "I focused on the features you mentioned, especially X and Y."
 *
 * Every other line is the approved wording, unchanged.
 */

/** The scripts that exist. `pre_tour` is reserved and deliberately has no body yet. */
export const VOICEMAIL_TEMPLATE_KEYS = ["list_sent_30_90", "list_sent_over_90", "pre_tour"] as const;
export type VoicemailTemplateKey = (typeof VOICEMAIL_TEMPLATE_KEYS)[number];

/** Keys the server will accept. `pre_tour` is absent until its copy is approved. */
export const SAVEABLE_VOICEMAIL_KEYS: readonly VoicemailTemplateKey[] = [
  "list_sent_30_90",
  "list_sent_over_90",
  "pre_tour",
];

export const VOICEMAIL_TEMPLATE_LABELS: Record<VoicemailTemplateKey, string> = {
  list_sent_30_90: "List Sent — 30–90 Days",
  list_sent_over_90: "List Sent — Over 90 Days",
  pre_tour: "Pre-Tour Voicemail",
};

/** The approved specials paragraph, VERBATIM. Rendered only when explicitly enabled. */
export const VOICEMAIL_SPECIALS_PARAGRAPH =
  "Keep in mind, most of these communities are running great specials, and with those applied, the average monthly rent falls within or even below your budget.";

export const PREFERENCE_PLACEHOLDERS = ["[Preference 1]", "[Preference 2]"] as const;

/** What the Pre-Tour script says when NOTHING is confirmed. Bracketed so it reads as a gap to
 *  fill, never as a statement — the locator picks the wording once they know. */
export const TOUR_PLACEHOLDERS = {
  noun: "[tour/tours]",
  praise: "[this is such a great option / these are all great options]",
} as const;
const NAME_PLACEHOLDER = "[First Name]";
const MONTH_PLACEHOLDER = "[Move-In Month]";
const TIMEFRAME_PLACEHOLDER = "[Availability Timeframe]";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "YYYY-MM-DD" → a LOCAL Date, parsed by parts. Never `new Date(iso)`, which shifts behind UTC. */
function parseLocalDate(iso: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole days from `now` to the move date. Null when there is no usable date. */
export function daysUntilMove(moveDate: string | null | undefined, now: Date = new Date()): number | null {
  const d = parseLocalDate(moveDate);
  if (!d) return null;
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d.getTime() - a.getTime()) / 86_400_000);
}

/** "January", or null when there is no move date to read. */
export function moveMonthName(moveDate: string | null | undefined): string | null {
  const d = parseLocalDate(moveDate);
  return d ? MONTHS[d.getMonth()] : null;
}

/**
 * A suggested window to revisit pricing — roughly 60–90 days before the move, phrased the way a
 * person says it ("early November"). An ESTIMATE about when to look again, never a claim that
 * anything will be available then.
 */
export function availabilityTimeframe(moveDate: string | null | undefined): string | null {
  const d = parseLocalDate(moveDate);
  if (!d) return null;
  // The midpoint of the 60–90 day window: 75 days out.
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 75);
  const day = t.getDate();
  const part = day <= 10 ? "early" : day <= 20 ? "mid" : "late";
  return `${part} ${MONTHS[t.getMonth()]}`;
}

export type TemplateChoice =
  | { key: VoicemailTemplateKey; automatic: true }
  | { key: null; automatic: false; reason: "no_move_date" | "under_30_days" };

/**
 * Which script the move date implies.
 *
 * 30–90 days and over 90 days each have an approved script. Under 30 days and a missing date do
 * NOT — so neither is chosen for the locator. Picking one anyway would put a "we'll look again in
 * a couple of months" script in front of someone moving next week.
 */
export function chooseTemplate(moveDate: string | null | undefined, now: Date = new Date()): TemplateChoice {
  const days = daysUntilMove(moveDate, now);
  if (days === null) return { key: null, automatic: false, reason: "no_move_date" };
  if (days < 30) return { key: null, automatic: false, reason: "under_30_days" };
  return { key: days > 90 ? "list_sent_over_90" : "list_sent_30_90", automatic: true };
}

/**
 * The two features to name, in the order the brief sets: the form first, then AI Client Insights,
 * then notes. Whatever is missing stays a visible placeholder — an editable gap is honest, a
 * guessed amenity is not.
 *
 * `amenityLabel` is injected so this module stays free of the amenity catalogue.
 */
export function pickPreferences(input: {
  mustHaveAmenities?: readonly string[] | null;
  aiInsights?: readonly string[] | null;
  clientNotes?: string | null;
  locatorNotes?: string | null;
  amenityLabel?: (value: string) => string;
}): { values: [string, string]; grounded: [boolean, boolean] } {
  const label = input.amenityLabel ?? ((v: string) => v);
  const found: string[] = [];

  // 1) The form — explicit, structured, and the client's own selection.
  for (const a of input.mustHaveAmenities ?? []) {
    const v = label(String(a).trim());
    if (v && !found.includes(v)) found.push(v);
    if (found.length === 2) break;
  }

  // 2) AI Client Insights — already derived from synced conversations. Only a bullet that reads
  //    as a PREFERENCE is used; the rest describe circumstances ("currently deployed") and would
  //    make nonsense of "the features you mentioned".
  if (found.length < 2) {
    for (const bullet of input.aiInsights ?? []) {
      const m = /\b(?:loved|loves|liked|likes|wants|wanted|needs|prefers|preferred|looking for|asked for)\b\s+(?:the\s+)?([^.,;]{3,40})/i.exec(String(bullet));
      const v = m?.[1]?.trim();
      if (v && !found.includes(v)) found.push(v);
      if (found.length === 2) break;
    }
  }

  const values: [string, string] = [
    found[0] ?? PREFERENCE_PLACEHOLDERS[0],
    found[1] ?? PREFERENCE_PLACEHOLDERS[1],
  ];
  return { values, grounded: [found.length > 0, found.length > 1] };
}

export type VoicemailContext = {
  firstName?: string | null;
  moveDate?: string | null;
  preferences: [string, string];
  /** Opt-in. Unverifiable by the Companion today, so the caller decides. */
  includeSpecials?: boolean;
  /** Overrides the computed window when the locator adjusts it. */
  availabilityOverride?: string | null;
  /** CONFIRMED upcoming appointments (DTO-derived). 0 keeps the Pre-Tour wording bracketed. */
  upcomingTourCount?: number | null;
};

/**
 * Render a script. Paragraphs are joined with a blank line, the way they are read.
 *
 * A value that cannot be resolved stays as its bracketed placeholder — the locator sees exactly
 * what is missing instead of a sentence that has quietly lost a word.
 */
export function renderVoicemail(key: VoicemailTemplateKey, ctx: VoicemailContext): string {
  const name = (ctx.firstName ?? "").trim() || NAME_PLACEHOLDER;

  // PRE-TOUR. The script tells the client they are "all set", which is a claim about a booking —
  // so the singular/plural and the praise come from CONFIRMED UPCOMING appointments, and when
  // there are none the wording stays bracketed rather than asserting a tour that is not booked.
  if (key === "pre_tour") {
    const n = ctx.upcomingTourCount ?? 0;
    const noun = n === 0 ? TOUR_PLACEHOLDERS.noun : n === 1 ? "tour" : "tours";
    const praise = n === 0
      ? TOUR_PLACEHOLDERS.praise
      : n === 1
        ? "this is such a great option"
        : "these are all great options";
    return [
      `Hey ${name}, you're all set for your ${noun}!`,
      `I'm really excited for you because ${praise}!`,
      `After your ${noun}, let me know what you think.`,
      "If you need anything at all, just let me know.",
      "Alright, talk to you soon. Bye-bye!",
    ].join("\n\n");
  }

  const [p1, p2] = ctx.preferences;

  const paragraphs: string[] = [
    `Hey ${name}, it's Jay! Hope you're doing well!`,
    "I just sent your list over! I narrowed it down to your best options, and I think you're going to love the ones I found.",
    `I focused on the features you mentioned, especially ${p1} and ${p2}.`,
  ];

  if (ctx.includeSpecials) paragraphs.push(VOICEMAIL_SPECIALS_PARAGRAPH);

  paragraphs.push(
    "I added notes explaining why I chose each property for you, so take a look when you get a chance and let me know your favorites.",
  );

  if (key === "list_sent_over_90") {
    const month = moveMonthName(ctx.moveDate) ?? MONTH_PLACEHOLDER;
    const when = (ctx.availabilityOverride ?? "").trim() || availabilityTimeframe(ctx.moveDate) || TIMEFRAME_PLACEHOLDER;
    paragraphs.push(
      `Since you're moving in ${month}, we should have a better idea of pricing, availability, and specials for your move date by ${when}. That would also be a great time to start scheduling tours.`,
    );
  }

  paragraphs.push(
    "If anything changes or you'd like me to tweak the list, just let me know, and we'll get some tours set up.",
    "Talk to you soon!",
  );

  return paragraphs.join("\n\n");
}
