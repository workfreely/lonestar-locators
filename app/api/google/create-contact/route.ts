import { google } from "googleapis";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildContactNotes } from "@/lib/google/buildContactNotes";
import { getOAuthClient } from "@/lib/google/getOAuthClient";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const oauth2Client = getOAuthClient();

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

    const notes = buildContactNotes({
      crm_status: body.crm_status,
      next_follow_up: body.next_follow_up,
      follow_up_count: body.follow_up_count,
      source: body.source,
      moveDate: body.moveDate,
      desiredRent: body.desiredRent,
      neighborhoods: body.neighborhoods,
      submarkets: body.submarkets,
      propertyType: body.propertyType,
      beds: body.beds,
      baths: body.baths,
      creditScore: body.creditScore,
      creditHistory: body.creditHistory,
      brokenLeaseAge: body.brokenLeaseAge,
      brokenLeaseAmount: body.brokenLeaseAmount,
      evictionAge: body.evictionAge,
      evictionBalance: body.evictionBalance,
      evictionCourt: body.evictionCourt,
      criminalBackground: body.criminalBackground,
      criminalCharge: body.criminalCharge,
      notes: body.notes,
    });

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

    const result = await people.people.createContact({
      requestBody: {
        names: [
          {
            givenName: body.firstName,
            familyName: `${body.lastName} (${cityLabel})`,
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
            value: notes,
          },
        ],
      },
    });

    const resourceName = result.data.resourceName;

    console.log("Google Contact Created:", resourceName);

    // ======================================================
    // DEBUG GOOGLE CONTACT ID WRITEBACK
    // ======================================================

    console.log(
      "🔍 [create-contact] body.leadId:",
      body.leadId,
      "(type:",
      typeof body.leadId,
      ")"
    );

    console.log(
      "🔍 [create-contact] resourceName:",
      resourceName,
      "(type:",
      typeof resourceName,
      ")"
    );

    // ======================================================
    // SAVE GOOGLE CONTACT ID BACK TO SUPABASE
    // ======================================================

    if (body.leadId && resourceName) {
      const { error: updateError } = await supabaseAdmin
        .from("leads")
        .update({
          google_contact_id: resourceName,
        })
        .eq("id", body.leadId);

      if (updateError) {
        console.warn(
          "Failed to save google_contact_id to lead:",
          updateError.message
        );
      } else {
        console.log(
          `Saved google_contact_id to lead ${body.leadId}:`,
          resourceName
        );
      }
    }

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