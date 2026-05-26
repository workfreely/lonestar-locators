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

  const budget = searchParams.get("budget") || "Flexible";
  const beds = searchParams.get("beds") || "";
  const baths = searchParams.get("baths") || "";
  const propertyType = searchParams.get("propertyType") || "Apartment";
  const neighborhoods =
    searchParams.get("neighborhoods") || "Not specified";
  const creditScore =
    searchParams.get("creditScore") || "Not specified";
  const creditHistory =
    searchParams.get("creditHistory") || "Not specified";
    const submarkets = searchParams.get("submarkets") || "";

    const criminalBackground =
  searchParams.get("criminalBackground") || "None";

const criminalCharge =
  searchParams.get("criminalCharge") || "";

const brokenLeaseAge = searchParams.get("brokenLeaseAge") || "";
const brokenLeaseAmount = searchParams.get("brokenLeaseAmount") || "";

const evictionCourt = searchParams.get("evictionCourt") || "";
const evictionAge = searchParams.get("evictionAge") || "";
const evictionBalance = searchParams.get("evictionBalance") || "";

const felonyAge = searchParams.get("felonyAge") || "";
const felonyCharge = searchParams.get("felonyCharge") || "";

const misdemeanorAge = searchParams.get("misdemeanorAge") || "";
const misdemeanorCharge = searchParams.get("misdemeanorCharge") || "";


  // ==========================
  // CLEAN LAYOUT LOGIC
  // ==========================

  let layout = "Flexible";

  if (beds && baths) {
    const bedLabel = beds === "1" ? "Bed" : "Beds";
    const bathLabel = baths === "1" ? "Bath" : "Baths";
    layout = `${beds} ${bedLabel} / ${baths} ${bathLabel}`;
  }

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
  Thanks for reaching out about your search in <strong>${city}</strong>!
</p>

<p style="font-size:16px;line-height:1.7;color:#333;">
  I’ve received your details and I’m reviewing your budget, move timeline, and location preferences to identify the best available options right now.
</p>

<p style="font-size:16px;line-height:1.7;color:#333;font-weight:700;">
  My goal is simple: Save you time, money, and stress while securing the right home.
</p>

<p style="font-size:16px;line-height:1.7;color:#333;">
  You’ll receive a custom list within 24 hours based on current pricing and availability.
</p>

<!-- SEARCH SUMMARY -->
<div style="margin-top:32px;background:#f8f9fb;padding:24px;border-radius:10px;border:1px solid #eee;">
  <h3 style="margin:0 0 16px 0;font-size:20px;">Your Search Summary</h3>

  <div style="font-size:16px;line-height:1.8;color:#444;">
    <strong>Move Date:</strong> ${formattedMoveDate}<br/>
    <strong>Budget:</strong> ${budget}<br/>
    <strong>Layout:</strong> ${layout}<br/>
    <strong>Property Type:</strong> ${propertyType}<br/>
    <strong>Preferred Areas:</strong> ${neighborhoods}
    ${submarkets ? `<br/><strong>Nearby Areas:</strong> ${submarkets}` : ""}<br/>
    <strong>Estimated Credit Score:</strong> ${creditScore}<br/>
    <strong>Credit Background:</strong> ${creditHistory}

    ${
      creditHistory === "Broken Lease"
        ? `
        ${brokenLeaseAge ? `<br/><strong>Broken Lease Age:</strong> ${brokenLeaseAge}` : ""}
        ${brokenLeaseAmount ? `<br/><strong>Broken Lease Balance:</strong> ${brokenLeaseAmount}` : ""}
        `
        : ""
    }

    ${
      creditHistory === "Eviction"
        ? `
        ${evictionCourt ? `<br/><strong>Went to Court:</strong> ${evictionCourt}` : ""}
        ${evictionAge ? `<br/><strong>Eviction Age:</strong> ${evictionAge}` : ""}
        ${evictionBalance ? `<br/><strong>Eviction Balance:</strong> ${evictionBalance}` : ""}
        `
        : ""
    }

    ${
criminalBackground === "Felony"
        ? `
        ${felonyAge ? `<br/><strong>Felony Age:</strong> ${felonyAge}` : ""}
        ${felonyCharge ? `<br/><strong>Felony Charge:</strong> ${felonyCharge}` : ""}
        `
        : ""
    }

    ${
     criminalBackground === "Misdemeanor"
        ? `
        ${misdemeanorAge ? `<br/><strong>Misdemeanor Age:</strong> ${misdemeanorAge}` : ""}
        ${misdemeanorCharge ? `<br/><strong>Misdemeanor Charge:</strong> ${misdemeanorCharge}` : ""}
        `
        : ""
    }
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


<!-- WHAT HAPPENS NEXT -->
<div style="margin-top:40px;">
  <h3 style="margin-bottom:20px;font-size:20px;">What Happens Next?</h3>

  <div style="font-size:16px;line-height:1.8;color:#444;">

    <div style="margin-bottom:14px;">
      <span style="font-size:17px;font-weight:700;color:#111;">
        Step 1:
      </span>
      I personally review real-time pricing and availability to identify the best options for your approval profile.
    </div>

    <div style="margin-bottom:14px;">
      <span style="font-size:17px;font-weight:700;color:#111;">
        Step 2:
      </span>
      You receive a focused custom list with clear pricing and incentive details.
    </div>

    <div style="margin-bottom:14px;">
      <span style="font-size:17px;font-weight:700;color:#111;">
        Step 3:
      </span>
      We tour only the properties that make the most sense for you.
    </div>

    <div>
      <span style="font-size:17px;font-weight:700;color:#111;">
        Step 4:
      </span>
      On your application, select 
      <strong>“Realtor / Apartment Locator”</strong> under 
      <strong>“How did you hear about us”</strong>, then list 
      <strong>“Jay Morris with AptAmigo.”</strong><br/><br/>
      <strong>This keeps the service free and qualifies you for your cash rebate or free movers.</strong>
    </div>

  </div>
</div>


<!-- VIDEO SECTION --> <h3 style="margin-top:40px;margin-bottom:16px;font-size:20px;"> Watch My Apartment Process </h3> <div style="font-size:17px;line-height:1.7;color:#444;"> <a href="https://youtube.com/shorts/GjXNYiV8tHw" target="_blank" style=" color:#0b3a75; font-weight:600; text-decoration:none; display:inline-flex; align-items:center; gap:12px; "> <img src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1771299227/youtube-icon_qdqutz.png" alt="YouTube" width="20" height="20" style="display:inline-block;vertical-align:middle;" /> Watch How My Apartment Process Works </a> </div>

<div style="margin-top:30px;font-size:16px;color:#444;">
  If anything changes with your budget, location, or timeline, just reply to this email and let me know.
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
      AptAmigo Brokerage<br/>
    <br/>
    </td>
  </tr>
</table>


<div style="max-width:640px;margin:30px auto 0 auto;text-align:center;font-size:12px;color:#777;line-height:1.6;">
  © ${new Date().getFullYear()} Powered by AptAmigo Brokerage<br/>
  San Antonio | Austin | Dallas | Houston
</div>

</body>
</html>
`;

  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}
