/**
 * Non-binding preview of the public Smart Form slug.
 *
 * MIRRORS the database's slugify() character-for-character so the agent sees,
 * while typing, what their link will almost certainly be — but it deliberately
 * writes nothing. The authoritative slug is produced exactly once, by
 * ensure_workspace_slug(), when Step 1 is submitted; that function is
 * permanent-once and appends -2/-3 on collision. So this preview is optimistic:
 * if the name is already taken, the finalized slug carries a suffix and the UI
 * replaces the preview with the real returned value at that point.
 *
 * This is a display helper, not a second slug system — the database remains the
 * only thing that decides a real slug.
 *
 * Deliberately does NOT strip accents. The SQL is:
 *   trim('-' from regexp_replace(
 *          regexp_replace(lower(input), '[^a-z0-9]+', '-', 'g'),
 *          '-{2,}', '-', 'g'))
 * so an accented character is NOT folded to its ASCII base — it is a non-matching
 * character and becomes a dash ("José Ruiz" → "jos-ruiz"). Normalising here would
 * show "jose-ruiz" and then silently disagree with the finalized slug.
 */
export function slugPreview(first: string, last: string): string | null {
  const base = `${first ?? ""} ${last ?? ""}`.trim();
  if (!base) return null;
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || null;
}
