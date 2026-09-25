/**
 * Follow-up MESSAGE TEXT layer (CP1 — content only).
 *
 * This module owns the DEFAULT wording of the live client-facing SMS templates
 * and the smallest possible token-substitution renderer. It is a CONTENT layer
 * ONLY: it decides what a message says, never when it is sent, which action is
 * next, or how the workflow behaves. It touches no workflow/action_key/timing/
 * stage/automation logic and must never do so.
 *
 * Content keys here (`intro`, `text_top_3`, `follow_up_1` …) are for LOOKING UP
 * MESSAGE TEXT ONLY. They are deliberately distinct from workflow `action_key`
 * values and must never replace or alter them. `buildFollowUpSmsBody` maps the
 * workflow identity (action_key / legacy title) to one of these content keys;
 * that mapping is the only bridge and it does not change the workflow side.
 *
 * Interpolation: templates use `{token}` placeholders. The renderer substitutes
 * ONLY the tokens the caller supplies, drawn from the SAME values the code
 * already computed before this layer existed — so with no override, every
 * message is byte-identical to the previous hardcoded output.
 *
 * The builders accept an optional workspace OVERRIDES map; each picks its own
 * content key (`override ?? default`), interpolates, and — only when an override
 * is used — runs the result through the narrow `tidyRenderedMessage`. With no
 * override the code default is used verbatim (no tidy), so output is byte-
 * identical to production. Reset-to-default is simply the absence of a key.
 */
import { tidyRenderedMessage } from "./followUpVars";

/** Content-only lookup keys for editable message text. NOT workflow action keys.
 *
 * The `contact_follow_up_*` keys are the PRE-LIST contact-chase sequence (a lead
 * contacted/attempted but not yet at List Sent). They are DISTINCT from the
 * post-List-Sent `follow_up_1/2/3` + `final_follow_up` sequence and must never be
 * confused with them — see followUpSms.ts for the explicit (never-fall-through)
 * content-key mapping. */
export type FollowUpTemplateKey =
  | "intro"
  | "text_top_3"
  | "follow_up_1"
  | "follow_up_2"
  | "follow_up_3"
  | "final_follow_up"
  | "contact_follow_up_1"
  | "contact_follow_up_2"
  | "contact_follow_up_3"
  // ── Follow-Up Agent Phase-1 canonical client-facing templates ──────────────
  // Additive keys (backward-compatible): legacy keys above are unchanged and stay
  // honored by their current consumers. These are the NEW canonical messages the
  // Follow-Up Agent + editor use. `new_lead_text1` carries a `{search_tail}`
  // SYSTEM token (engine-composed, gracefully omitted) — see lib/followup/copy.ts.
  | "new_lead_text1"
  | "new_lead_text2"
  | "list_fu3_favorites"
  | "list_fu3_no_favorites"
  | "list_final"
  | "ds_availability_submitted"
  | "ds_needs_availability"
  | "ds_tour_now_or_wait"
  | "future_move_wait_ack"
  | "future_move_reactivate"
  | "post_tour"
  | "application_status"
  // ── Event-triggered (NOT part of the New Lead chronological sequence) ──────
  // Fires from the client-driven "Resume Your Search" event on a paused /r page.
  // Content-only key; the Resume event + its own registry sequence (resume_search)
  // decide when/whether it is ever sent — this layer only owns the wording.
  | "resume_search";

/**
 * The canonical DEFAULT wording. Each value is the EXACT current text with the
 * previously-inline dynamic pieces expressed as `{token}` placeholders. Editing
 * these strings changes wording only.
 *
 * Note `intro`'s `{move_month}` expands to the full connective (" in September"
 * or "") and `{beds}` to the derived phrase ("2 bed" / "studio" / "high-rise" /
 * ""), exactly as the code produced them — so the rendered output is unchanged,
 * including the (pre-existing) double space when no beds/type is known.
 */
