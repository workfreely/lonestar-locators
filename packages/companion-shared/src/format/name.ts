/**
 * Shared display formatting for person names. The stored value is NEVER modified
 * — this only changes how a name is shown. Mirrors the CRM's `normalizeName`
 * (components/crm/LeadPanel.tsx) so Companion and the CRM title-case identically.
 *
 *   "marcus reed" → "Marcus Reed"
 *   "JORDAN"      → "Jordan"
 *
 * Idempotent: an already-formatted name returns unchanged. Multi-word names are
 * capitalized per space-separated word (matching the CRM convention exactly).
 */
export function formatPersonName(name: string | null | undefined): string {
  if (!name) return "";
  return String(name)
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
