import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // ==========================
  // SAFE PARAM HANDLING
  // ==========================

  const firstName =
    searchParams.get("firstName")?.trim() || "there";

  const cityRaw = searchParams.get("city");
  const city =
    cityRaw && cityRaw.trim().length > 1
      ? cityRaw.trim()
      : "Texas";

  const rawMoveDate = searchParams.get("moveDate");

  const formattedMoveDate =
    rawMoveDate && !isNaN(new Date(rawMoveDate).getTime())
      ? new Date(rawMoveDate).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "Not specified";

  const timeline = searchParams.get("timeline") || "Not specified";
  const desiredPayment = searchParams.get("desiredPayment") || "Flexible";
  const loanType = searchParams.get("loanType") || "Not specified";
  const firstTimeBuyer = searchParams.get("firstTimeBuyer") || "Not specified";
  const creditScore = searchParams.get("creditScore") || "Not specified";
  const downPayment = searchParams.get("downPayment") || "Not specified";
  const preApproved = searchParams.get("preApproved") || "Not specified";

  // ==========================
  // NOTES (SAFE RENDER)
  // ==========================

  const notesRaw = searchParams.get("notes") || "";

  const notes = notesRaw
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim();

  // ==========================
  // EMAIL TEMPLATE
  // ==========================

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
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

<h2 style="font-size:24px;font-weight:700;margin:0 0 20px 0;color:#111;">
  Hi ${firstName},
</h2>

<p style="font-size:16px;line-height:1.7;color:#333;">
  Thanks for reaching out about purchasing a new home in <strong>${city}</strong>!
</p>

<p style="font-size:16px;line-height:1.7;color:#333;">
  My role is to protect your interests, your investment, and your long-term equity from start to finish.
</p>

<!-- NEW HOME SUMMARY -->
<div style="margin-top:32px;background:#f8f9fb;padding:24px;border-radius:10px;border:1px solid #eee;">
  <h3 style="margin:0 0 16px 0;font-size:20px;">
    Your Purchase Summary
  </h3>

  <div style="font-size:16px;line-height:1.8;color:#444;">
    <strong>Timeline:</strong> ${timeline}<br/>
    <strong>Preferred Move Date:</strong> ${formattedMoveDate}<br/>
    <strong>Desired Monthly Payment:</strong> ${desiredPayment}<br/>
    <strong>Pre-Approved:</strong> ${preApproved}<br/>
    <strong>Loan Type:</strong> ${loanType}<br/>
    <strong>First-Time Buyer:</strong> ${firstTimeBuyer}<br/>
    <strong>Estimated Credit Score:</strong> ${creditScore}<br/>
    <strong>Estimated Down Payment:</strong> ${downPayment}

    ${
      notes.length > 5
        ? `
        <br/><br/>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid #e6e6e6;">
          <strong>Additional Notes:</strong><br/>
          <span style="color:#555;">
            ${notes}
          </span>
        </div>
        `
        : ""
    }
  </div>
</div>

<!-- HOW I PROTECT YOUR INVESTMENT -->
<div style="margin-top:40px;">
  <h3 style="margin-bottom:18px; font-size:19px;">
    How I Protect Your Investment
  </h3>

<div style="font-size:16px; line-height:1.9; color:#444;">
  <div style="margin-bottom:12px;">
    <span style="color:#1a7f37;font-weight:700;">✅</span>
    Identify builder incentives, rate buydowns, and closing cost credits that protect your bottom line.
  </div>

  <div style="margin-bottom:12px;">
    <span style="color:#1a7f37;font-weight:700;">✅</span>
    Help you qualify for first-time homebuyer programs and financing options that reduce long-term costs.
  </div>

  <div style="margin-bottom:12px;">
    <span style="color:#1a7f37;font-weight:700;">✅</span>
    Review contracts, upgrade pricing, and build timelines so you avoid costly surprises.
  </div>

  <div>
    <span style="color:#1a7f37;font-weight:700;">✅</span>
    Negotiate strategically to protect your equity from day one.
  </div>
</div>

<!-- WHAT HAPPENS NEXT -->
<div style="margin-top:40px;">
  <h3 style="margin-bottom:20px;font-size:20px;">
    What Happens Next?
  </h3>

  <div style="font-size:16px;line-height:1.8;color:#444;">

    <div style="margin-bottom:14px;">
      <span style="font-size:17px;font-weight:700;color:#111;">
        Step 1:
      </span>
      We schedule a quick 10–15 minute strategy call to clarify your goals, timeline, and financing.
    </div>

    <div style="margin-bottom:14px;">
      <span style="font-size:17px;font-weight:700;color:#111;">
        Step 2:
      </span>
      I review current builder inventory, incentives, and financing programs that align with your budget.
    </div>

    <div style="margin-bottom:14px;">
      <span style="font-size:17px;font-weight:700;color:#111;">
        Step 3:
      </span>
      You receive a focused recommendation list before visiting any model homes.
    </div>

    <div>
      <span style="font-size:17px;font-weight:700;color:#111;">
        Step 4:
      </span>
      We move forward with representation that protects your interests from contract to closing.
    </div>

  </div>
</div>

<div style="margin-top:30px;font-size:16px;color:#444;">
  If anything changes with your timeline, financing, or goals, simply reply and let me know.
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

      Licensed Real Estate Agent<br/>
      Lone Star Locators<br/>
      (210) 895-5766<br/>
      jay@lonestarlocators.app
    </td>
  </tr>
</table>

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
