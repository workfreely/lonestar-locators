import { NextResponse } from "next/server";

/**
 * POST /api/sms/send-3day-followup
 *
 * Purpose:
 * - Send the Day 3 follow-up SMS
 * - Triggered by cron or scheduled job
 *
 * Status:
 * - Logic intentionally disabled until launch
 */

export async function POST(req: Request) {
  try {
    // TODO:
    // 1. Query leads where:
    //    - sms_opt_in = true
    //    - sms_welcome_sent = true
    //    - sms_followup_3d_sent = false
    //    - has_replied = false
    //    - created_at <= now() - 3 days
    //
    // 2. Send follow-up SMS
    // 3. Update sms_followup_3d_sent flags

    return NextResponse.json({
      success: true,
      message: "3-day follow-up SMS route ready",
    });
  } catch (error) {
    console.error("3-day follow-up SMS error:", error);

    return NextResponse.json(
      { success: false, error: "Failed to process 3-day follow-up SMS" },
      { status: 500 }
    );
  }
}
