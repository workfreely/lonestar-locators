/**
 * Shared display formatting for phone numbers. Mirrors the CRM's
 * lib/utils/formatPhone so Companion and the CRM show numbers identically.
 *
 * The RAW value is NEVER modified — callers keep the stored number for tel:/sms:
 * (Call/Text) and only run it through here for display/copy.
 *
 *   "5125550155" → "(512) 555-0155"
 *
 * Non-10-digit input passes through unchanged. Idempotent: a pre-formatted
 * "(512) 555-0155" returns unchanged.
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const cleaned = String(phone).replace(/\D/g, "");
  const m = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : String(phone);
}
