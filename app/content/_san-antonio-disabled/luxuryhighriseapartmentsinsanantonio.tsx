"use client";

import React, { useState } from "react";

const LuxuryHighRiseApartmentsSanAntonio = () => {
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
      question:
        "What are the benefits of living in a high-rise apartment in San Antonio?",
      answer:
        "High-rise apartments offer incredible skyline views, modern architecture, enhanced security, rooftop pools, fitness centers, and a vibrant lifestyle close to dining and entertainment.",
    },
    {
      question:
        "Where are the best luxury high-rise apartments in San Antonio?",
      answer:
        "Top areas include Downtown San Antonio, The Pearl District, River Walk, and emerging luxury hubs near The Rim and Stone Oak.",
    },
    {
      question: "Are luxury high-rise apartments pet-friendly?",
      answer:
        "Yes — many luxury high-rises in San Antonio offer pet-friendly amenities such as dog parks, pet spas, and walking trails.",
    },
    {
      question: "Can I get move-in specials on luxury high-rise apartments?",
      answer:
        "Yes — we track move-in specials across the best high-rise apartments, including free rent offers, waived fees, and more.",
    },
    {
      question: "Do you offer rebates or free movers?",
      answer:
        "Yes — when you lease through us, you can receive up to $200 cash rebate or 2 hours of free movers — since you’re applying anyway, why not get the bonus!",
    },
  ];

  return (
          <p>
            Looking for
            <strong>luxury high rise apartments in San Antonio</strong>? You’re
            in the right place.
          </p>

          <p>
            We help luxury renters find stunning high-rise apartments with
            skyline views, rooftop pools, concierge services, and the best
            locations in the city.
          </p>

          <h2>Why Live in Luxury High Rise Apartments in San Antonio?</h2>
          <p>
            High-rise living is perfect for those who love a modern, elevated
            lifestyle. Here’s why people choose luxury high-rises:
          </p>

          <ul style={{ paddingLeft: "20px", lineHeight: "1.8" }}>
            <li>✅ Incredible skyline views & floor-to-ceiling windows</li>
            <li>✅ Rooftop pools & lounges</li>
            <li>✅ 24/7 concierge & security</li>
            <li>✅ Walkable to top dining & entertainment</li>
            <li>✅ Modern architecture & luxury interiors</li>
          </ul>

          <h2>Top Luxury High Rise Apartments in San Antonio</h2>

          <h3>1. Property One Name Here</h3>
          {IMG_PROPERTY_ONE && (
            <img
              src={IMG_PROPERTY_ONE}
              alt="Luxury High Rise Apartment San Antonio"
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
            Description of Property One — premium high-rise features, location
            highlights, and amenities.
          </p>

          <h3>2. Property Two Name Here</h3>
          {IMG_PROPERTY_TWO && (
            <img
              src={IMG_PROPERTY_TWO}
              alt="Luxury High Rise Apartment San Antonio"
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
            Description of Property Two — another standout luxury high-rise
            apartment in San Antonio.
          </p>

          <h2>How We Help You Find the Best Luxury High Rise Apartments</h2>
          <p>
            With so many options in San Antonio, finding the right high-rise
            apartment can feel overwhelming — but we make it easy.
          </p>

          <p>
            We offer a <strong>free, concierge-level service</strong> — matching
            you with the best high-rise apartments based on your lifestyle,
            needs, and budget.
          </p>

          <p>
            And since you’re going to apply for an apartment anyway — why not
            get expert help, access to top deals, and even a cash rebate or free
            movers?
          </p>

          <ul style={{ paddingLeft: "20px", lineHeight: "1.8" }}>
            <li>✅ Local expertise on luxury high-rise properties</li>
            <li>✅ Insider knowledge of specials & availability</li>
            <li>✅ Advice on approval criteria</li>
            <li>✅ Help avoiding poorly managed properties</li>
            <li>✅ Up to $200 cash rebate or 2 hours of free movers</li>
          </ul>

          <h2>Final Thoughts</h2>
          <p>
            If you’re looking for
            <strong>luxury high rise apartments in San Antonio</strong> — we’re
            ready to help.
          </p>

          <p>
            You’re applying anyway — why not have an expert on your side, access
            the best deals, and enjoy a rebate or free movers?
          </p>

          <p>
            Click below to request your
            <strong>free personalized high-rise apartment list</strong> — no
            obligation!
          </p>

          <p style={{ fontWeight: "bold", fontSize: "18px", color: "#2e7d32" }}>
            ✅ Get your free high-rise apartment list today!
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

export default LuxuryHighRiseApartmentsSanAntonio;
