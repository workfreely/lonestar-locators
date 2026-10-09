// SOCIAL-MEDIA BUCKET — WHAT EACH KEY SHAPE MEANS, AND WHICH ONES ARE DESTRUCTIBLE.
//
// One bucket holds things with completely different value, and the only thing distinguishing them
// is the key. Encoding that distinction in ONE place is what lets both the database (a restrictive
// RLS policy on storage.objects) and the application agree on what "a source video" is.
//
//   {owner}/{contentId}/source.EXT        ORIGINAL MASTER — irreplaceable. Reused indefinitely for
//                                         new templates, overlays, pricing, narration and later
//                                         AI-presenter versions, so it outlives every post built
//                                         from it. 76 of these exist.
//   {owner}/{contentId}/renders/{post}-N  rendered output — DISPOSABLE, regenerable from the master.
//   {owner}/{contentId}/takes/{ts}.EXT    replacement footage for one post (Replace Video).
//   {owner}/{contentId}/covers/…          reel cover image.
//   {owner}/voice/{id}.mp3                voice clip (hook / CTA).
//
// The master is identified BY ITS FILENAME, not by its depth. `storage.filename(name) like 'source.%'`
// is the exact predicate the RLS policy uses; isSourceObjectPath is its TypeScript twin. Matching on
// the filename rather than the three-segment path means a source written at an unexpected depth is
// still protected — the protection should not depend on a path convention staying true.
export const SOURCE_FILENAME_PREFIX = "source."

/** The leaf filename of a storage key (everything after the last slash). */
export function storageFilename(path: string): string {
  const i = path.lastIndexOf("/")
  return i < 0 ? path : path.slice(i + 1)
}

/**
 * Is this key an ORIGINAL MASTER?
 *
 * Mirrors the SQL predicate in 20261009000003_protect_source_storage_objects.sql exactly:
 *   storage.filename(name) like 'source.%'
 * Keep the two in step — a divergence means the app believes it may delete something the database
 * refuses, or worse, the reverse.
 */
export function isSourceObjectPath(path: string | null | undefined): boolean {
  if (!path) return false
  return storageFilename(path).startsWith(SOURCE_FILENAME_PREFIX)
}

/**
 * GUARD FOR EVERY DISPOSABLE-FILE CLEANUP PATH.
 *
 * Rendered-file cleanup and source deletion must never be the same operation. Cleanup runs over
 * lists of keys, often in bulk, often from a query — exactly the shape of thing that one day
 * includes a key it should not. Calling this first turns that from data loss into an exception.
 *
 * Deliberately throws rather than filtering: a cleanup routine that silently skipped a master would
 * hide the fact that it was ever asked to delete one.
 */
export function assertDisposablePath(path: string): string {
  if (isSourceObjectPath(path)) {
    throw new Error(
      `Refusing to delete ${path}: this is an ORIGINAL SOURCE VIDEO, not a disposable artifact. ` +
        `Source deletion goes through DELETE /api/admin/social-autopilot/content/:id, which checks ` +
        `dependent posts and requires explicit confirmation.`,
    )
  }
  return path
}

/** Bulk form of assertDisposablePath — all-or-nothing, so a mixed list deletes none of it. */
export function assertAllDisposable(paths: readonly string[]): readonly string[] {
  const masters = paths.filter(isSourceObjectPath)
  if (masters.length > 0) {
    throw new Error(
      `Refusing to delete ${masters.length} ORIGINAL SOURCE VIDEO(S) in a cleanup batch: ${masters.join(", ")}. ` +
        `No files were removed.`,
    )
  }
  return paths
}
