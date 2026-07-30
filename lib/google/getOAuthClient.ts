import { google } from "googleapis"

// ⚠️ LEGACY / TEMPORARY — single global Google account (one shared
// GOOGLE_REFRESH_TOKEN env var). This predates multi-tenancy: every CRM Google
// side-effect (calendar events, contacts, follow-ups) currently acts as ONE
// Google account, not the signed-in user's.
//
// The per-user replacement already exists: onboarding stores each user's
// refresh token in the `google_credentials` table (see /api/google/auth +
// /api/google/callback). Nothing consumes those per-user tokens yet.
//
// TODO(phase-2): migrate ALL callers of getOAuthClient() to a per-user client
// — e.g. getOAuthClientForUser(userId) that reads google_credentials — and
// delete this global path plus GOOGLE_REFRESH_TOKEN. Callers to migrate:
//   - app/api/admin/leads/update-stage/route.ts   (contacts + calendar sync)
//   - app/api/google/create-contact/route.ts
//   - lib/google/createCalendarEvent.ts
//   - lib/google/updateContactNotes.ts
//   - lib/google/syncFollowUpEvent.ts
//
// 🚫 DO NOT add new Google functionality on top of this global token. New
// features must use the per-user google_credentials path from the start.

/**
 * Returns a fully authenticated Google OAuth2 client using the server-side
 * environment credentials. Works for any Google API (People, Calendar, etc.)
 * as long as the refresh token was issued with the required scopes.
 *
 * LEGACY: acts as the single global GOOGLE_REFRESH_TOKEN account. See the
 * file-level note above — phase 2 replaces this with per-user credentials.
 */
export function getOAuthClient() {
  console.log("🔐 Google OAuth client initialized")
  console.log("🔐 [oauth] GOOGLE_CLIENT_ID present:", !!process.env.GOOGLE_CLIENT_ID)
  console.log("🔐 [oauth] GOOGLE_CLIENT_SECRET present:", !!process.env.GOOGLE_CLIENT_SECRET)
  console.log("🔐 [oauth] GOOGLE_REFRESH_TOKEN present:", !!process.env.GOOGLE_REFRESH_TOKEN)
  console.log("🔐 [oauth] NEXT_PUBLIC_SITE_URL:", process.env.NEXT_PUBLIC_SITE_URL)

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_SITE_URL}/api/google/callback`
  )

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  })

  return oauth2Client
}
