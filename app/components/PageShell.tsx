// app/components/PageShell.tsx
"use client";

import React from "react";

export default function PageShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: "2.5rem 1.5rem",
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
        {title}
      </h1>

      {subtitle && (
        <p
          style={{
            textAlign: "center",
            maxWidth: "680px",
            margin: "0 auto 2.5rem",
            fontSize: "1.05rem",
            lineHeight: 1.6,
            color: "#444",
          }}
        >
          {subtitle}
        </p>
      )}

      {/* ================= CONTENT ================= */}
      {children}
    </div>
  );
}
