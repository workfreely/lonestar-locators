import React, { useState } from "react";
import BlogLayout from "../../components/BlogLayout";

const LuxuryApartmentsTheRimSanAntonio = () => {
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
      question: "Why live near The Rim in San Antonio?",
      answer:
        "The Rim offers a modern luxury lifestyle with premium shopping, fine dining, entertainment, and quick access to major employers and attractions.",
    },
    {
      question: "What amenities do luxury apartments at The Rim offer?",
      answer:
        "Luxury apartments near The Rim feature resort-style pools, fitness centers, rooftop lounges, modern interiors, and attached garages.",
    },
    {
      question: "Are luxury apartments at The Rim pet-friendly?",
      answer:
        "Yes — most luxury apartments in this area offer pet-friendly amenities such as dog parks, pet spas, and walking trails.",
    },
    {
      question: "Can I get move-in specials on luxury apartments at The Rim?",
      answer:
        "Yes — we track current specials including waived fees, free rent, and other incentives.",
    },
    {
      question: "Do you offer rebates or free movers?",
      answer:
        "Yes — when you lease through us, you can receive up to $200 cash rebate or 2 hours of free movers — since you’re applying anyway, why not get the bonus!",
    },
  ];

  return (
    <BlogLayout
      title="Luxury Apartments in The Rim San Antonio (2025) | Live Near La Cantera & IH‑10"
       publishDate="2025-07-06T12:00:00"
    keywords={[
      "luxury apartments The Rim San Antonio",
      "The Rim apartments San Antonio",
      "L Cantera apartments San Antonio",
      "best apartments near The Rim San Antonio"
    ]}
      content={
        <>
          <p>
            Searching for <strong>luxury apartments in The Rim San Antonio</strong>? You’re in the right place.
          </p>

          <p>
            We help luxury renters find stunning apartments near The Rim, La Cantera, and IH‑10 — with top amenities and unbeatable locations.
          </p>

          <h2>Why Live in Luxury Apartments Near The Rim?</h2>
          <p>
            The Rim and surrounding area is one of the most desirable luxury hubs in San Antonio. Here’s why people love living here:
          </p>

          <ul style={{ paddingLeft: "20px", lineHeight: "1.8" }}>
            <li>✅ Walkable to The Rim & La Cantera shopping & dining</li>
            <li>✅ Minutes to major employers & medical centers</li>
            <li>✅ Luxury apartments with modern interiors</li>
            <li>✅ Rooftop pools, fitness centers, and garage parking</li>
            <li>✅ Quick access to IH‑10, 1604, and nearby attractions</li>
          </ul>

          <h2>Top Luxury Apartments Near The Rim</h2>

          <h3>1. Property One Name Here</h3>
          {IMG_PROPERTY_ONE && (
            <img
              src={IMG_PROPERTY_ONE}
              alt="Luxury Apartment The Rim San Antonio"
              style={{
                width: "100%",
                marginBottom: "20px",
                borderRadius: "8px",
              }}
            />
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
            Description of Property One — modern high-end features, ideal Rim/La Cantera location.
          </p>

          <h3>2. Property Two Name Here</h3>
          {IMG_PROPERTY_TWO && (
            <img
              src={IMG_PROPERTY_TWO}
              alt="Luxury Apartment The Rim San Antonio"
              style={{
                width: "100%",
                marginBottom: "20px",
                borderRadius: "8px",
              }}
            />
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
            Description of Property Two — another standout luxury apartment near The Rim with excellent amenities.
          </p>

          <h2>How We Help You Find the Best Luxury Apartments at The Rim</h2>
          <p>
            The Rim area is booming — and the best luxury apartments can lease quickly.
          </p>

          <p>
            We offer a <strong>free, concierge-level service</strong> — matching you with luxury apartments near The Rim based on your lifestyle, needs, and budget.
          </p>

          <p>
            And since you’re going to apply for an apartment anyway — why not get expert help, access to top deals, and even a cash rebate or free movers?
          </p>

          <ul style={{ paddingLeft: "20px", lineHeight: "1.8" }}>
            <li>✅ Local expertise on The Rim luxury properties</li>
            <li>✅ Insider knowledge of specials & availability</li>
            <li>✅ Advice on approval criteria</li>
            <li>✅ Help avoiding poorly managed properties</li>
            <li>✅ Up to $200 cash rebate or 2 hours of free movers</li>
          </ul>

          <h2>Final Thoughts</h2>
          <p>
            If you’re looking for <strong>luxury apartments in The Rim San Antonio</strong> — we’re ready to help.
          </p>

          <p>
            You’re applying anyway — why not have an expert on your side, access the best deals, and enjoy a rebate or free movers?
          </p>

          <p>
            Click below to request your <strong>free personalized luxury apartment list for The Rim</strong> — no obligation!
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
                <div
                  onClick={() => toggleAccordion(index)}
                  style={{
                    cursor: "pointer",
                    backgroundColor: "#f1f1f1",
                    padding: "10px 15px",
                    borderRadius: "5px",
                    fontWeight: "600",
                    color: "#004aad",
                  }}
                >
                  {faq.question}
                </div>
                {activeIndex === index && (
                  <div
                    style={{
                      backgroundColor: "#fafafa",
                      padding: "10px 15px",
                      border: "1px solid #ddd",
                      borderTop: "none",
                      borderRadius: "0 0 5px 5px",
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
        </>
      }
    />
  );
};

export default LuxuryApartmentsTheRimSanAntonio;