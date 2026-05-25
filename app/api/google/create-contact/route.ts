import { google } from "googleapis";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_SITE_URL}/api/google/callback`
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    const people = google.people({
      version: "v1",
      auth: oauth2Client,
    });

    // ======================================================
    // CITY LABELS
    // ======================================================

    const cityMap: Record<string, string> = {
  "San Antonio": "SATX",
  Austin: "AUS",
  Dallas: "DAL",
  Houston: "HOU",
};
    const cityLabel =
      cityMap[body.city] || body.city || "Lead";

    // ======================================================
    // SOURCE LABELS
    // ======================================================

    const sourceMap: Record<string, string> = {
      facebook: "FB",
      instagram: "IG",
      tiktok: "TT",
      youtube: "YT",
      website: "WEB",
    };

    const sourceLabel =
      sourceMap[body.source] || body.source || "WEB";

    // ======================================================
    // CLEAN PHONE NUMBER
    // ======================================================

    const cleanedPhone = body.phone
      ?.replace(/\D/g, "")
      ?.replace(/^1/, "");

    const formattedPhone = cleanedPhone
      ? `+1${cleanedPhone}`
      : "";


    // ======================================================
    // CREATE CONTACT
    // ======================================================

    await people.people.createContact({
      requestBody: {
       names: [
  {
    givenName: body.firstName,
    familyName: `${body.lastName} (${cityLabel} - ${sourceLabel})`,
  },
],

        emailAddresses: body.email
          ? [
              {
                value: body.email,
              },
            ]
          : [],

        phoneNumbers: formattedPhone
          ? [
              {
                value: formattedPhone,
              },
            ]
          : [],

       
      },
    });

console.log("Google Contact Created");

    return NextResponse.json({
      success: true,
    });
  } catch (err) {
    console.error("Google Contact Error:", err);

    return NextResponse.json(
      {
        success: false,
      },
      {
        status: 500,
      }
    );
  }
}