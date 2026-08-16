/**
 * Display a saved unit number with a leading "#", for READ-ONLY invoice displays
 * only. Never doubles an existing "#": "3456" → "#3456", "#3456" → "#3456". The
 * stored leads.invoice_unit_number stays the raw value — the "#" is presentation
 * only (mirrors the money/percent display formatting). Blank stays blank.
 */
export function formatUnitDisplay(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (s === "") return "";
  return s.startsWith("#") ? s : `#${s}`;
}
