// WHICH FILE IS THIS POST'S FOOTAGE — one rule, in one place.
//
// social_content carries both the property facts and a source video. A post that needs different
// footage for the same property (a retake, a trim) sets social_posts.source_storage_path on ITSELF
// rather than forcing a second content row, which would be a second independently-editable copy of
// the property data. Two such pairs already exist in this database and have drifted to different
// prices.
//
// Resolution is "override ?? content", never a merge: the override is the whole answer when
// present, so a post is played and rendered from exactly one file.
//
// THIS LIVES ON ITS OWN because it was previously only inside renderPost.ts, next to ffmpeg. The
// renderer applied it and the editor's GET route did not — it signed the CONTENT path
// unconditionally — so a replaced video rendered correctly and played back as the original. The
// rule was right; only one of the two callers knew about it.

/** The post's own footage when it has any, otherwise the property's. Null when neither exists. */
export function resolveSourcePath(
  overridePath: string | null | undefined,
  contentPath: string | null | undefined,
): string | null {
  const o = (overridePath ?? "").trim()
  if (o) return o
  const c = (contentPath ?? "").trim()
  return c || null
}
