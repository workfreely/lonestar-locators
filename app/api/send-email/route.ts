export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { resend, resendConfigured } from "@/lib/resend/client";

export async function POST(req: Request) {
  try {
    const { to, subject, html } = await req.json();

    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!resendConfigured) {
      return NextResponse.json(
        { error: "Email service is not configured (RESEND_API_KEY missing)." },
        { status: 503 }
      );
    }

    const { data, error } = await resend.emails.send({
      from: "Jay Morris <jay@lonestarlocators.app>",
      to,
      subject,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json(
        { error: "Email provider error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Send email route error:", error);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
