import { NextResponse } from "next/server";

/**
 * POST /api/sms/send-welcome
 *
 * Purpose:
 * - Send the initial welcome SMS
 * - Triggered after a lead submits the form
 *
 * Status:
 * - SMS sending logic will be added later
 * - Safe placeholder for now
 */

export async function POST(_req: Request) {
  try {
    // 🔒 Parse request body (future use)
    const _body = await _req.json();

    /**
     * 🔔 LAUNCH NOTE:
     * SMS sending logic (Twilio) will be added here.
     * Variables are prefixed with "_" to avoid ESLint errors pre-launch.
     *
     * TODO:
     * 1. Validate lead exists
     * 2. Check sms_opt_in = true
     * 3. Check sms_welcome_sent = false
     * 4. Send SMS via Twilio
     * 5. Update Supabase flags
     */

    return NextResponse.json({
      success: true,
      message: "Welcome SMS route ready",
    });
  } catch (error) {
    console.error("Welcome SMS error:", error);

    return NextResponse.json(
      { success: false, error: "Failed to process welcome SMS" },
      { status: 500 }
    );
  }
}
