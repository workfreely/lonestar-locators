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
        className={inter.className}
        style={{
          padding: "1rem 1rem 2rem",
          maxWidth: "640px",
          margin: "0 auto",
        }}
      >
        {/* ================= HEADER ================= */}
        <h1
  style={{
    fontSize: "2.5rem",
    fontWeight: 800,
    lineHeight: 1.05,
    textAlign: "center",
  }}
>
  Stop Wasting Time
  <br />
  Searching for Apartments
</h1>

        <p
          style={{
            textAlign: "center",
            marginBottom: "0.35rem",
            color: "#555",
            lineHeight: 1.4,
            fontSize: "1.05rem",
          }}
        >
          I’ll send you the best apartment deals.
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
          San Antonio • Austin • Dallas • Houston
        </p>

        <p
  style={{
    textAlign: "center",
    fontWeight: "600",
    fontSize: "0.92rem",
    color: "#111",
    marginBottom: "0.9rem",
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  }}
>
        Up to 10 weeks free • cash rebate • free movers
        </p>

        <p
          style={{
            textAlign: "center",
            fontSize: "0.85rem",
            color: "#777",
            marginBottom: "1rem",
          }}
        >
          Takes 30–60 seconds. I got you 👍
        </p>

        {/* ================= FORM ================= */}
        <Suspense fallback={null}>
          <LandingForm mode="full" />
        </Suspense>

        {/* ================= TESTIMONIALS ================= */}
       <div
  style={{
    display: "flex",
    alignItems: "center",
    gap: "12px",
    width: "100%",
  }}
>
         <h2
  style={{
fontSize: "2.1rem",
    lineHeight: 1.1,
    textAlign: "center",
  }}
>
  Helping renters get approved 👇
</h2>

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
          <p
            style={{
              fontSize: "0.82rem",
              color: "#777",
              lineHeight: 1.5,
              marginBottom: "0.75rem",
            }}
          >
            Apartment locating services powered by AptAmigo Brokerage
            <br />
            Jay Morris | Licensed Real Estate Agent | Equal Housing Opportunity
          </p>

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