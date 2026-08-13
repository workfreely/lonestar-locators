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
export function buildIntroSmsBody(opts: {
  firstName: string;
  locatorFirstName: string;
  propertyType?: string | null;
  beds?: string | null;
  moveDate?: string | null;
}): string {
  const bedsText =
    opts.propertyType === "Studio"
      ? "studio"
      : opts.propertyType === "High-Rise"
        ? "high-rise"
        : opts.beds
          ? `${String(opts.beds).replace("-", "").trim()} bed`
          : "";
  const monthText = opts.moveDate
    ? ` in ${new Date(opts.moveDate).toLocaleString("en-US", { month: "long" })}`
    : "";
  return `Hey ${opts.firstName} it's ${opts.locatorFirstName}! I got your form for a ${bedsText} move${monthText}. Are you trying to stay near a specific address or side of town?`;
}
