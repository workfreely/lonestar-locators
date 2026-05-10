import { google } from "googleapis";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      "http://localhost:3000/api/google/callback"
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    const people = google.people({
      version: "v1",
      auth: oauth2Client,
    });

    const cityMap: Record<string, string> = {
      "San Antonio": "SATX",
      Austin: "Austin",
      Dallas: "Dallas",
      Houston: "Houston",
    };

    const cityLabel =
      cityMap[body.city] || body.city || "Lead";

    await people.people.createContact({
      requestBody: {
        names: [
          {
            givenName: body.firstName,
            familyName: `${body.lastName} (${cityLabel})`,
          },
        ],
        phoneNumbers: [
          {
            value: body.phone,
          },
        ],
      },
    });

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