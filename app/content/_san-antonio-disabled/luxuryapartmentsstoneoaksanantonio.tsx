"use client";

import React, { useState } from "react";

const LuxuryApartmentsStoneOakSanAntonio = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const IMG_PROPERTY_ONE = ""; // e.g. "/images/property-one.jpg"
  const IMG_PROPERTY_TWO = ""; // e.g. "/images/property-two.jpg"

  const VIDEO_PROPERTY_ONE = ""; // e.g. YouTube link
  const VIDEO_PROPERTY_TWO = ""; // e.g. YouTube link

  const faqs = [
    {
      question: "Why live in Stone Oak, San Antonio?",
      answer:
        "Stone Oak is one of San Antonio’s most desirable neighborhoods — known for top schools, beautiful homes, luxury apartments, shopping, and dining.",
    },
    {
      question: "What amenities do luxury apartments in Stone Oak offer?",
      answer:
        "Resort-style pools, fitness centers, modern kitchens, high ceilings, pet-friendly amenities, gated access, and attached garages in many properties.",
    },
    {
      question: "Are luxury apartments in Stone Oak family-friendly?",
      answer:
        "Yes — many luxury communities in Stone Oak attract families, professionals, and retirees thanks to excellent schools and a safe, suburban feel.",
    },
    {
      question: "Can I get move-in specials in Stone Oak?",
      answer:
        "Yes — we track current specials and incentives in Stone Oak and surrounding areas. Many luxury apartments offer free rent, waived fees, or reduced deposits.",
    },
    {
      question: "Do you offer rebates or free movers?",
      answer:
        "Yes — lease through us and you can receive up to $200 cash rebate or 2 hours of free movers — a great bonus since you’re applying anyway!",
    },
  ];

  return (
          <p>
            Searching for
            <strong>luxury apartments in Stone Oak San Antonio</strong>? You’re
            in the right place.
          </p>

          <p>
            Stone Oak is one of the most sought-after areas in San Antonio for
            luxury living — offering upscale apartments, gated communities,
            top-rated schools, and convenient access to shopping, dining, and
            major employers.
          </p>

          <h2>Why Live in Luxury Apartments in Stone Oak?</h2>
          <p>
            Stone Oak is ideal for those who want a suburban lifestyle with easy
            access to San Antonio’s top attractions. Here’s why luxury renters
            love Stone Oak:
          </p>

          <ul style={{ paddingLeft: "20px", lineHeight: "1.8" }}>
            <li>✅ Top-rated schools and family-friendly neighborhoods</li>
            <li>✅ Beautiful hill country views and green spaces</li>
            <li>✅ High-end shopping and dining options</li>
            <li>✅ Close to North Central medical corridor</li>
            <li>✅ Gated luxury communities with premium amenities</li>
          </ul>

          <h2>Top Luxury Apartments in Stone Oak San Antonio</h2>

          <h3>1. Property One Name Here</h3>
          {IMG_PROPERTY_ONE && (
            <img
              src={IMG_PROPERTY_ONE}
              alt="Luxury Apartment Stone Oak San Antonio"
              style={{
                width: "100%",
                marginBottom: "20px",
                borderRadius: "8px",
              }}
            /> */}
          )}
          {VIDEO_PROPERTY_ONE && (
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <a
                href={VIDEO_PROPERTY_ONE}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block",
                  padding: "10px 20px",
                  backgroundColor: "#B22222",
                  color: "#fff",
                  borderRadius: "5px",
                  textDecoration: "none",
                  fontWeight: "600",
                  fontSize: "16px",
                }}
              >
                ▶️ Watch Video Tour
              </a>
            </div>
          )}
          <p>
            Description of Property One — luxury finishes, amenities, location
            highlights in Stone Oak.
          </p>

          <h3>2. Property Two Name Here</h3>
          {IMG_PROPERTY_TWO && (
            <img
              src={IMG_PROPERTY_TWO}
              alt="Luxury Apartment Stone Oak San Antonio"
              style={{
                width: "100%",
                marginBottom: "20px",
                borderRadius: "8px",
              }}
            /> */}
          )}
          {VIDEO_PROPERTY_TWO && (
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <a
                href={VIDEO_PROPERTY_TWO}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block",
                  padding: "10px 20px",
                  backgroundColor: "#B22222",
                  color: "#fff",
                  borderRadius: "5px",
                  textDecoration: "none",
                  fontWeight: "600",
                  fontSize: "16px",
                }}
              >
                ▶️ Watch Video Tour
              </a>
            </div>
          )}
          <p>
            Description of Property Two — another standout luxury option in
            Stone Oak.
          </p>

          <h2>How We Help You Find the Best Luxury Apartments in Stone Oak</h2>
          <p>
            Finding the perfect luxury apartment in Stone Oak can be
            time-consuming — but we make it easy.
          </p>

          <p>
            We offer a <strong>free, concierge-level service</strong> — matching
            you with the best luxury apartments in Stone Oak based on your
            lifestyle, needs, and budget.
          </p>

          <p>
            And if you’re going to apply for an apartment anyway — why not get
            expert help, insider deals, and even a cash rebate or free movers?
          </p>

          <ul style={{ paddingLeft: "20px", lineHeight: "1.8" }}>
            <li>✅ Local expertise on Stone Oak luxury properties</li>
            <li>✅ Insider knowledge of specials & availability</li>
            <li>✅ Advice on approval criteria</li>
            <li>✅ Help avoiding poorly managed properties</li>
            <li>✅ Up to $200 cash rebate or 2 hours of free movers</li>
          </ul>

          <h2>Final Thoughts</h2>
          <p>
            If you’re searching for
            <strong>luxury apartments in Stone Oak San Antonio</strong> — we’re
            here to help.
          </p>

          <p>
            You’re going to apply for an apartment anyway — why not get expert
            guidance, access to the best deals, and even a rebate or free
            movers?
          </p>

          <p>
            Click below to request your
            <strong>
              free personalized luxury apartment list for Stone Oak
            </strong>
            — no obligation!
          </p>

          <p style={{ fontWeight: "bold", fontSize: "18px", color: "#2e7d32" }}>
            ✅ Get your free luxury apartment list today!
          </p>

          {/* Accordion FAQ Section */}
          <h2 style={{ marginTop: "50px", fontWeight: "700" }}>
            Frequently Asked Questions (FAQ)
          </h2>
          <div style={{ borderTop: "1px solid #ddd", paddingTop: "15px" }}>
            {faqs.map((faq, index) => (
              <div key={index} style={{ marginBottom: "15px" }}>
                    fontWeight: "600",
                    color: "#004aad",
                  }}
                >
                  {faq.question}
                </div>
                {activeIndex === index && (
                      marginTop: "-5px",
                      color: "#555",
                    }}
                  >
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </> */}
      }
    /> */}
  );
};

export default LuxuryApartmentsStoneOakSanAntonio;
