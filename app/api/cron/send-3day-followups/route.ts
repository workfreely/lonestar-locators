import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // 72–96 hour window
  const threeDaysAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000);
  const fourDaysAgo = new Date(now.getTime() - 96 * 60 * 60 * 1000);

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, first_name, phone")
    .eq("sms_opt_in", true)
    .eq("sms_replied", false) // 🔥 THIS IS THE KEY
    .is("day3_sent_at", null)
    .gte("created_at", fourDaysAgo.toISOString())
    .lte("created_at", threeDaysAgo.toISOString());

  if (error) {
    console.error("Error fetching 3-day leads:", error);
    return NextResponse.json({ error }, { status: 500 });
  }

  console.log(`Found ${leads.length} leads for 3-day follow-up`);

  // Later: send SMS here, then mark day3_sent_at
  // For now: just verify detection works

  return NextResponse.json({
    success: true,
    count: leads.length,
  });
}
