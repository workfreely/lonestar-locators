import { google } from "googleapis";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const code = searchParams.get("code");

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "http://localhost:3000/api/google/callback"
  );

  const { tokens } = await oauth2Client.getToken(code || "");

  console.log("REFRESH TOKEN:", tokens.refresh_token);

  return NextResponse.json({
    success: true,
    refresh_token: tokens.refresh_token,
  });
}