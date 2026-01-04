"use client";

import { useState } from "react";
import BlogLayout from "@/app/components/BlogLayout";

const SanAntonioLuxuryApartmentsPage = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const faqs = [
    {
      question: "What are the best luxury apartments in San Antonio?",
      answer:
        "Some of the top-rated luxury apartments include 300 Main, The Floodgate, and Coopers Row. Each offers premium amenities, prime locations, and unique downtown experiences.",
    },
    {
      question: "Are there luxury apartments near The Rim in San Antonio?",
      answer:
        "Yes. Several upscale apartment communities are located near The Rim and La Cantera, offering modern interiors and easy access to shopping, dining, and entertainment.",
    },
    {
      question: "Do high-rise luxury apartments exist in San Antonio?",
      answer:
        "Yes. 300 Main is currently the only true residential high-rise in downtown San Antonio, featuring skyline views, concierge services, and luxury amenities.",
    },
    {
      question: "How can I tour luxury apartments in San Antonio?",
      answer:
        "We can schedule in-person or virtual tours for any luxury apartment you’re interested in. Our service is completely free and personalized to your needs.",
    },
  ];

  const content = (
    <>
      <p>
        Searching for the best luxury apartments in San Antonio? Whether you’re
        looking for a downtown high-rise, upscale apartments near The Rim, or a
        boutique luxury community with modern finishes, our team helps you find
        the best options available.
      </p>

      <h2>Why Rent a Luxury Apartment in San Antonio?</h2>
      <p>
        San Antonio blends historic charm with modern growth, and the luxury
        apartment market reflects that balance. From rooftop pools and skyline
        views to concierge services and walkable downtown living, luxury rentals
        here offer comfort, convenience, and elevated design.
      </p>

      <h2>Top Luxury Apartments in San Antonio</h2>

      <h3>1. 300 Main</h3>
      <p>
        300 Main is San Antonio’s only true residential high-rise. Located in the
        heart of downtown, it features floor-to-ceiling windows, panoramic city
        views, a rooftop infinity pool, and luxury amenities designed for modern
        urban living.
      </p>

      <h3>2. The Floodgate</h3>
      <p>
        Located along the River Walk, The Floodgate offers luxury finishes,
        private residences, and riverfront access. It’s ideal for renters who
        want privacy while staying close to downtown dining and entertainment.
      </p>

      <h3>3. Coopers Row</h3>
      <p>
        Coopers Row is a boutique luxury community near the Pearl District and
        River Walk. With sleek interiors, concierge-style service, and one of
        the most walkable locations in the city, it’s a top choice for luxury
        renters.
      </p>

      <h2>Preview Our Curated Luxury Apartment List</h2>
      <p>
        We maintain a private, up-to-date list of the best luxury apartments in
        San Antonio, including communities not always listed on public sites.
        Here’s a preview:
      </p>

      <img
        src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1758820133/luxury-apartment-locator-list-austin-dallas-houston-san-antonio_cfbc0q.png"
        alt="Curated Luxury Apartment List San Antonio"
        style={{
          width: "100%",
          marginBottom: "20px",
          borderRadius: "8px",
          border: "1px solid #ddd",
        }}
      />

      <p style={{ fontStyle: "italic", color: "#666" }}>
        This is only a preview. Contact us to receive your personalized list of
        luxury apartments in San Antonio.
      </p>

      <h2>What We Offer</h2>
      <div style={{ lineHeight: "1.8" }}>
        <div>✅ Free help from licensed apartment locators</div>
        <div>✅ Verified availability and pricing</div>
        <div>✅ Personalized luxury apartment recommendations</div>
        <div>✅ Access to move-in specials, rebates, or free movers</div>
        <div>✅ Fast tour scheduling and direct property connections</div>
      </div>

      <h2>Ready to Tour Your Next Luxury Apartment?</h2>
      <p>
        Skip outdated listings and let us do the work for you. We’ll help you
        find and tour the best luxury apartments in San Antonio — from downtown
        high-rises to upscale boutique communities.
      </p>

      <h2 style={{ marginTop: "40px", fontWeight: 700 }}>
        Frequently Asked Questions
      </h2>

      <div style={{ borderTop: "1px solid #ddd", paddingTop: "15px" }}>
        {faqs.map((faq, index) => (
          <div key={index} style={{ marginBottom: "12px" }}>
            <div
              onClick={() => toggleAccordion(index)}
              style={{
                cursor: "pointer",
                backgroundColor: "#f1f1f1",
                padding: "10px 14px",
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
                  padding: "10px 14px",
                  border: "1px solid #ddd",
                  borderTop: "none",
                  borderRadius: "0 0 5px 5px",
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
  );

  return (
    <BlogLayout
      title="Best Luxury Apartments in San Antonio"
      content={content}
      ctaType="apartment"
      schemaType="Article"
      address={{
        addressLocality: "San Antonio",
        addressRegion: "TX",
      }}
    />
  );
};

export default SanAntonioLuxuryApartmentsPage;
