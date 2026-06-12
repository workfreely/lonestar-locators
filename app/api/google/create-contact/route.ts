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

    const cityLabel = cityMap[body.city] || body.city || "Lead";

    // ======================================================
    // CONTACT NOTES
    // ======================================================

    const notes = `
Source: ${body.source || "Website"}

Move Date: ${body.moveDate || "N/A"}
Budget: ${body.desiredRent || "N/A"}

Location:
Neighborhoods: ${body.neighborhoods || "N/A"}
Submarkets: ${body.submarkets || "N/A"}

Property:
Type: ${body.propertyType || "N/A"}
Beds/Baths: ${body.beds || "N/A"} / ${body.baths || "N/A"}

Credit:
Score: ${body.creditScore || "N/A"}
History: ${body.creditHistory || "N/A"}

Background:
Broken Lease: ${
  body.brokenLeaseAge
    ? `${body.brokenLeaseAge} (${body.brokenLeaseAmount || "No balance"})`
    : "None"
}

Eviction: ${
  body.evictionAge
    ? `${body.evictionAge} (${body.evictionBalance || "No balance"})`
    : body.evictionCourt ?? "None"
}

Criminal: ${
  body.criminalBackground || "None"
}
${body.criminalCharge ? `Charge: ${body.criminalCharge}` : ""}

Client Notes:
${body.notes || "None"}
`.trim();

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
    // CONTACT PAYLOAD (shared for create and update)
    // ======================================================

    const contactPayload = {
      names: [
        {
          givenName: body.firstName,
          familyName: `${body.lastName} (${cityLabel})`,
        },
      ],

      emailAddresses: body.email
        ? [{ value: body.email }]
        : [],

      phoneNumbers: formattedPhone
        ? [{ value: formattedPhone }]
        : [],

      biographies: [
        { value: notes },
      ],
    };

    // ======================================================
    // DUPLICATE PREVENTION — search by phone, update or create
    // ======================================================

    let action: "created" | "updated" = "created";

    if (formattedPhone) {
      // Warmup request required by Google People API before searching
      try {
        await people.people.searchContacts({
          query: "",
          readMask: "names",
          pageSize: 1,
        });
      } catch {
        // Warmup errors are non-fatal — continue to real search
      }

      // Search for existing contact by phone number
      const searchRes = await people.people.searchContacts({
        query: formattedPhone,
        readMask: "names,phoneNumbers,emailAddresses,biographies,metadata",
        pageSize: 5,
      });

      const results = searchRes.data.results ?? [];
      const match = results[0]?.person;

      if (match?.resourceName) {
        // Extract etag from the first source (required to avoid conflict errors)
        const etag = match.metadata?.sources?.[0]?.etag ?? undefined;

        await people.people.updateContact({
          resourceName: match.resourceName,
          updatePersonFields: "names,phoneNumbers,emailAddresses,biographies",
          requestBody: {
            ...contactPayload,
            etag,
          },
        });

        action = "updated";
        console.log(`Google Contact Updated: ${match.resourceName}`);
      } else {
        // No existing contact — create new
        await people.people.createContact({
          requestBody: contactPayload,
        });

        console.log("Google Contact Created");
      }
    } else {
      // No phone number — skip search, create directly
      await people.people.createContact({
        requestBody: contactPayload,
      });

      console.log("Google Contact Created (no phone — skipped duplicate check)");
    }

    return NextResponse.json({ success: true, action });

  } catch (err) {
    console.error("Google Contact Error:", err);

    return NextResponse.json(
      { success: false },
      { status: 500 }
    );
  }
}
