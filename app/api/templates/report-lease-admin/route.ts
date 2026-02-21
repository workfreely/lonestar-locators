import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const firstName = searchParams.get("firstName") ?? "";
  const lastName = searchParams.get("lastName") ?? "";
  const email = searchParams.get("email") ?? "";
  const phone = searchParams.get("phone") ?? "";
  const city = searchParams.get("city") ?? "";
  const propertyName = searchParams.get("propertyName") ?? "";
  const unitNumber = searchParams.get("unitNumber") ?? "";
  const leaseTerm = searchParams.get("leaseTerm") ?? "";
  const baseRent = searchParams.get("baseRent") ?? "";
  const moveInDate = searchParams.get("moveInDate") ?? "";
  const incentive = searchParams.get("incentive") ?? "";
  const notes = searchParams.get("notes") ?? "";
  const listedJay = searchParams.get("listedJay") ?? "false";

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
</head>

<body style="margin:0;padding:40px 0;background:#f4f4f4;font-family:'Inter',sans-serif;">

<div style="max-width:640px;margin:0 auto;background:#ffffff;padding:40px;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,0.06);">

<h2 style="font-size:24px;font-weight:700;margin:0 0 20px 0;color:#111;">
  New Lease Report Submitted
</h2>

<p><strong>Name:</strong> ${firstName} ${lastName}</p>
<p><strong>Email:</strong> ${email}</p>
<p><strong>Phone:</strong> ${phone}</p>
<p><strong>City:</strong> ${city}</p>
<p><strong>Property:</strong> ${propertyName}</p>
<p><strong>Unit:</strong> ${unitNumber}</p>
<p><strong>Lease Term:</strong> ${leaseTerm}</p>
<p><strong>Base Rent:</strong> $${baseRent}</p>
<p><strong>Move In:</strong> ${moveInDate}</p>
<p><strong>Incentive:</strong> ${incentive}</p>
<p><strong>Listed Jay Morris:</strong> ${listedJay}</p>
<p><strong>Notes:</strong> ${notes || "None"}</p>

</div>
</body>
</html>
`;

  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}