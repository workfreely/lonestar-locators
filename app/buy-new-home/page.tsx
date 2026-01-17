"use client";

import { useEffect } from "react";
import NewHomeContactForm from "@/app/components/NewHomeContactForm";
import JayBotWidget from "@/app/components/JayBotWidget";

export default function BuyNewHomePage() {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <div
      style={{
        padding: "1rem 1.5rem 2.5rem", // ✅ FIX
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
        Buy a{" "}
        <span className="mobile-break">New Construction</span>{" "}
        Home
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
        Get expert help finding and buying new construction homes in Texas.
        We’ll guide you through builder incentives, financing options, and
        available communities.
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
        {/* LEFT: NEW HOME FORM */}
        <div
          className="contact-form-shell"
          style={{
            flex: "1 1 520px",
            minWidth: "320px",
          }}
        >
          <NewHomeContactForm />
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
              title="Buy a New Construction Home"
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

      {/* ================= AI ASSISTANT ================= */}
      <JayBotWidget delay={15000} />
    </div>
  );
}