export const DEFAULT_FOLLOW_UP_TEMPLATES: Record<FollowUpTemplateKey, string> = {
  // The intro's beds/month use SYSTEM tokens ({beds_phrase}, {move_suffix}) that
  // carry the legacy conflation ("studio"/"high-rise"/"2 bed") and the optional
  // " in <Month>" connective, so the rendered default is byte-identical to before
  // — while the agent-facing {beds}/{move_month} tokens stay clean/bare.
  intro:
    "Hey {first_name} it's {agent_first_name}! I got your form for a {beds_phrase} move{move_suffix}. Are you trying to stay near a specific address or side of town?",
  text_top_3:
    "Hey {first_name}, I found 3 excellent options for you!\n\n{property_list}\n\nWhich one do you like most?",
  follow_up_1: "Hey! Did you see any properties on the list that you'd like to tour?",
  follow_up_2: "Is there one that stands out or would you like me to narrow the list down a bit more?",
  follow_up_3:
    "I'm calling communities you were interested in to get updated pricing and specials. Are you still looking to move?",
  final_follow_up:
    "Hey {first_name}, I haven't heard back so I'll pause your search for now. No rush, just let me know when you'd like me to pick it back up!",
  // ── PRE-LIST contact-chase sequence (Contact FU1 → FU2 → FU3) ──────────────
  // Separate from the post-List-Sent ladder above. Only FU1 personalizes with
  // {first_name}; FU2 and FU3 are intentionally static (no client name).
  contact_follow_up_1:
    "Hey {first_name}! Are you still looking for a place? I can put together some options for you.",
  contact_follow_up_2: "Did you see any properties on my page you'd like more info on?",
  contact_follow_up_3:
    "I'll go ahead and pause your search for now. Please let me know if you'd like help finding a place!",
  // ── Follow-Up Agent Phase-1 canonical templates (approved/LOCKED copy) ──────
  // new_lead_text1: {search_tail} is engine-composed — " for a 1 bedroom move in
  // October." with data, or "!" when none — so the search clause is gracefully
  // omitted and never renders "a  move".
  new_lead_text1: "Hey {first_name} it's {agent_first_name}! I got your form{search_tail}",
  new_lead_text2: "Are you trying to stay near a specific address or side of town?",
  list_fu3_favorites:
    "I'm calling the communities you were interested in to get updated pricing and specials. Are you still looking to move?",
  list_fu3_no_favorites:
    "I'm calling communities on your list to get updated pricing and specials. Are you still looking to move?",
  list_final:
    "I haven't heard back so I'll pause your search for now. No rush, just let me know when you'd like me to pick it back up.",
  ds_availability_submitted:
    "Those are excellent options! I noted those as your favorites. I'll get back to you once I have the tour confirmations.",
  ds_needs_availability:
    "Those are excellent options! I noted those as your favorites. When you get a chance, can you select your availability to tour on the recommendations page?",
  ds_tour_now_or_wait:
    "Those are excellent options! I noted those as your favorites. Would you like me to set up a tour now or wait until you're closer to your move date?",
  future_move_wait_ack:
    "Perfect! Let's keep in touch. I'll reach back out about 90 days before your move date so we can get everything set up.",
  future_move_reactivate:
    "Hey {first_name}! Hope you're doing well. We're getting closer to your move date. When would you like me to get the tours set up for your favorites?",
  post_tour: "How did the tour go? Hopefully everything went well",
  application_status: "Have you heard anything back on your application yet?",
  resume_search:
    "Hey {first_name}! I got your request to continue your apartment search. Has anything changed since we last talked or would you like me to update your list?",
};

/**
 * Tokens each template legitimately uses (the tokens present in its default).
 * A later UI can offer these as insertable chips and soft-warn (never block the
 * workflow) if a required one is removed. FU1–FU3 have no tokens (fully static).
 */
export const TEMPLATE_TOKENS: Record<FollowUpTemplateKey, readonly string[]> = {
  intro: ["first_name", "agent_first_name", "beds_phrase", "move_suffix"],
  text_top_3: ["first_name", "property_list"],
  follow_up_1: [],
  follow_up_2: [],
  follow_up_3: [],
  final_follow_up: ["first_name"],
  // Pre-list contact chase: only FU1 personalizes; FU2/FU3 are static.
  contact_follow_up_1: ["first_name"],
  contact_follow_up_2: [],
  contact_follow_up_3: [],
  // Follow-Up Agent Phase-1 canonical templates.
  new_lead_text1: ["first_name", "agent_first_name", "search_tail"],
  new_lead_text2: [],
  list_fu3_favorites: [],
  list_fu3_no_favorites: [],
  list_final: [],
  ds_availability_submitted: [],
  ds_needs_availability: [],
  ds_tour_now_or_wait: [],
  future_move_wait_ack: [],
  future_move_reactivate: ["first_name"],
  post_tour: [],
  application_status: [],
  resume_search: ["first_name"],
};

/**
 * The approved agent-facing variable menu — EXACTLY these six, insertable into
 * any editable template. Each renders a clean/bare value (no surrounding spaces
 * or punctuation). Deliberately excludes last name and any personal / financial /
 * rental-history field. `{property_list}` is NOT here — it is system-only.
 */
