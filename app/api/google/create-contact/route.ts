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
    // CONTACT NOTES
    // ======================================================

    const contactNotes = `
Move Date: ${body.moveDate || "N/A"}

Budget: ${body.desiredRent || "N/A"}

Property Type: ${body.propertyType || "N/A"}

Bedrooms: ${body.beds || "N/A"}
Bathrooms: ${body.baths || "N/A"}

Neighborhoods:
${body.neighborhoods || "N/A"}

Submarkets:
${body.submarkets || "N/A"}

Credit Score:
${body.creditScore || "N/A"}

Rental Background:
${body.creditHistory || "N/A"}

Broken Lease Age:
${body.brokenLeaseAge || "N/A"}

Broken Lease Amount:
${body.brokenLeaseAmount || "N/A"}

Eviction Age:
${body.evictionAge || "N/A"}

Eviction Balance:
${body.evictionBalance || "N/A"}

Criminal Background:
${body.criminalBackground || "N/A"}

Criminal Charge:
${body.criminalCharge || "N/A"}

Lead Source:
${body.source || "website"}

Notes:
${body.notes || "N/A"}
`;

    // ======================================================
    // CREATE CONTACT
    // ======================================================

    await people.people.createContact({
      requestBody: {
        names: [
          {
            givenName: body.firstName,
            familyName: `${body.lastName} (${cityLabel} • ${sourceLabel})`,
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

        biographies: [
          {
            value: contactNotes,
          },
        ],

        organizations: [
          {
            name: "Lone Star Locators",
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