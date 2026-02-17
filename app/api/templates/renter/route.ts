import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const firstName = searchParams.get("firstName") || "there";
  const city = searchParams.get("city") || "Texas";
  const moveDate = searchParams.get("moveDate") || "Not specified";
  const budget = searchParams.get("budget") || "Flexible";
  const beds = searchParams.get("beds") || "Flexible";
  const baths = searchParams.get("baths") || "Flexible";
  const propertyType = searchParams.get("propertyType") || "Apartment";
  const neighborhoods =
    searchParams.get("neighborhoods") || "Not specified";
  const creditScore = searchParams.get("creditScore") || "Not specified";
  const creditHistory =
    searchParams.get("creditHistory") || "Not specified";

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  </head>
  <body style="margin:0; padding:40px 0; background:#f4f4f4; font-family:'Inter', sans-serif;">

    <div style="max-width:640px; margin:0 auto; background:#ffffff; padding:40px; border-radius:14px; box-shadow:0 8px 30px rgba(0,0,0,0.06);">

      <!-- Logo -->
      <div style="margin-bottom:30px;">
        <img 
          src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1747932834/lone-star-locators-logo_wn85wu.png" 
          alt="Lone Star Locators"
          style="height:50px;"
        />
      </div>

      <!-- Greeting -->
      <h2 style="font-size:26px; font-weight:700; margin:0 0 20px 0; color:#111;">
        Hi ${firstName},
      </h2>

      <p style="font-size:17px; line-height:1.7; color:#333;">
        Thanks for reaching out about your apartment search in <strong>${city}</strong>.
      </p>

      <p style="font-size:17px; line-height:1.7; color:#333;">
        I’ve received your details and I’m reviewing your budget, move in timeline, and location preferences to identify the best available options right now.
      </p>

      <p style="font-size:17px; line-height:1.7; color:#333; font-weight:700;">
        My goal is simple: Save you time, money, and stress while securing the right home.
      </p>

      <p style="font-size:17px; line-height:1.7; color:#333;">
        You’ll receive a custom list within 24 hours based on current pricing and availability.
      </p>

      <!-- SEARCH SUMMARY CARD -->
      <div style="margin-top:32px; background:#f8f9fb; padding:24px; border-radius:10px; border:1px solid #eee;">

        <h3 style="margin:0 0 15px 0; font-size:19px;">Your Search Summary</h3>

        <div style="font-size:16px; line-height:1.8; color:#444;">
          <strong>Move Date:</strong> ${moveDate}<br/>
          <strong>Budget:</strong> ${budget}<br/>
          <strong>Bedrooms:</strong> ${beds}<br/>
          <strong>Bathrooms:</strong> ${baths}<br/>
          <strong>Property Type:</strong> ${propertyType}<br/>
          <strong>Preferred Areas:</strong> ${neighborhoods}<br/>
          <strong>Estimated Credit Score:</strong> ${creditScore}<br/>
          <strong>Credit Background:</strong> ${creditHistory}
        </div>
      </div>

      <!-- WHAT HAPPENS NEXT -->
      <div style="margin-top:40px;">
        <h3 style="margin-bottom:18px; font-size:19px;">What Happens Next</h3>

        <div style="font-size:16px; line-height:1.8; color:#444;">
          <strong>Step 1:</strong> I personally review real-time pricing and availability to identify the best options for your budget and approval profile.<br/><br/>

          <strong>Step 2:</strong> You receive a focused custom list with clear pricing and incentive details.<br/><br/>

          <strong>Step 3:</strong> We tour only the properties that make the most sense for you.<br/><br/>

          <strong>Step 4:</strong> On your application:<br/>
          Select “Realtor / Apartment Locator” under “How did you hear about us”<br/>
          Then list “Jay Morris with AptAmigo.”<br/><br/>

          This keeps the service free and qualifies you for your cash rebate or free movers.
        </div>
      </div>

      <!-- FOLLOW UP -->
      <div style="margin-top:30px; font-size:16px; color:#444;">
        If anything changes with your budget, location, or timeline, just reply to this email and let me know.
      </div>

      <hr style="border:none; border-top:1px solid #eee; margin:40px 0;" />

      <!-- AGENT SECTION -->
      <div style="display:flex; align-items:center; gap:20px;">

        <img
          src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1748014964/jay-morris-free-apartment-locator-san-antonio-texas_pgf7fs.png"
          alt="Jay Morris"
          style="width:95px; height:95px; border-radius:50%; object-fit:cover;"
        />

        <div style="font-size:15px; color:#555; line-height:1.6;">
          <div style="font-size:17px; font-weight:700; color:#222;">
            Jay Morris
          </div>
          Luxury Apartment Locator<br/>
          (210) 895 5766<br/>
          jay.morris@aptamigo.com
        </div>

      </div>

    </div>

<!-- COMPLIANCE + FOOTER -->
<div style="max-width:640px; margin:30px auto 0 auto; text-align:center; font-size:13px; color:#777; line-height:1.6;">

  <div style="margin-bottom:12px;">
    <a href="https://res.cloudinary.com/dxtiguwzm/image/upload/v1749825086/IABS_Form_z9eluj.png"
       style="color:#555; text-decoration:underline; display:block; margin-bottom:6px;">
      Information About Brokerage Services
    </a>

    <a href="https://res.cloudinary.com/dxtiguwzm/image/upload/v1749825071/CPN_Form_1-5_0_jzmj2h.png"
       style="color:#555; text-decoration:underline; display:block;">
      TREC Consumer Protection Notice
    </a>
  </div>

  <div style="margin-top:16px;">
    © ${new Date().getFullYear()} Lone Star Locators™ powered by AptAmigo Brokerage<br/>
    San Antonio | Austin | Dallas | Houston
  </div>

</div>


  </body>
  </html>
  `;

  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}