export const AGENT_TEMPLATE_VARIABLES: ReadonlyArray<{ token: string; label: string }> = [
  { token: "first_name", label: "First Name" },
  { token: "agent_first_name", label: "Agent Name" },
  { token: "move_month", label: "Move Month" },
  { token: "beds", label: "Bedrooms" },
  { token: "baths", label: "Bathrooms" },
  { token: "property_type", label: "Property Type" },
];

/**
 * System-only tokens — inserted/derived by code, never offered in the agent
 * variable menu. `property_list` is Text Top 3's dynamic property block;
 * `beds_phrase`/`move_suffix` carry the intro default's legacy presentation.
 */
export const SYSTEM_TEMPLATE_TOKENS: readonly string[] = ["property_list", "beds_phrase", "move_suffix", "search_tail"];

/** Human-readable token catalog (labels for a later editing UI). */
export const FOLLOW_UP_TOKEN_LABELS: Record<string, string> = {
  first_name: "First Name",
  agent_first_name: "Agent Name",
  move_month: "Move Month",
  beds: "Bedrooms",
  baths: "Bathrooms",
  property_type: "Property Type",
  // System-only:
  property_list: "Top 3 properties with links (inserted automatically)",
  beds_phrase: "Beds/property-type phrase (system; default intro only)",
  move_suffix: "Move-month connective (system; default intro only)",
  search_tail: "Search context (system; e.g. \" for a 1 bedroom move in October.\", gracefully omitted when unknown)",
};

/**
 * Max EDITABLE length per template — a conversion/writing guardrail on the text
 * the agent types, NOT a change to SMS sending. Counts the editable template
 * text itself (tokens counted as their literal `{token}` form).
 *
 * `text_top_3` counts only its STATIC/customizable wording: its `{property_list}`
 * token stands in for the dynamically inserted property names/URLs, which are not
 * part of the editable text and are excluded from the count by construction. Its
 * default static template is ~100 chars; 200 leaves conversational room.
 */
export const TEMPLATE_CHAR_LIMITS: Record<FollowUpTemplateKey, number> = {
  intro: 180,
  text_top_3: 200,
  follow_up_1: 140,
  follow_up_2: 140,
  follow_up_3: 140,
  final_follow_up: 180,
  contact_follow_up_1: 180,
  contact_follow_up_2: 140,
  contact_follow_up_3: 180,
  // Follow-Up Agent Phase-1 canonical templates.
  new_lead_text1: 180,
  new_lead_text2: 140,
  list_fu3_favorites: 200,
  list_fu3_no_favorites: 200,
  list_final: 200,
  ds_availability_submitted: 200,
  ds_needs_availability: 220,
  ds_tour_now_or_wait: 220,
  future_move_wait_ack: 200,
  future_move_reactivate: 220,
  post_tour: 140,
  application_status: 140,
  resume_search: 200,
};

/**
 * The smallest token renderer: replace each `{token}` with the supplied value.
 * Unknown tokens (not in `vars`) are left as their literal `{token}` form —
 * never mangled or blanked — and substitution is single-pass, so a value that
 * itself contained braces is never re-substituted.
 */
export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (literal, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : literal,
  );
}

/**
 * "Text Top 3" body builder. Reproduces the exact current wording: a static
 * intro line, the top-3 property block (numbered name + URL, joined by blank
 * lines), and a static closing question. The property block is the
 * `{property_list}` token (dynamic; excluded from the editable char count).
 *
 * `override` (unused in CP1) is the future workspace-level custom text; omitted
 * → the code default, so output is byte-identical to today.
 */
export function buildTextTop3Body(
  opts: { firstName: string; topMatches?: Array<{ name?: string | null; website?: string | null }> },
  overrides?: Partial<Record<FollowUpTemplateKey, string>> | null,
): string {
  // Property block — UNCHANGED construction/order/URL handling. This is the
  // system-only {property_list} token; the override only changes the surrounding
  // editable wording.
  const property_list = (opts.topMatches ?? [])
    .slice(0, 3)
    .map((p, i) => {
      const site = p.website ?? "";
      const url = site.startsWith("http") ? site : `https://${site || ""}`;
      return `${i + 1}. ${p.name}\n${url}`;
    })
    .join("\n\n");
  const tpl = overrides?.text_top_3;
  const rendered = renderTemplate(tpl ?? DEFAULT_FOLLOW_UP_TEMPLATES.text_top_3, {
    first_name: opts.firstName,
    property_list,
  });
  // Tidy an agent override only; the default is emitted verbatim (parity).
  return tpl ? tidyRenderedMessage(rendered) : rendered;
}
