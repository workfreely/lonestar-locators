"use client";

import { useState } from "react";
import BlogLayout from "@/app/components/BlogLayout";
import AISchema from "@/app/components/AISchema";
import JayBotWidget from "@/app/components/JayBotWidget";

const LuxuryApartmentsDallasPage = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const faqs = [
    {
      question: "What are the best luxury apartments in Dallas for 2026?",
      answer:
        "8119 Luxury Apartments, Kessler Bluffs, and The Sinclair Residences are among the top luxury apartment communities in Dallas this year.",
    },
    {
      question: "Are there luxury apartments in Dallas under $1,300?",
      answer:
        "Yes. Select properties in North Dallas and Oak Cliff occasionally offer floor plans under $1,300. Availability changes often, so reach out for current options.",
    },
    {
      question: "Do Dallas luxury apartments offer virtual tours?",
      answer:
        "Most luxury communities offer virtual tours, FaceTime walk-throughs, and easy online scheduling.",
    },
    {
      question: "Do you help with move-in specials?",
      answer:
        "Yes. We help renters access limited-time incentives such as reduced rent, waived fees, and cash back offers.",
    },
    {
      question: "Is your apartment locating service really free?",
      answer:
        "Yes. Our Dallas apartment locating service is completely free, including tours, applications, and post-lease perks.",
    },
  ];

  return (
    <>
      <AISchema city="Dallas" />

      <BlogLayout
        title="Best Luxury Apartments in Dallas (2026) | High-Rise & Downtown Options"
        content={
          <>
            <p>
              Looking for the best luxury apartments in Dallas? From Uptown
              high-rise living to North Dallas and Oak Cliff communities, we help
              renters find upscale apartments with modern finishes, skyline
              views, and prime locations.
            </p>

            <h2>Why Rent a Luxury Apartment in Dallas?</h2>
            <p>
              Dallas offers a powerful mix of career growth, entertainment, and
              lifestyle. Luxury apartments here feature rooftop pools, designer
              interiors, and walkable access to nightlife and major employment
              hubs.
            </p>

            <h2>Top Picks for Luxury Apartments in Dallas</h2>

            <h3>1. 8119 Luxury Apartments</h3>
            <img
              src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1716077436/broadstone-north-atx-luxury-apartment_Dallas.webp"
              alt="8119 Luxury Apartments Dallas"
              style={{ width: "100%", marginBottom: "20px", borderRadius: "8px" }}
            />
            <p>
              Located near Preston Hollow, 8119 Luxury Apartments offer upscale
              interiors, private balconies, and easy access to NorthPark Center.
              A strong option for North Dallas luxury living.
            </p>

            <h3>2. Kessler Bluffs</h3>
            <img
              src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1716077410/atlas-eastside-luxury-apartment_Dallas.webp"
              alt="Kessler Bluffs Dallas"
              style={{ width: "100%", marginBottom: "20px", borderRadius: "8px" }}
            />
            <p>
              Kessler Bluffs blends Oak Cliff scenery with modern interiors,
              community amenities, and a peaceful residential setting close to
              downtown Dallas.
            </p>

            <h3>3. The Sinclair Residences</h3>
            <img
              src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1716077449/sienna-thompson-downtown-luxury-apartment_Dallas.webp"
              alt="The Sinclair Residences Dallas"
              style={{ width: "100%", marginBottom: "20px", borderRadius: "8px" }}
            />
            <p>
              The Sinclair delivers downtown luxury with rooftop lounges,
              resort-style pools, and walkable access to Uptown dining and
              nightlife.
            </p>

            <h2>Preview Our Curated Luxury Apartment List (2026)</h2>
            <img
              src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1758820133/luxury-apartment-locator-list-austin-dallas-houston-san-antonio_cfbc0q.png"
              alt="Curated Luxury Apartment List Dallas"
              style={{
                width: "100%",
                marginBottom: "20px",
                borderRadius: "8px",
                border: "1px solid #ddd",
              }}
            />
            <p style={{ fontStyle: "italic", color: "#666" }}>
              This is just a preview. Get your personalized list with current
              pricing, availability, and incentives.
            </p>

            <h2>How We Help Dallas Renters</h2>
            <ul style={{ lineHeight: "1.8" }}>
              <li>Personalized luxury apartment list</li>
              <li>Access to move-in specials and limited offers</li>
              <li>Virtual and in-person tour scheduling</li>
              <li>Cash back rebates or free movers after you lease</li>
            </ul>

            <h2 style={{ marginTop: "50px" }}>
              Frequently Asked Questions
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
                      fontWeight: 600,
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
                        color: "#555",
                      }}
                    >
                      {faq.answer}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ marginTop: "3rem" }}>
              <h2>Talk to a Free Dallas Apartment Locator</h2>
              <JayBotWidget />
            </div>
          </>
        }
      />
    </>
  );
};

export default LuxuryApartmentsDallasPage;
