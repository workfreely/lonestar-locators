import { google } from "googleapis"

/**
 * Returns a fully authenticated Google OAuth2 client using the server-side
 * environment credentials. Works for any Google API (People, Calendar, etc.)
 * as long as the refresh token was issued with the required scopes.
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
