import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const firstName =
    searchParams.get("firstName")?.trim() || "there";

  const incentive =
    searchParams.get("incentive")?.trim();

  const propertyName =
    searchParams.get("propertyName")?.trim() || "your property";

  const moveInDate =
    searchParams.get("moveInDate")?.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
</head>

<body style="margin:0;padding:40px 0;background:#f4f4f4;font-family:'Inter',sans-serif;">

<div style="max-width:640px;margin:0 auto;background:#ffffff;padding:40px;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,0.06);">

<!-- Logo -->
<div style="margin-bottom:24px;">
  <img 
    src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1747932834/lone-star-locators-logo_wn85wu.png" 
    alt="Lone Star Locators"
    style="height:50px;width:auto;display:block;"
  />
</div>

<div style="height:1px;width:100%;background:#e6e6e6;margin:0 0 32px 0;"></div>

<h2 style="font-size:24px;font-weight:800;margin:0 0 20px 0;color:#111;">
  Lease Reported Successfully${firstName ? `, ${firstName}` : ""}!
</h2>

${
  incentive === "cash"
    ? `
<p style="font-size:16px;line-height:1.7;color:#333;">
  You selected a <strong>cash rebate</strong> for <strong>${propertyName}!</strong>
</p>

<p style="font-size:16px;line-height:1.7;color:#333;">
  Your rebate will be processed and issued via text within <strong>90 days of your move-in date.</strong>
</p>
`
    : ""
}

${
  incentive === "movers"
    ? `
<p style="font-size:16px;line-height:1.7;color:#333;">
  You selected <strong>2 Hours Free Movers</strong> for <strong>${propertyName}!</strong>
</p>

${
  moveInDate
    ? `
<p style="font-size:16px;line-height:1.7;color:#333;">
  Your move-in date is <strong>${moveInDate}</strong>.
</p>
`
    : ""
}

<p style="font-size:16px;line-height:1.7;color:#333;">
  Once your lease is verified, we'll introduce you to the moving company and help get everything scheduled.
</p>
`
    : ""
}

<p style="font-size:16px;line-height:1.7;color:#333;margin-top:16px;">
  Please allow time for verification with the apartment community. We'll be in touch as soon as it is confirmed.
</p>

<p style="font-size:16px;line-height:1.7;color:#333;font-weight:600;margin-top:16px;">
  Congrats again on your new home!
</p>

<hr style="border:none;border-top:1px solid #eee;margin:40px 0;" />

<div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
  <img
    src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1748014964/jay-morris-free-apartment-locator-san-antonio-texas_pgf7fs.png"
    alt="Jay Morris"
    width="90"
    height="90"
    style="border-radius:50%;object-fit:cover;"
  />
  <div style="font-size:14px;color:#555;line-height:1.6;">
    <div style="font-size:16px;font-weight:700;color:#222;">
      Jay Morris
    </div>
    Luxury Apartment Locator<br/>
    (210) 895-5766<br/>
    jay@lonestarlocators.app
  </div>
</div>

</div>

<div style="max-width:640px;margin:30px auto 0 auto;text-align:center;font-size:12px;color:#777;line-height:1.6;">
  © ${new Date().getFullYear()} Lone Star Locators™<br/>
  San Antonio | Austin | Dallas | Houston
</div>

</body>
</html>
`;

  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}
