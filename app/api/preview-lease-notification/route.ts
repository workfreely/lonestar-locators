import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const clean = (value: string) =>
    value.replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();

  const firstName = clean(searchParams.get("firstName") || "Patrick");
  const lastName = clean(searchParams.get("lastName") || "Swayze");
  const city = clean(searchParams.get("city") || "Houston");
  const propertyName = clean(searchParams.get("propertyName") || "Skyline Heights");
  const leaseTerm = clean(searchParams.get("leaseTerm") || "12");
  const baseRent = clean(searchParams.get("baseRent") || "2500");
  const moveDate = clean(searchParams.get("moveDate") || "06/01/2026");
  const incentive = clean(searchParams.get("incentive") || "cash");

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
</head>

<body style="margin:0;padding:40px 0;background:#f4f4f4;font-family:'Inter',sans-serif;">

<div style="max-width:640px;margin:0 auto;background:#ffffff;padding:40px;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,0.06);">

<div style="margin-bottom:24px;">
  <img 
    src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1747932834/lone-star-locators-logo_wn85wu.png" 
    alt="Lone Star Locators"
    style="height:50px;width:auto;display:block;"
  />
</div>

<div style="height:1px;width:100%;background:#e6e6e6;margin:0 0 32px 0;"></div>

<h2 style="font-size:22px;font-weight:800;margin:0 0 20px 0;color:#111;">
  New Lease Report: ${firstName} ${lastName} (${city})
</h2>

<div style="margin-top:20px;background:#f8f9fb;padding:24px;border-radius:10px;border:1px solid #eee;">
  <h3 style="margin:0 0 16px 0;font-size:18px;">Lease Summary</h3>

  <div style="font-size:15px;line-height:1.8;color:#444;">
    <strong>Property:</strong> ${propertyName}<br/>
    <strong>City:</strong> ${city}<br/>
    <strong>Base Rent:</strong> $${baseRent}<br/>
    <strong>Lease Term:</strong> ${leaseTerm} months<br/>
    <strong>Move-In Date:</strong> ${moveDate}<br/>
    <strong>Incentive Selected:</strong> ${
      incentive === "cash"
        ? "Cash Rebate"
        : incentive === "movers"
        ? "2 Hours Free Movers"
        : "Not Specified"
    }
  </div>
</div>

<hr style="border:none;border-top:1px solid #eee;margin:40px 0;" />

<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
  <tr>
    <td width="110" valign="top">
      <img
        src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1748014964/jay-morris-free-apartment-locator-san-antonio-texas_pgf7fs.png"
        alt="Jay Morris"
        width="90"
        height="90"
        style="border-radius:50%;display:block;"
      />
    </td>

    <td valign="top" style="font-size:14px;color:#555;line-height:1.6;">
      <div style="font-size:16px;font-weight:700;color:#222;">
        Jay Morris
      </div>
      Luxury Apartment Locator<br/>
      Lone Star Locators<br/>
      (210) 895-5766<br/>
      jay@lonestarlocators.app
    </td>
  </tr>
</table>

</div>

<div style="max-width:640px;margin:30px auto 0 auto;text-align:center;font-size:12px;color:#777;line-height:1.6;">
  © ${new Date().getFullYear()} Lone Star Locators™ powered by AptAmigo Brokerage<br/>
  San Antonio | Austin | Dallas | Houston
</div>

</body>
</html>
`;

  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}
