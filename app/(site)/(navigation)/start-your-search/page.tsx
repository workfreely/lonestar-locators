"use client";

import { useEffect, Suspense } from "react";
import ContactForm from "@/app/components/ContactForm";
import JayBotWidget from "@/app/components/JayBotWidget";

export default function StartYourSearch() {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <div
      style={{
        padding: "1rem 1.5rem 2rem",
        fontFamily: "'Inter', sans-serif",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      {/* ================= HEADER ================= */}
      <h1
  style={{
fontSize: "clamp(2.9rem, 6.4vw, 3.8rem)",
    fontWeight: 800,
    textAlign: "center",
    marginBottom: "1rem",
    color: "#111",
    lineHeight: 1.15,
  }}
>
  <span className="mobile-title-line">Start Your</span>{" "}

  <span className="mobile-title-line">
    Apartment Search
  </span>
</h1>

      <p
        style={{
          textAlign: "left",
          maxWidth: "820px",
          margin: "0 auto 2.5rem",
          fontSize: "1.15rem",
          lineHeight: 1.6,
          color: "#444",
        }}
      >
        Fill out the form below to receive a personalized list of luxury apartments,
        townhomes, or rental homes. Second chance and broken lease options available.
      </p>

      {/* ================= CONTENT GRID ================= */}
      <div
  className="start-search-grid"
  style={{
    display: "grid",
    gridTemplateColumns: "1fr 420px",
    gap: "2.5rem",
    alignItems: "flex-start",
  }}
>
        {/* LEFT: CONTACT FORM */}
        <div
          className="contact-form-shell"
          style={{
            flex: "1 1 520px",
            minWidth: "320px",
          }}
        >
          <Suspense fallback={null}>
            <ContactForm mode="full" />
          </Suspense>
        </div>

        {/* RIGHT: VIDEO */}
<div
  className="desktop-video"
  style={{
    flex: "1 1 380px",
    minWidth: "300px",
  }}
>
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
              title="Apartment Locator Help"
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

      {/* ✅ Mobile layout fix */}
<style>
{`
  .mobile-title-line {
    display: inline;
  }

  @media (max-width: 768px) {
    .mobile-title-line {
      display: block;
    }

    .start-search-grid {
      display: flex !important;
      flex-direction: column !important;
    }

    .contact-form-shell {
      width: 100% !important;
      min-width: 0 !important;
    }

    .desktop-video {
      width: 100% !important;
      max-width: 540px !important;
      margin: 2rem auto 0 !important;
    }
  }
`}
</style>

      {/* ================= AI ASSISTANT ================= */}
      <Suspense fallback={null}>
        <JayBotWidget delay={15000} />
      </Suspense>
    </div>
  );
}
