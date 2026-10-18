// The one name for the comments permission.
//
// Declared separately from lib/social/instagram.ts so the store and the gate can import it without
// pulling in the OAuth module — and so the string is written once. A typo in a duplicated scope
// name would make permissionsOk permanently false, and the feature would sit silently inert with
// no error to find.
export const INSTAGRAM_COMMENTS_SCOPE = "instagram_business_manage_comments"
