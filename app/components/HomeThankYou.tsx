"use client";

import React, { useState } from "react";
import Script from "next/script";

/* ===============================
   PROPS
   =============================== */
type HomeThankYouProps = {
  firstName?: string;
  city?: string;
};

export default function HomeThankYou({
  firstName = "Friend",
  city,
}: HomeThankYouProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const faqs = [
    {
      question: "Is your new home locating service really free?",
      answer:
        "Yes. Our service is completely free to you. Builders compensate us for helping buyers navigate the new construction process.",
    },
    {
      question: "Do you help with builder incentives?",
      answer:
        "Absolutely. We help you compare builder incentives, rate buy-downs, upgrades, and closing cost credits.",
    },
    {
      question: "Can you help even if I haven’t spoken to a builder yet?",
      answer:
        "Yes, that’s actually the best time to work with us so you don’t lose incentives or representation.",
    },
    {
      question: "Do you help with timelines and move-in planning?",
      answer:
        "Yes. We help align build timelines, inventory homes, and move-in dates with your goals.",
    },
  ];

  /* ===============================
     STYLES (IDENTICAL TO ThankYou)
     =============================== */
  const pageWrap: React.CSSProperties = {
    padding: "2.5rem 1.5rem",
    fontFamily: "'Inter', sans-serif",
    maxWidth: "1200px",
    margin: "0 auto",
  };

  const titleStyle: React.CSSProperties = {
    fontSize: "clamp(2.8rem, 6vw, 3.6rem)",
    fontWeight: 800,
    textAlign: "center",
    marginBottom: "1rem",
    color: "#111",
    lineHeight: 1.15,
  };

  const subheadStyle: React.CSSProperties = {
    maxWidth: "820px",
    margin: "0 auto 2.5rem",
    fontSize: "1.15rem",
    lineHeight: 1.7,
    color: "#444",
    textAlign: "left",
  };

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 420px",
    gap: "3rem",
    alignItems: "flex-start",
  };

  const sectionHeading: React.CSSProperties = {
    fontSize: "1.45rem",
    fontWeight: 800,
    margin: "0 0 0.35rem",
    color: "#111",
  };

  const paragraph: React.CSSProperties = {
    margin: "0 0 1rem",
    lineHeight: 1.65,
    fontSize: "1.05rem",
    color: "#222",
    maxWidth: "640px",
  };

  const imageCard: React.CSSProperties = {
    width: "100%",
    maxWidth: "520px",
    margin: "10px 0 28px",
    borderRadius: "12px",
    display: "block",
    border: "1px solid rgba(0,0,0,0.10)",
    boxShadow: "0 10px 24px rgba(0,0,0,0.10)",
  };

  const completedStep: React.CSSProperties = {
    textDecoration: "line-through",
    opacity: 0.55,
  };

  const faqTitle: React.CSSProperties = {
    fontSize: "1.65rem",
    fontWeight: 900,
    margin: "0 0 1rem",
    color: "#111",
  };

  return (
    <>
      {/* ===== SCHEMA ===== */}
      <Script
        id="home-thank-you-schema"
        type="application/ld+json"
        strategy="afterInteractive"
      >
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "New Home Thank You - Lone Star Locators",
        })}
      </Script>

      <div style={pageWrap}>
        {/* ================= HEADER ================= */}
        <h1 style={titleStyle}>Thanks, {firstName}!</h1>

        <p style={subheadStyle}>
          You’re one step closer to finding the perfect new build home 
          {city ? (
            <>
              {" "}
              in <strong>{city}</strong>
            </>
          ) : null}
          . We’re already reviewing your preferences and builder options.  
          We’ll be in touch within 24 hours.
        </p>

        {/* ================= CONTENT GRID ================= */}
        <div style={gridStyle}>
          {/* LEFT COLUMN */}
          <div style={{ minWidth: "320px" }}>
            {/* STEP 1 — COMPLETED */}
            <h2 style={{ ...sectionHeading, ...completedStep }}>
              <strong>Step 1: New Home Preferences ✓ Completed</strong>
            </h2>
            <p style={{ ...paragraph, ...completedStep }}>
              You’ve shared your new home goals, timeline, and budget.
            </p>

            {/* STEP 2 */}
            <h2 style={{ ...sectionHeading, marginTop: "3rem" }}>
              <strong>Step 2: Builder & Community Matching</strong>
            </h2>
            <p style={paragraph}>
              We match you with the best builders and communities that fit your
              needs and budget.
            </p>

            <img
             src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1760740971/new-construction-homes-list-san-_antonio-austin-dallas-houston_cvp0yz.png"
              alt="New home community list"
              style={imageCard}
            />

            {/* STEP 3 */}
            <h2 style={{ ...sectionHeading, marginTop: "3rem" }}>
              <strong>Step 3: Tours, Incentives & Pricing</strong>
            </h2>
            <p style={paragraph}>
              We help schedule tours and walk you through incentives, upgrades,
              and closing costs.
            </p>

            {/* STEP 4 */}
            <h2 style={{ ...sectionHeading, marginTop: "3rem" }}>
              <strong>Step 4: Builder Representation</strong>
            </h2>
            <p style={paragraph}>
              We represent you with the builder to protect incentives and pricing.
            </p>

            {/* STEP 5 */}
            <h2 style={{ ...sectionHeading, marginTop: "3rem" }}>
              <strong>Step 5: Build, Close & Move In</strong>
            </h2>
            <p style={paragraph}>
              We stay with you through construction, closing, and move-in.
            </p>

            <hr style={{ margin: "2rem 0" }} />

            {/* FAQ */}
            <h2 style={faqTitle}>New Construction FAQs</h2>

            <div style={{ display: "grid", gap: "16px" }}>
              {faqs.map((faq, index) => {
                const isOpen = activeIndex === index;

                return (
                  <div
                    key={index}
                    style={{
                      borderRadius: "12px",
                      border: "1px solid rgba(15, 47, 107, 0.22)",
                      boxShadow: isOpen
                        ? "0 12px 26px rgba(15, 47, 107, 0.18)"
                        : "0 6px 16px rgba(0,0,0,0.10)",
                      background: isOpen ? "#e4ecf8" : "#edf2f7",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleAccordion(index)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        cursor: "pointer",
                        padding: "16px 18px",
                        fontWeight: 800,
                        fontSize: "1.05rem",
                        color: "#0f2f6b",
                        background: isOpen ? "#e9efff" : "#eef2f7",
                        border: "0",
                      }}
                    >
                      {faq.question}
                    </button>

                    {isOpen && (
                      <div
                        style={{
                          padding: "14px 16px",
                          backgroundColor: "#ffffff",
                          borderTop: "1px solid rgba(0,0,0,0.08)",
                          color: "#222",
                          lineHeight: 1.65,
                        }}
                      >
                        {faq.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT COLUMN — VIDEO KEPT */}
          <div style={{ minWidth: "300px" }}>
            <div
              style={{
                position: "relative",
                paddingBottom: "177.78%",
                height: 0,
                overflow: "hidden",
                borderRadius: "12px",
                boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
              }}
            >
              <iframe
                src="https://www.youtube.com/embed/YOUR_VIDEO_ID"
                title="New Home Thank You - Lone Star Locators"
                allowFullScreen
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  border: "0",
                  borderRadius: "12px",
                }}
              />
            </div>
          </div>
        </div>

        {/* MOBILE STACK */}
        <style jsx>{`
          @media (max-width: 980px) {
            div[style*="grid-template-columns: 1fr 420px"] {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
    </>
  );
}
