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
          fontSize: "clamp(2.8rem, 6vw, 3.6rem)",
          fontWeight: 800,
          textAlign: "center",
          marginBottom: "1rem",
          color: "#111",
          lineHeight: 1.15,
        }}
      >
        Start Your{" "}
        <span className="mobile-break">Apartment</span>{" "}
        Search
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

      {/* ✅ Mobile stacking fix */}
      <style jsx>{`
        @media (max-width: 980px) {
          div[style*="grid-template-columns: 1fr 420px"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {/* ================= AI ASSISTANT ================= */}
      <Suspense fallback={null}>
        <JayBotWidget delay={15000} />
      </Suspense>
    </div>
  );
}
