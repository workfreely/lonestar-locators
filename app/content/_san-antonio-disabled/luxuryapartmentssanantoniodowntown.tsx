"use client";

import React, { useState } from "react";

const LuxuryApartmentsDowntownSanAntonio = () => {
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
      question: "Why live in Downtown San Antonio?",
      answer:
        "Downtown San Antonio offers a vibrant urban lifestyle with walkable access to restaurants, nightlife, River Walk, The Pearl, and cultural attractions.",
    },
    {
      question: "What amenities do Downtown luxury apartments offer?",
      answer:
        "Expect high-rise views, rooftop pools, concierge services, state-of-the-art fitness centers, modern interiors, and parking garages.",
    },
    {
      question: "Is parking available in Downtown luxury apartments?",
      answer:
        "Yes — most luxury apartments Downtown offer private parking garages with reserved spaces and guest parking.",
    },
    {
      question: "Can I get move-in specials on Downtown luxury apartments?",
      answer:
        "Yes — many Downtown properties offer incentives such as free rent, waived fees, or reduced deposits. We track the latest specials.",
    },
    {
      question: "Do you offer rebates or free movers?",
      answer:
        "Yes — when you lease through us, you can receive up to $200 cash rebate or 2 hours of free movers — since you’re applying anyway, why not get the bonus!",
    },
  ];

  return (
          <p>
            Searching for
            <strong>luxury apartments in Downtown San Antonio</strong>? You’ve
            come to the right place.
          </p>

          <p>
            We help luxury renters find stunning apartments in the heart of the
            city — with walkable access to the River Walk, The Pearl, top
            restaurants, nightlife, and cultural hotspots.
          </p>

          <h2>Why Live in Luxury Apartments in Downtown San Antonio?</h2>
          <p>
            Downtown San Antonio is perfect for luxury renters who want a
            vibrant, walkable urban lifestyle. Here’s why people love living
            here:
          </p>

          <ul style={{ paddingLeft: "20px", lineHeight: "1.8" }}>
            <li>✅ Walkable to River Walk & The Pearl</li>
            <li>✅ Rooftop pools & skyline views</li>
            <li>✅ Fine dining, live music & nightlife</li>
            <li>✅ Close to tech hubs, corporate offices, and UTSA Downtown</li>
            <li>✅ Access to major highways & public transit</li>
          </ul>

          <h2>Top Luxury Apartments in Downtown San Antonio</h2>

          <h3>1. Property One Name Here</h3>
          {IMG_PROPERTY_ONE && (
            <img
              src={IMG_PROPERTY_ONE}
              alt="Luxury Apartment Downtown San Antonio"
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
            Description of Property One — luxury high-rise finishes, location
            highlights in Downtown San Antonio.
          </p>

          <h3>2. Property Two Name Here</h3>
          {IMG_PROPERTY_TWO && (
            <img
              src={IMG_PROPERTY_TWO}
              alt="Luxury Apartment Downtown San Antonio"
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
            Description of Property Two — another standout Downtown luxury
            apartment with premium amenities.
          </p>

          <h2>How We Help You Find the Best Downtown Luxury Apartments</h2>
          <p>
            Finding the right luxury apartment Downtown can be competitive — but
            we make it easy.
          </p>

          <p>
            We offer a <strong>free, concierge-level service</strong> — matching
            you with the best Downtown apartments based on your lifestyle,
            needs, and budget.
          </p>

          <p>
            And since you’re going to apply for an apartment anyway — why not
            get expert help, access to top deals, and even a cash rebate or free
            movers?
          </p>

          <ul style={{ paddingLeft: "20px", lineHeight: "1.8" }}>
            <li>✅ Local expertise on Downtown luxury properties</li>
            <li>✅ Insider knowledge of specials & availability</li>
            <li>✅ Advice on approval criteria</li>
            <li>✅ Help avoiding poorly managed properties</li>
            <li>✅ Up to $200 cash rebate or 2 hours of free movers</li>
          </ul>

          <h2>Final Thoughts</h2>
          <p>
            If you’re looking for
            <strong>luxury apartments in Downtown San Antonio</strong> — we’re
            ready to help.
          </p>

          <p>
            You’re applying anyway — why not have an expert on your side, access
            the best deals, and enjoy a rebate or free movers?
          </p>

          <p>
            Click below to request your
            <strong>free personalized Downtown luxury apartment list</strong> —
            no obligation!
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

export default LuxuryApartmentsDowntownSanAntonio;
