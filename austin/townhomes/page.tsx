"use client";

import { useState } from "react";
import BlogLayout from "@/app/components/BlogLayout";

export const metadata = {
  title: "Austin Townhomes for Rent & Sale (2025)",
  description:
    "Explore the best townhomes for rent in Austin including luxury, affordable, and yard-equipped options in North, South, and East Austin.",
};

const AustinTownhomesPage = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const IMG_WESTERLY = "/images/westerly-360.jpg";
  const IMG_AMLI = "/images/amli-south-shore.jpg";
  const IMG_BOULEVARD = "/images/boulevard-town-lake.jpg";

  const BLURRED_LIST =
    "https://res.cloudinary.com/dxtiguwzm/image/upload/v1750015063/how-apartment-locating-works-select-realtor-locator_qm12ei.jpg";

  const faqs = [
    {
      question: "Are townhomes available for rent in Austin?",
      answer:
        "Yes — communities like Westerly 360, AMLI South Shore, and The Boulevard at Town Lake offer townhome-style living in prime locations.",
    },
    {
      question: "Can I find affordable townhomes in Austin?",
      answer:
        "Yes — affordable townhome options exist in North and East Austin, and we track pricing daily to find the best value.",
    },
    {
      question: "Do Austin townhomes offer yards or outdoor space?",
      answer:
        "Many townhomes include private yards, patios, or green courtyards — ideal for pets and outdoor living.",
    },
    {
      question: "Is it hard to find a 3-bedroom townhome in Austin?",
      answer:
        "Availability is limited, but we know where 3-bedroom townhomes open up and can help you secure one.",
    },
  ];

  return (
    <BlogLayout
      title="Austin Townhomes for Rent & Sale (2025)"
      content={
        <>
          <p>
            Searching for Austin townhomes for rent or sale? Whether you want
            luxury townhomes, affordable options, or homes with yards, this
            guide covers the best communities across North, South, and East
            Austin.
          </p>

          <h2>Why Choose a Townhome in Austin?</h2>
          <p>
            Townhomes offer more space and privacy than apartments without the
            maintenance of a single-family home. Many feature private garages,
            multi-level layouts, and outdoor areas.
          </p>

          <h2>Top Austin Townhome Communities</h2>

          <h3>1. Westerly 360</h3>
          <img
            src={IMG_WESTERLY}
            alt="Westerly 360 Austin Townhomes"
            style={{ width: "100%", marginBottom: "20px", borderRadius: "8px" }}
          />
          <p>
            Located near The Domain, Westerly 360 offers modern townhomes with
            rooftop terraces, private garages, and walkable access to shopping
            and tech hubs.
          </p>

          <h3>2. AMLI South Shore</h3>
          <img
            src={IMG_AMLI}
            alt="AMLI South Shore Austin Townhomes"
            style={{ width: "100%", marginBottom: "20px", borderRadius: "8px" }}
          />
          <p>
            Waterfront living with spacious layouts, balconies, and trail
            access near downtown Austin.
          </p>

          <h3>3. The Boulevard at Town Lake</h3>
          <img
            src={IMG_BOULEVARD}
            alt="Boulevard at Town Lake Austin Townhomes"
            style={{ width: "100%", marginBottom: "20px", borderRadius: "8px" }}
          />
          <p>
            Steps from Zilker Park and downtown, offering rooftop views,
            patios, and secure parking.
          </p>

          <h2>Preview: Curated Austin Townhome Listings</h2>
          <img
            src={BLURRED_LIST}
            alt="Curated Austin Townhome List"
            style={{
              width: "100%",
              marginBottom: "20px",
              borderRadius: "8px",
              border: "1px solid #ddd",
            }}
          />

          <h2>Townhome Features Renters Love</h2>
          <ul>
            <li>✅ Private garages & entrances</li>
            <li>✅ Yard or patio space</li>
            <li>✅ Multi-level layouts</li>
            <li>✅ Walkable locations</li>
          </ul>

          <h2 style={{ marginTop: "50px" }}>
            Frequently Asked Questions
          </h2>

          <div style={{ borderTop: "1px solid #ddd", paddingTop: "15px" }}>
            {faqs.map((faq, idx) => (
              <div key={idx} style={{ marginBottom: "15px" }}>
                <div
                  onClick={() => toggleAccordion(idx)}
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
                {activeIndex === idx && (
                  <div
                    style={{
                      backgroundColor: "#fafafa",
                      padding: "10px 15px",
                      border: "1px solid #ddd",
                      borderTop: "none",
                      borderRadius: "0 0 5px 5px",
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

export default AustinTownhomesPage;
