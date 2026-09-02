/**
 * List Sent follow-up SMS templates — existing wording preserved verbatim.
 *
 * Keyed by the canonical follow-up identity, accepting either the legacy title
 * ("FU1"/"FU2"/"FU3"/"Final") or the action_key (follow_up_1/2/3/final_follow_up).
 * Only the Final Follow-Up is name-personalized (matches the current CRM copy).
 */
import {
  DEFAULT_FOLLOW_UP_TEMPLATES,
  renderTemplate,
  type FollowUpTemplateKey,
} from "./followUpTemplates";
import { buildFollowUpTemplateVars, tidyRenderedMessage } from "./followUpVars";

// Map the workflow identity (action_key OR legacy title) to a CONTENT key. This
// is the ONLY bridge between the workflow and the message-text layer; it reads
// the identity and changes nothing about it. Unrecognized → final_follow_up, the
// same fallthrough the previous implementation used.
function contentKeyFor(titleOrKey: string): FollowUpTemplateKey {
  const k = (titleOrKey || "").trim().toLowerCase();
  if (k === "fu1" || k === "follow_up_1") return "follow_up_1";
  if (k === "fu2" || k === "follow_up_2") return "follow_up_2";
  if (k === "fu3" || k === "follow_up_3") return "follow_up_3";
  return "final_follow_up";
}

export function buildFollowUpSmsBody(
  titleOrKey: string,
  name: string,
  // Optional workspace overrides map. The follow-up's key absent → the code
  // default, so output is byte-identical to the previous hardcoded strings.
  overrides?: Partial<Record<FollowUpTemplateKey, string>> | null,
  // Optional approved-variable values so an OVERRIDE may use {agent_first_name},
  // {beds}, {baths}, {property_type}, {move_month}. Omitted → those render "".
  // The DEFAULTS use only {first_name} (Final), so this never affects parity.
  extraVars?: { agentFirstName?: string | null; beds?: string | null; baths?: string | null; propertyType?: string | null; moveDate?: string | null } | null,
): string {
  const key = contentKeyFor(titleOrKey);
  const vars = buildFollowUpTemplateVars({ firstName: name, ...extraVars });
  const tpl = overrides?.[key];
  const rendered = renderTemplate(tpl ?? DEFAULT_FOLLOW_UP_TEMPLATES[key], vars);
  return tpl ? tidyRenderedMessage(rendered) : rendered;
}
