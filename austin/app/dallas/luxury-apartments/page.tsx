"use client";

import { useState } from "react";
import BlogLayout from "@/app/components/BlogLayout";

export const metadata = {
  title: "Best Luxury Apartments in Dallas (2025)",
  description:
    "Explore the best luxury apartments in Dallas for 2025. From Uptown high-rises to North Dallas communities, get exclusive access, move-in specials, and cash-back offers.",
};

const DallasLuxuryApartmentsPage = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const IMG_8119 = "/images/8119-dallas.jpg";
  const IMG_KESSLER = "/images/kessler-bluffs.jpg";
  const IMG_SINCLAIR = "/images/sinclair-residences.jpg";

  const faqs = [
    {
      question: "What are the best luxury apartments in Dallas for 2025?",
      answer:
        "8119 Luxury Apartments, Kessler Bluffs, and The Sinclair Residences are three of the top luxury apartment communities in Dallas this year.",
    },
    {
      question: "Are there any luxury apartments under $1,300 in Dallas?",
      answer:
        "Yes — some properties in North Dallas and Oak Cliff offer select floorplans under $1,300. Availability changes quickly, so contact us for a current list.",
    },
    {
      question: "Do these apartments offer virtual or online appointments?",
      answer:
        "Absolutely — most luxury communities in Dallas offer virtual tours, FaceTime walk-throughs, and easy online scheduling.",
    },
    {
      question: "How do I schedule a tour?",
      answer:
        "Request your personalized list and we’ll help you tour, apply, and unlock move-in perks like specials or cash back.",
    },
  ];

  return (
    <BlogLayout
      title="Best Luxury Apartments in Dallas (2025)"
      content={
        <>
          <p>
            Looking for the best luxury apartments in Dallas? From Uptown to
            North Dallas, here are standout communities with premium amenities,
            great locations, and strong move-in incentives.
          </p>

          <h2>Why Rent a Luxury Apartment in Dallas?</h2>
          <p>
            Dallas blends career opportunity, nightlife, and upscale living.
            Luxury apartments offer high-end finishes, rooftop pools, skyline
            views, and walkable access to dining and entertainment.
          </p>

          <h2>Top Picks for Luxury Apartments in Dallas</h2>

          <h3>1. 8119 Luxury Apartments</h3>
          {IMG_8119 && (
            <img
              src={IMG_8119}
              alt="8119 Luxury Apartments Dallas"
              style={{ width: "100%", borderRadius: "8px", marginBottom: "20px" }}
            />
          )}
          <p>
            Located near NorthPark Center and Preston Hollow, this community
            offers upscale finishes, private balconies, and strong value for
            North Dallas luxury renters.
          </p>

          <h3>2. Kessler Bluffs</h3>
          {IMG_KESSLER && (
            <img
              src={IMG_KESSLER}
              alt="Kessler Bluffs Dallas"
              style={{ width: "100%", borderRadius: "8px", marginBottom: "20px" }}
            />
          )}
          <p>
            A modern Oak Cliff high-rise featuring serene views, dog parks,
            yoga studios, and resort-style amenities.
          </p>

          <h3>3. The Sinclair Residences</h3>
          {IMG_SINCLAIR && (
            <img
              src={IMG_SINCLAIR}
              alt="The Sinclair Residences Dallas"
              style={{ width: "100%", borderRadius: "8px", marginBottom: "20px" }}
            />
          )}
          <p>
            Uptown luxury living with rooftop lounges, floor-to-ceiling windows,
            and walkability to McKinney Avenue nightlife.
          </p>

          <h2>Exclusive Curated Luxury Apartment List (2025)</h2>
          <img
            src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1749011732/exclusive-second-chance-apartment-list-austin_ipjabc.jpg"
            alt="Exclusive Luxury Apartment List Dallas"
            style={{
              width: "100%",
              marginBottom: "20px",
              borderRadius: "8px",
              border: "1px solid #ddd",
            }}
          />
          <p style={{ fontStyle: "italic", color: "#666" }}>
            This is a preview — request your personalized list for availability,
            pricing, and specials.
          </p>

          <h2>How We Help</h2>
          <ul style={{ paddingLeft: "20px", lineHeight: "1.8" }}>
            <li>✅ Free personalized apartment lists</li>
            <li>✅ Access to move-in specials</li>
            <li>✅ Virtual and in-person tour scheduling</li>
            <li>✅ Up to $200 cash back or free movers</li>
          </ul>

          <h2>Frequently Asked Questions</h2>
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

export default DallasLuxuryApartmentsPage;
