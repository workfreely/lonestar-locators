"use client";

import { useState } from "react";
import BlogLayout from "@/app/components/BlogLayout";

export const metadata = {
  title: "Best Luxury Apartments in San Antonio (2025)",
  description:
    "Explore the best luxury apartments in San Antonio, including downtown high-rises, River Walk residences, and upscale communities near The Rim. Free expert apartment locating.",
};

const SanAntonioLuxuryApartmentsPage = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const faqs = [
    {
      question: "What are the best luxury apartments in San Antonio?",
      answer:
        "Some of the top-rated luxury apartments include 300 Main, The Floodgate, and Coopers Row. Each offers premium amenities, prime locations, and unique experiences.",
    },
    {
      question: "Are there luxury apartments near The Rim in San Antonio?",
      answer:
        "Yes — several upscale properties are located near The Rim and La Cantera, offering modern features and easy access to shopping, dining, and entertainment.",
    },
    {
      question: "Do high-rise luxury apartments exist in San Antonio?",
      answer:
        "Yes — 300 Main is currently the only luxury residential high-rise in downtown San Antonio with panoramic skyline views and exclusive amenities.",
    },
    {
      question: "How can I tour luxury apartments in San Antonio?",
      answer:
        "Our team can schedule virtual or in-person tours for any luxury apartment you’re interested in — completely free. Just contact us to get started.",
    },
  ];

  return (
    <BlogLayout
      title="Best Luxury Apartments in San Antonio (2025)"
      content={
        <>
          <p>
            Searching for the best luxury apartments in San Antonio? Whether
            you’re looking for a high-rise downtown, luxury apartments near The
            Rim, or a brand-new upscale community with modern finishes, you’re
            in the right place.
          </p>

          <h2>Why Rent a Luxury Apartment in San Antonio?</h2>
          <p>
            San Antonio blends history, culture, and urban convenience — and the
            luxury apartment market reflects that. From resort-style pools and
            rooftop views to concierge services and walkable downtown living,
            high-end rentals here offer the best of both worlds.
          </p>

          <h2>Top Luxury Apartments in San Antonio (2025)</h2>

          <h3>1. 300 Main</h3>
          <p>
            300 Main is San Antonio’s only true luxury high-rise. Located in the
            heart of downtown, it features floor-to-ceiling windows, panoramic
            skyline views, and a rooftop infinity pool.
          </p>

          <h3>2. The Floodgate</h3>
          <p>
            Positioned along the River Walk, The Floodgate combines privacy with
            proximity to all the downtown action. With stunning finishes,
            resident lounges, and riverfront views, it’s perfect for those who
            value style and serenity.
          </p>

          <h3>3. Coopers Row</h3>
          <p>
            Coopers Row is one of the newest luxury communities in downtown San
            Antonio. Located near the Pearl and the River Walk, this boutique
            property offers sleek interiors and concierge-style service.
          </p>

          <h2>Preview Our Curated Luxury Apartment List</h2>
          <img
            src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1750015063/how-apartment-locating-works-select-realtor-locator_qm12ei.jpg"
            alt="Exclusive Luxury Apartment List San Antonio"
            style={{
              width: "100%",
              marginBottom: "20px",
              borderRadius: "8px",
              border: "1px solid #ddd",
            }}
          />

          <h2>What We Offer</h2>
          <div style={{ lineHeight: "1.8" }}>
            <div>✅ Free expert help from licensed apartment locators</div>
            <div>✅ Access to current rent specials and availability</div>
            <div>✅ Personalized list based on your budget and preferences</div>
            <div>✅ Exclusive cash rebates or free movers</div>
            <div>✅ Fast tour scheduling with properties</div>
          </div>

          <h2 style={{ marginTop: "50px" }}>
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

export default SanAntonioLuxuryApartmentsPage;
