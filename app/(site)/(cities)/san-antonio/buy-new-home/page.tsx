"use client";

import React from "react";
import BuyNewHomeForm from "@/app/components/NewHomeContactForm";

export default function BuyNewHomeSanAntonio() {
  return (
    <div style={{ padding: "2rem", fontFamily: "'Inter', sans-serif" }}>
      <h1 style={{ fontSize: "2rem", textAlign: "center", marginBottom: "1rem" }}>
        Buy a New Construction Home in San Antonio
      </h1>

      <p
        style={{
          textAlign: "center",
          maxWidth: "640px",
          margin: "0 auto 2rem",
        }}
      >
        Interested in new construction homes in San Antonio, TX? Get expert help
        navigating builders, incentives, and first-time buyer programs.
      </p>

      <div className="contact-form-shell">
  <BuyNewHomeForm defaultCity="San Antonio" />
</div>

    </div>
  );
}
