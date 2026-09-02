/**
 * The ONE canonical New-lead intro SMS body.
 *
 * Prefilled as the first-outreach text when a locator texts a still-New lead
 * (Beast Companion "Text Client", Contact Lead → Text, and the Kanban New→Contacted
 * drag → Text). It is a SINGLE message — there is no second/double text.
 *
 * IMPORTANT: prefilling this body is NOT successful contact. It never advances
 * New → Contacted and never records first contact — the Text → Yes, Sent workflow
 * (Last Action "Sent Text", Status "Waiting for Reply", Next Action "Follow Up",
 * lead stays New) is unchanged. This helper only builds the message text; callers
 * append it to the sms: URL and the launch mechanism is untouched.
 *
 * Values are the client's existing dynamic fields (name, locator first name,
 * bedroom/property type, move-in month) — nothing hard-coded.
 */
import { DEFAULT_FOLLOW_UP_TEMPLATES, renderTemplate, type FollowUpTemplateKey } from "./followUpTemplates";
import { buildFollowUpTemplateVars, tidyRenderedMessage } from "./followUpVars";

export function buildIntroSmsBody(
  opts: {
    firstName: string;
    locatorFirstName: string;
    propertyType?: string | null;
    beds?: string | null;
    // Bathrooms — available on the lead everywhere; threaded from the send sites
    // in CP3. Absent → the {baths} token renders "". The default intro does not
    // use {baths}, so parity is unaffected either way.
    baths?: string | null;
    moveDate?: string | null;
  },
  // Optional workspace overrides map. `intro` absent → the code default, so
  // output is byte-identical to the previous hardcoded string.
  overrides?: Partial<Record<FollowUpTemplateKey, string>> | null,
): string {
  // One derivation for both the system tokens the default uses (beds_phrase,
  // move_suffix — byte-identical to the previous inline formula) and the clean
  // agent-facing tokens available to an override.
  const vars = buildFollowUpTemplateVars({
    firstName: opts.firstName,
    agentFirstName: opts.locatorFirstName,
    beds: opts.beds,
    baths: opts.baths,
    propertyType: opts.propertyType,
    moveDate: opts.moveDate,
  });
  const tpl = overrides?.intro;
  const rendered = renderTemplate(tpl ?? DEFAULT_FOLLOW_UP_TEMPLATES.intro, vars);
  return tpl ? tidyRenderedMessage(rendered) : rendered;
}
