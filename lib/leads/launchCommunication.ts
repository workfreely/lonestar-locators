// Communication launch — the CRM-page side.
//
// tel:/sms: are external protocols. Clicking an <a href="tel:…"> ON THE CRM PAGE
// (inside a user gesture) makes Chrome hand off to the OS and keeps the CRM
// visible — NO new tab. This is the exact mechanism Beast Companion's comm bridge
// already uses on the CRM page (apps/beast-companion/src/content/commLaunchBridge.ts);
// the centered CRM drag modal calls it directly since it already runs on the CRM
// document (and thus retains the click's user activation).

/** Normalize a raw phone to an E.164 tel:/sms: URL. 10 digits → +1XXXXXXXXXX.
 *  An optional `body` prefills the SMS (text only) — same handoff, just a prefilled
 *  message; ignored for tel:. */
export function dialUrl(method: "call" | "text", rawPhone: string | null | undefined, body?: string | null): string {
  const digits = String(rawPhone ?? "").replace(/\D/g, "")
  if (!digits) return ""
  const e164 =
    digits.length === 10
      ? `+1${digits}`
      : digits.length === 11 && digits.startsWith("1")
        ? `+${digits}`
        : `+${digits}`
  const base = `${method === "call" ? "tel:" : "sms:"}${e164}`
  if (method === "text" && body) return `${base}?&body=${encodeURIComponent(body)}`
  return base
}

/** Launch the external protocol from the current (CRM) document. No new tab. */
export function launchExternalProtocol(url: string): void {
  if (!url) return
  try {
    const a = document.createElement("a")
    a.href = url // NO target — same document; Chrome hands tel:/sms: to the OS
    a.rel = "noopener"
    a.style.display = "none"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } catch {
    /* best-effort external-protocol handoff */
  }
}
