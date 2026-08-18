// Pure Smart Apartment Data property-email helper — NO DOM / chrome / window, so it
// is unit-testable in isolation. On a SAD property-detail page the property/leasing
// email lives inside a "copy email" affordance whose onclick is, verbatim:
//   copyTextToClipboard('pm.x@y.com,x@y.com', this)
// The VISIBLE ".email-text" is only a COUNT ("2 emails") and must NEVER be used as the
// value. The authoritative address(es) are the FIRST quoted argument of that call.
//
// Business rule: SAD may supply multiple property emails and Locator Beast retains
// ALL of them — never rank, select a primary, or discard any. We parse the attribute
// as DATA only (no eval/Function/execution): extract the first quoted arg, split on
// commas, trim, drop empties, de-duplicate EXACT duplicates (order preserved). We do
// not rewrite, lowercase, or "correct" addresses, or infer missing domains. Anything
// that does not match the confirmed copyTextToClipboard('...') shape yields [].

export function parseCopyEmails(onclick: string | null | undefined): string[] {
  const source = onclick ?? "";
  // Confirmed form: copyTextToClipboard('<emails>', this). Accept ' or " for the first
  // argument (balanced via the backreference); capture its raw contents. No execution.
  const match = source.match(/copyTextToClipboard\(\s*(['"])([\s\S]*?)\1/);
  if (!match) return [];
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const part of match[2].split(",")) {
    const email = part.trim();
    if (!email || seen.has(email)) continue; // drop empties + exact duplicates
    seen.add(email);
    emails.push(email);
  }
  return emails;
}
