"use client";

import { useState } from "react";

type FAQ = {
  question: string;
  answer: string;
};

export default function FAQAccordion({ faqs }: { faqs: FAQ[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      {faqs.map((faq, index) => {
        const isOpen = activeIndex === index;

        return (
          <div
            key={index}
            style={{
              borderRadius: "12px",
              border: "1px solid rgba(15, 47, 107, 0.18)", // ⬅️ slightly stronger
              backgroundColor: isOpen ? "#e8f0fb" : "#eef3f8", // ⬅️ more contrast
              boxShadow: isOpen
                ? "0 12px 26px rgba(0,0,0,0.14)"
                : "0 6px 14px rgba(0,0,0,0.08)",
              overflow: "hidden",
              transition: "all 0.25s ease",
            }}
          >
            <button
              type="button"
              onClick={() => toggleAccordion(index)}
              style={{
                width: "100%",
                textAlign: "left",
                cursor: "pointer",
                padding: "18px 20px",
                fontWeight: 800,
                fontSize: "1.05rem",
                color: "#0f2f6b",
                backgroundColor: isOpen ? "#e2ebfb" : "#e9eff6",
                border: "none",
              }}
            >
              {faq.question}
            </button>

            {isOpen && (
              <div
                style={{
                  padding: "16px 20px",
                  backgroundColor: "#ffffff",
                  borderTop: "1px solid rgba(15, 47, 107, 0.12)",
                  color: "#222",
                  fontSize: "1rem",
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
  );
}
