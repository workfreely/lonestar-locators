import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const formData = await req.formData();

  const from = formData.get("From") as string;
  const body = formData.get("Body") as string;

  if (!from || !body) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { headers: { "Content-Type": "text/xml" } }
    );
  }

  // Normalize phone number
  const phone = from.replace(/\D/g, "").replace(/^1/, "");

  await supabase
    .from("leads")
    .update({
      sms_replied: true,
      sms_replied_at: new Date().toISOString(),
    })
    .eq("phone", phone)
    .eq("sms_opt_in", true)
    .eq("sms_replied", false);

  // Twilio requires a valid XML response
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    { headers: { "Content-Type": "text/xml" } }
  );
}
