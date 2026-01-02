"use client";

import React, { useState } from "react";

const AffordableApartmentLocatorsSanAntonio = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const IMG_BLURRED_LIST =
    "https://res.cloudinary.com/dxtiguwzm/image/upload/v1758820133/luxury-apartment-locator-list-austin-dallas-houston-san-antonio_cfbc0q.png";

  const faqs = [
    {
      question: "Do you help renters find affordable apartments in San Antonio?",
      answer:
        "Yes — we help clients every week find affordable, well-managed apartments in San Antonio that fit their budget and needs.",
    },
    {
      question: "Is your apartment locating service free?",
      answer:
        "Yes — our service is 100% free to you. We are paid by the apartment communities when you lease.",
    },
    {
      question: "Do you know about current specials and deals?",
      answer:
        "Yes — we track move-in specials, discounts, and promotions that can help you save hundreds or even thousands on move-in costs.",
    },
    {
      question: "Do you help second-chance renters?",
      answer:
        "Yes — we have extensive experience helping clients with credit challenges, broken leases, or prior denials.",
    },
    {
      question: "Can you help me find an affordable apartment in a safe area?",
      answer:
        "Yes — we prioritize safety and value. We know which communities are well-managed and located in good areas, even on a budget.",
    },
  ];

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem" }}>
      <p>
        Looking for <strong>Affordable Apartment Locators in San Antonio</strong>?
        You’re in the right place.
      </p>

      <p>
        We help renters find{" "}
        <strong>safe, well-managed, affordable apartments</strong> across San
        Antonio without the stress of doing it alone.
      </p>

      <p>
        Whether you’re relocating, working with a tight budget, or simply want
        the best deal possible, we can help.
      </p>

      <h2>Why Use an Affordable Apartment Locator?</h2>

      <p>
        Finding an affordable apartment in San Antonio can be overwhelming,
        especially when listings online don’t always tell the full story.
      </p>

      <ul style={{ paddingLeft: "20px", lineHeight: "1.8" }}>
        <li>🚫 Poorly managed communities</li>
        <li>🚫 Apartments in unsafe areas</li>
        <li>🚫 Units overpriced for what they offer</li>
        <li>🚫 Listings that are misleading or outdated</li>
      </ul>

      <h2>Exclusive Affordable Apartment List (2025)</h2>

      <p>
        We maintain an exclusive, regularly updated list of affordable and
        budget-friendly apartments throughout San Antonio.
      </p>

      {IMG_BLURRED_LIST && (
        <img
          src={IMG_BLURRED_LIST}
          alt="Exclusive Apartment List San Antonio"
          style={{
            width: "100%",
            marginBottom: "20px",
            borderRadius: "8px",
            border: "1px solid #ddd",
          }}
        />
      )}

      <p style={{ fontStyle: "italic", color: "#666" }}>
        Property names and details are blurred for privacy. Contact us to receive
        your personalized apartment list.
      </p>

      <h2>Frequently Asked Questions</h2>

      <div style={{ borderTop: "1px solid #ddd", paddingTop: "15px" }}>
        {faqs.map((faq, index) => (
          <div key={index} style={{ marginBottom: "15px" }}>
            <div
              onClick={() => toggleAccordion(index)}
              style={{
                cursor: "pointer",
                fontWeight: 600,
                color: "#004aad",
              }}
            >
              {faq.question}
            </div>

            {activeIndex === index && (
              <div style={{ marginTop: "8px", color: "#555" }}>
                {faq.answer}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AffordableApartmentLocatorsSanAntonio;
