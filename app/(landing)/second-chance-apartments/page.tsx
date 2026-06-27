"use client";

import { Suspense } from "react";
import LandingForm from "@/app/components/LandingForm";
import LandingWrapper from "@/app/components/LandingWrapper";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export default function GetYourListPage() {
  return (
    <LandingWrapper>
      <div
        className={`${inter.className} !pb-0 md:!pb-8`}
        style={{
          padding: "0 0 2rem",
          maxWidth: "640px",
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
          overflowX: "hidden",
        }}
      >
        {/* ================= HEADER ================= */}
        <h1
  style={{
    fontSize: "clamp(1.55rem, 4.5vw, 2.4rem)",
    fontWeight: 800,
    textAlign: "center",
    marginTop: "-0.75rem",
    marginBottom: "1.3rem",
    color: "#111",
    lineHeight: 1.0,
    letterSpacing: "-1.5px",
  }}
>
  <div>
  <div>Stop Wasting Time</div>

  <div>
    Searching for Apartments
  </div>
</div>
</h1>
{/* PROFILE IMAGE */}
<div
  style={{
    textAlign: "center",
    marginBottom: "1rem",
  }}
>
  <img
    src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1748014964/jay-morris-free-apartment-locator-san-antonio-texas_pgf7fs.png"
    alt="Jay Morris"
    style={{
      width: "82px",
      height: "82px",
      borderRadius: "50%",
      objectFit: "cover",
      border: "2px solid #f0f0f0",
      display: "block",
      margin: "0 auto",
      boxShadow: "0 4px 12px rgba(0,0,0,0.10)",
    }}
  />
</div>

        <p
  style={{
    textAlign: "center",
    marginBottom: "0.35rem",
    color: "#555",
    lineHeight: 1.4,
    fontSize: "1.05rem",
  }}
>
  Find <strong>2nd chance apts</strong> that work for you
</p>

        <p
          style={{
            textAlign: "center",
            fontSize: "0.95rem",
            color: "#555",
            marginBottom: "0.5rem",
            fontWeight: "600",
          }}
        >
        Bad Credit • No Credit • Broken Lease 
        </p>

       <div
  style={{
    background: "#dbeafe",
    border: "1px solid #bfdbfe",
    color: "#1e40af",
    borderRadius: "999px",

padding: "10px 12px",

    marginTop: "0.75rem",
    marginBottom: "0.9rem",

    fontWeight: 600,
    fontSize: "0.76rem",
    lineHeight: 1.4,

    textAlign: "center",

    // ✅ makes pill fit content instead of stretching
    width: "fit-content",

    // ✅ centers the pill
    marginLeft: "auto",
    marginRight: "auto",
  }}
>
  Up to 10 weeks free • cash rebate • free movers
</div>

        <p
          style={{
            textAlign: "center",
            fontSize: "0.85rem",
            color: "#777",
            marginBottom: "1rem",
          }}
        >
          Takes less than 60 seconds
          <br />
          <span style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}>Real client success stories below ⭐⭐⭐⭐⭐</span>
        </p>

        {/* ================= FORM ================= */}
        <Suspense fallback={null}>
          <LandingForm mode="full" />
        </Suspense>

        {/* ================= TESTIMONIALS ================= */}
        <div style={{ marginTop: "2rem", textAlign: "center" }}>
          <h3
  className="!mb-4 md:!mb-0"
  style={{
    marginBottom: "1.9rem",
    fontSize: "clamp(1.5rem, 3vw, 1.8rem)",
    fontWeight: 800,
    color: "#111",
    lineHeight: 1.15,
    letterSpacing: "-0.5px",
  }}
>
 <div
  style={{
    textAlign: "center",
    fontWeight: 800,
    lineHeight: 1.05,
  }}
>
  <div>Helping renters get approved</div>

  <div style={{ marginTop: "0.15rem" }}>
    👇
  </div>
</div>
</h3>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1.5rem",
            }}
          >
            {/* ERIC */}
            <div style={reviewWrapper}>
              <img src="/reviews/eric.png" style={imgStyle} />
            </div>

            {/* TIFFANY */}
            <div style={reviewWrapper}>
              <img src="/reviews/tiffany.png" style={imgStyle} />
            </div>

            {/* STEPHANIE */}
            <div style={reviewWrapper}>
              <img src="/reviews/stephanie.png" style={imgStyle} />
            </div>

            {/* HALEY */}
            <div style={reviewWrapper}>
              <img src="/reviews/haley.png" style={imgStyle} />
            </div>

            {/* KRIS */}
            <div style={reviewWrapper}>
              <img src="/reviews/kris.png" style={imgStyle} />
            </div>
          </div>
        </div>

       {/* ================= COMPLIANCE FOOTER ================= */}
               <div
                 style={{
                   marginTop: "2.5rem",
                   paddingTop: "1.25rem",
                   borderTop: "1px solid #e5e5e5",
                   textAlign: "center",
                 }}
               >
                 <div
         style={{
                     fontSize: "0.82rem",
                     color: "#777",
                     lineHeight: 1.5,
                     marginBottom: "0.75rem",
                   }}
                 >
                Apartment Locating powered by AptAmigo
       
       <div
         style={{
           display: "flex",
           flexWrap: "wrap",
           justifyContent: "center",
           gap: "4px",
           marginTop: "0.35rem",
         }}
       >
         <span>Jay Morris</span>
         <span>|</span>
         <span>Licensed Real Estate Agent</span>
         <span>|</span>
         <span>Equal Housing Opportunity</span>
       </div>
                 </div>
       
                 {/* TREC LINKS */}
                 <div
                   style={{
                     display: "flex",
                     justifyContent: "center",
                     flexWrap: "wrap",
                     gap: "0.75rem",
                     marginBottom: "1rem",
                   }}
                 >
                   <a
                     href="https://res.cloudinary.com/dxtiguwzm/image/upload/v1749825086/IABS_Form_z9eluj.png"
                     target="_blank"
                     rel="noopener noreferrer"
                     style={{
                       fontSize: "0.78rem",
                       color: "#666",
                       textDecoration: "underline",
                     }}
                   >
                     Information About Brokerage Services
                   </a>
       
                   <a
                     href="https://res.cloudinary.com/dxtiguwzm/image/upload/v1749825071/CPN_Form_1-5_0_jzmj2h.png"
                     target="_blank"
                     rel="noopener noreferrer"
                     style={{
                       fontSize: "0.78rem",
                       color: "#666",
                       textDecoration: "underline",
                     }}
                   >
                     Consumer Protection Notice
                   </a>
                 </div>
       
                 {/* EQUAL HOUSING */}
                 <img
                   src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1748218746/Lone_Star_Locators_Equal_Housing_Logo_h4dmr4.png"
                   alt="Equal Housing"
                   style={{
                     height: "42px",
                     opacity: 0.9,
                     marginBottom: "0.75rem",
                   }}
                 />
       
                 <p
                   style={{
                     fontSize: "0.75rem",
                     color: "#999",
                   }}
                 >
                   © {new Date().getFullYear()} AptAmigo Brokerage
                 </p>
               </div>
             </div>
           </LandingWrapper>
         );
       }
       
       /* ================= REVIEW STYLES ================= */
       
       const reviewWrapper: React.CSSProperties = {
         maxWidth: "520px",
         margin: "0 auto",
       };
       
       const imgStyle: React.CSSProperties = {
         borderRadius: "14px",
         width: "100%",
         boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
       };