"use client";

import { useState } from "react";
import BlogLayout from "@/app/components/BlogLayout";

export const metadata = {
  title: "Austin Penthouses Guide & Map (2025)",
  description:
    "Explore the best penthouses in Austin featuring skyline views, luxury finishes, private terraces, and VIP tour access — updated for 2025.",
};

const AustinPenthousesPage = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) =>
    setActiveIndex(activeIndex === index ? null : index);

  const IMG_THOMPSON = "/images/sienna-at-thompson.jpg";
  const IMG_ATLAS = "/images/atlas-eastside.jpg";
  const IMG_BROADSTONE = "/images/broadstone-north-atx.jpg";

  const BLURRED_LIST =
    "https://res.cloudinary.com/dxtiguwzm/image/upload/v1758820133/luxury-apartment-locator-list-austin-dallas-houston-san-antonio_cfbc0q.png";

  const faqs = [
    {
      question: "What is the average rent for a penthouse in Austin?",
      answer:
        "Penthouses typically rent between $3,500 and $5,500 depending on size, view, and amenities.",
    },
    {
      question: "Are penthouses pet-friendly?",
      answer:
        "Yes — most modern penthouse buildings in Austin welcome pets and offer pet amenities.",
    },
    {
      question: "Do penthouses include private outdoor space?",
      answer:
        "Many penthouses feature large terraces or balconies, some with private rooftop access.",
    },
    {
      question: "Can I schedule a private tour?",
      answer:
        "Absolutely. We arrange VIP penthouse tours tailored to your schedule.",
    },
  ];

  return (
    <BlogLayout
      title="Austin Penthouses Guide & Map (2025)"
      content={
        <>
          <p>
            Looking for the ultimate luxury living experience in Austin?
            Penthouse residences offer skyline views, premium finishes, and
            unmatched privacy in prime locations.
          </p>

          <h2>Top Penthouses in Austin</h2>

          <h3>1. Sienna at The Thompson</h3>
          {IMG_THOMPSON && (
            <img
              src={IMG_THOMPSON}
              alt="Sienna at The Thompson Austin"
              style={{ width: "100%", marginBottom: "20px", borderRadius: "8px" }}
            />
          )}
          <p>
            Located in the Rainey Street district inside the Thompson Hotel,
            Sienna delivers skyline views, floor-to-ceiling windows, concierge
            service, and rooftop amenities.
          </p>

          <h3>2. Atlas Eastside</h3>
          {IMG_ATLAS && (
            <img
              src={IMG_ATLAS}
              alt="Atlas Eastside Austin"
              style={{ width: "100%", marginBottom: "20px", borderRadius: "8px" }}
            />
          )}
          <p>
            A modern East Austin penthouse offering industrial finishes, 360°
            terrace views, and walkable access to nightlife and dining.
          </p>

          <h3>3. Broadstone North ATX</h3>
          {IMG_BROADSTONE && (
            <img
              src={IMG_BROADSTONE}
              alt="Broadstone North ATX"
              style={{ width: "100%", marginBottom: "20px", borderRadius: "8px" }}
            />
          )}
          <p>
            North Austin luxury with resort-style amenities, high ceilings,
            gourmet kitchens, and expansive private terraces.
          </p>

          <h2>Preview Our Curated Austin Penthouses List</h2>
          <img
            src={BLURRED_LIST}
            alt="Curated Penthouses List Austin"
            style={{
              width: "100%",
              marginBottom: "20px",
              borderRadius: "8px",
              border: "1px solid #ddd",
            }}
          />

          <h2>Why Work With Us?</h2>
          <ul>
            <li>✅ VIP penthouse tours arranged for you</li>
            <li>✅ Access to off-market & pre-lease units</li>
            <li>✅ Negotiation support & move-in perks</li>
            <li>✅ 100% free locating service</li>
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

export default AustinPenthousesPage;
