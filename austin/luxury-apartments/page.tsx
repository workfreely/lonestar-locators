"use client";

import { useState } from "react";
import BlogLayout from "@/app/components/BlogLayout";

export const metadata = {
  title:
    "Best Luxury Apartments in Austin (2025) | High-Rise & Downtown Options",
  description:
    "Explore the best luxury apartments in Austin including downtown high-rises, East Austin, South Austin, and North Austin communities with modern amenities and move-in specials.",
};

const LuxuryApartmentsAustinPage = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const faqs = [
    {
      question: "What are the best luxury apartments in Austin right now?",
      answer:
        "Broadstone North ATX, Atlas Eastside, and Sienna at the Thompson are some of the top-rated options for 2025.",
    },
    {
      question: "Are luxury apartments in Austin pet-friendly?",
      answer:
        "Yes — most luxury apartments in Austin allow pets and often include pet-friendly amenities like dog parks and pet spas.",
    },
    {
      question: "Do these apartments offer move-in specials?",
      answer:
        "Some do! We can help you find current promotions such as waived fees, reduced rent, or even cash-back incentives.",
    },
    {
      question: "Do you help renters with second chance or credit issues?",
      answer:
        "Yes — if you’re concerned about approval, we can guide you toward luxury apartments that offer flexible criteria.",
    },
    {
      question: "Is your apartment locating service free?",
      answer:
        "Yes — our services are completely free to renters. We’ll help you tour, apply, and even get rebates or free movers.",
    },
  ];

  return (
    <BlogLayout
      title="Best Luxury Apartments in Austin (2025) | High-Rise & Downtown Options"
      content={
        <>
          <p>
            Looking for the best luxury apartments in Austin? Whether you’re
            drawn to downtown high-rises, modern North Austin communities, or
            walkable spots in East or South Austin — we’ve got you covered.
          </p>

          <h2>Why Rent a Luxury Apartment in Austin?</h2>
          <p>
            Austin offers the perfect balance of work, play, and natural beauty.
            From rooftop pools and skyline views to walkable nightlife and tech
            job hubs, luxury apartments here deliver next-level convenience and
            lifestyle.
          </p>

          <h2>Top Picks: Best Luxury Apartments in Austin</h2>

          <h3>1. Broadstone North ATX</h3>
          <img
            src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1716077436/broadstone-north-atx-luxury-apartment_austin.webp"
            alt="Broadstone North ATX"
            style={{ width: "100%", marginBottom: "20px", borderRadius: "8px" }}
          />
          <p>
            Broadstone North ATX delivers open-concept luxury living in North
            Austin with quartz countertops, walk-in closets, rooftop spaces,
            and a resort-style pool.
          </p>

          <h3>2. Atlas Eastside</h3>
          <img
            src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1716077410/atlas-eastside-luxury-apartment_austin.webp"
            alt="Atlas Eastside Austin"
            style={{ width: "100%", marginBottom: "20px", borderRadius: "8px" }}
          />
          <p>
            Atlas Eastside sits minutes from downtown with luxe interiors,
            coworking lounges, and panoramic rooftop views near Austin’s best
            nightlife and dining.
          </p>

          <h3>3. Sienna at the Thompson</h3>
          <img
            src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1716077449/sienna-thompson-downtown-luxury-apartment_austin.webp"
            alt="Sienna at the Thompson"
            style={{ width: "100%", marginBottom: "20px", borderRadius: "8px" }}
          />
          <p>
            A premier downtown high-rise offering hotel-style services,
            designer interiors, and sweeping skyline views.
          </p>

          <h2>Preview Our Curated Luxury Apartment List (2025)</h2>
          <img
            src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1750015063/how-apartment-locating-works-select-realtor-locator_qm12ei.jpg"
            alt="Curated Luxury Apartment List Austin"
            style={{
              width: "100%",
              marginBottom: "20px",
              borderRadius: "8px",
              border: "1px solid #ddd",
            }}
          />

          <h2 style={{ marginTop: "50px" }}>Frequently Asked Questions</h2>
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

export default LuxuryApartmentsAustinPage;
