"use client";

import React, { useState } from "react";
import Link from "next/link";
import Script from "next/script";
import FAQAccordion from "@/app/components/FAQAccordion";


export default function HowItWorks() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const faqs = [
    {
      question: "Is your apartment locating service really free?",
      answer:
        "Yes, our service is completely free to you. Our brokerage is credited by the apartment community when you list us on your application. You’re going to apply anyway, so why not get expert help, access to the best apartment specials and additional savings? Our clients can get a cash rebate or free movers at no cost.",
    },
    {
      question: "How do I qualify for the cash rebate or free movers?",
      answer:
        "Tell us which property you want to tour, list Jay Morris with AptAmigo on your application and report your lease once approved!",
    },
    {
      question: "What happens after I apply?",
      answer:
        "Let us know once you’ve been approved so we can confirm with the apartment and unlock your reward!",
    },
    {
      question: "What if I already toured or applied without you?",
      answer:
        "Most properties don’t allow changes once you’ve toured or submitted an application. To qualify for rewards like a cash rebate or free movers, make sure to list us on your guest card and application from the very beginning.",
    },
    {
      question: "Can you help me find an apartment with bad credit?",
      answer:
        "Yes! We help renters with bad credit find apartments across Austin, Dallas, Houston, and San Antonio. We also work with second chance properties that may accept broken leases, evictions, or background issues.",
    },
  ];

  // ✅ Reusable styles (keeps things consistent)
  const pageWrap: React.CSSProperties = {
    padding: "1rem 1.5rem 2.5rem", // ⬅️ top | sides | bottom
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
    gap: "3rem", // ✅ a bit more breathing room than Start Your Search
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
    maxWidth: "640px", // ✅ prevents text from running too wide toward the video
  };

  const imageCard: React.CSSProperties = {
    width: "100%",
    maxWidth: "520px",
    margin: "10px 0 28px",
    borderRadius: "12px",
    display: "block",
    border: "1px solid rgba(0,0,0,0.10)",
    boxShadow: "0 10px 24px rgba(0,0,0,0.10)", // ✅ “pop” without being heavy
  };

  const faqTitle: React.CSSProperties = {
    fontSize: "1.65rem",
    fontWeight: 900,
    margin: "0 0 1rem",
    color: "#111",
  };

  return (
    <>
      {/* ✅ Guaranteed schema output for this page */}
      <Script id="howto-schema" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: "How Lone Star Locators Works",
          description:
            "An easy, free process to help you find the best apartment deals and earn cash rebates or free movers.",
          step: [
            { "@type": "HowToStep", name: "Fill Out the Form" },
            { "@type": "HowToStep", name: "Get a Personalized Apartment List" },
            { "@type": "HowToStep", name: "Tour & Apply" },
            { "@type": "HowToStep", name: "List Us on Your Application" },
            { "@type": "HowToStep", name: "Move In & Get Rewarded" },
          ],
        })}
      </Script>

      <Script id="faq-schema" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: { "@type": "Answer", text: f.answer },
          })),
        })}
      </Script>

      <div style={pageWrap}>
        {/* ================= HEADER ================= */}
        <h1 style={titleStyle}>How It Works</h1>

        <p style={subheadStyle}>
          Find your next apartment the easy way. We help you secure the best deals plus cash rebates or free movers completely free while saving you time, money and stress!
        </p>

        {/* ================= CONTENT GRID ================= */}
        <div style={gridStyle}>
          {/* LEFT COLUMN */}
          <div style={{ minWidth: "320px" }}>
            {/* ✅ Step 1 */}
            <h2 style={sectionHeading}>
              <strong>Step 1: Fill Out the Form</strong>
            </h2>
            <p style={paragraph}>
              Tell us what you're looking for and we’ll send you a custom list with your best options.
            </p>

            <div style={{ textAlign: "center", margin: "16px 0 26px" }}>
              <Link href="/start-your-search" className="start-your-search-btn">
                Start Your Search
              </Link>
            </div>

            {/* ✅ Step 2 */}
<h2 style={{ ...sectionHeading, marginTop: "3rem" }}>
  <strong>Step 2: Get a Personalized Apartment List</strong>
</h2>

            <p style={paragraph}>
              We’ll send a personalized list of your best options based on your budget, move-in date, and preferences.
            </p>

            <img
              src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1758820133/luxury-apartment-locator-list-austin-dallas-houston-san-antonio_cfbc0q.png"
              alt="Apartment list preview"
              style={imageCard}
            />

            {/* ✅ Step 3 */}
           <h2 style={{ ...sectionHeading, marginTop: "3rem" }}>
              <strong>Step 3: Tour & Apply</strong>
            </h2>
            <p style={paragraph}>
              We’ll help schedule your tours and guide you through the application process.
            </p>

            {/* ✅ Step 4 */}
            <h2 style={{ ...sectionHeading, marginTop: "3rem" }}>
              <strong>Step 4: List Us on Your Application</strong>
            </h2>
            <p style={paragraph}>
              List <strong>Jay Morris with AptAmigo</strong> under <strong>How did you hear about us</strong>.
            </p>

            <img
              src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1750015063/how-apartment-locating-works-select-realtor-locator_qm12ei.jpg"
              alt="Referral field"
              style={{ ...imageCard, maxWidth: "460px" }}
            />

            {/* ✅ Step 5 */}
            <h2 style={{ ...sectionHeading, marginTop: "3rem" }}>
              <strong>Step 5: Move In & Get Rewarded</strong>
            </h2>
            <p style={paragraph}>
              Once you’re approved and moved in, send us your lease and receive your reward.
            </p>

            <hr style={{ margin: "2rem 0" }} />

            {/* ================= FAQ ================= */}
            <h2 style={faqTitle}>Frequently Asked Questions</h2>

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
    background: isOpen ? "#e9efff" : "#eef2f7", // 👈 more contrast
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

          {/* RIGHT COLUMN: VIDEO */}
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
                title="How It Works - Lone Star Locators"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
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
        

        {/* ✅ Mobile stacking */}
       <style jsx>{`
  /* 📱 Mobile-only: force stacked layout (refresh-safe) */
  @media (max-width: 980px) {
    .how-grid {
      grid-template-columns: 1fr !important;
      width: 100% !important;
      max-width: 100% !important;
    }

    .how-grid > div {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
    }
  }
`}</style>


      </div>
    </>
  );
}
