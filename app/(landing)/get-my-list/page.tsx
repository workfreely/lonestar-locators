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
         padding: "1rem 0.7rem 2rem",
          maxWidth: "640px",
          width: "100%",
          margin: "0 auto",
        }}
      >
        {/* ================= HEADER ================= */}
        <h1
  style={{
    fontSize: "clamp(1.72rem, 4.7vw, 2.5rem)",
    fontWeight: 800,
    textAlign: "center",
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
lineHeight: 1.2,
            color: "#111",
            marginBottom: "0.9rem",
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
        <div style={{ marginTop: "2rem", textAlign: "center" }}>
          <h3
  style={{
    marginBottom: "1.9rem",
    fontSize: "clamp(1.5rem, 3vw, 1.8rem)",
    fontWeight: 800,
    color: "#111",
    lineHeight: 1.15,
    letterSpacing: "-0.5px",
  }}
>
  Helping renters get approved 👇
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
         Apartment locating powered by AptAmigo

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