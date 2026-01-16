import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    // Parse request body
    // These fields are intentionally unused until email provider is wired
    const {
      to: _to,
      subject: _subject,
      html: _html,
    } = await req.json();

    /**
     * 🔔 LAUNCH NOTE:
     * Email sending logic (SendGrid / Resend / SES) will be added here.
     * Variables are prefixed with "_" to avoid ESLint errors pre-launch.
     */

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Send email error:", error);

    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
