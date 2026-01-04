"use client";

import { useState } from "react";
import BlogLayout from "@/app/components/BlogLayout";

const DallasTownhomesPage = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const faqs = [
    {
      question: "Are there affordable townhomes for rent in Dallas?",
      answer:
        "Yes. Dallas has several townhome communities that offer luxury features at more accessible prices, especially in North and South Dallas.",
    },
    {
      question: "Do townhomes for rent in Dallas come with a yard?",
      answer:
        "Many townhomes include private patios, balconies, or fenced yards. Let us know your preference and we will match you with available options.",
    },
    {
      question: "Are townhomes better than apartments?",
      answer:
        "Townhomes often provide more space, privacy, and multiple levels, which makes them ideal for families or renters who want a more residential feel.",
    },
    {
      question: "Can I find a 2 or 3-bedroom townhome in Dallas?",
      answer:
        "Absolutely. Communities like 2929 Wycliff and Echelon offer multi-bedroom townhomes with attached garages and modern finishes.",
    },
  ];

  return (
    <BlogLayout
      title="Dallas Townhomes for Rent (2026) | Luxury and 3-Bedroom Options"
      content={
        <>
          <p>
            Looking for a luxury or affordable townhome in Dallas? Whether you
            need a 3-bedroom layout, a private yard, or a quieter neighborhood,
            we can help you find the right fit.
          </p>

          <h2>Why Choose a Townhome in Dallas?</h2>
          <p>
            Townhomes offer a balance of space, privacy, and convenience. They
            are ideal for renters who want more room than an apartment without
            the responsibility of owning a home.
          </p>

          <div style={{ lineHeight: "1.9", marginTop: "1rem" }}>
            <div>✅ Attached garages or private parking</div>
            <div>✅ Private yards or fenced patios</div>
            <div>✅ Two or more stories of living space</div>
            <div>✅ Easier approval than single-family homes</div>
          </div>

          <h2>Top Townhome Communities in Dallas</h2>

          <h3>Kessler Bluffs North Oak Cliff</h3>
          <p>
            Located in scenic North Oak Cliff, Kessler Bluffs offers gated
            townhome-style living with oversized 2 and 3-bedroom layouts,
            private garages, balconies, and downtown views.
          </p>

          <h3>Echelon at Reverchon Bluffs</h3>
          <p>
            Near Bishop Arts and Trinity Groves, Echelon blends classic townhouse
            design with modern interiors. Many homes include fenced yards,
            open-concept kitchens, and smart home features.
          </p>

          <h3>2929 Wycliff Oak Lawn</h3>
          <p>
            This boutique community offers luxury townhomes in one of Dallas’s
            most walkable areas. Residents enjoy high-end finishes and easy
            access to Uptown dining and nightlife.
          </p>

          <h2>Preview Our Curated Dallas Townhome List</h2>
          <p>
            We maintain a curated list of Dallas townhomes, including off-market
            rentals, private landlords, and homes with flexible approval
            options.
          </p>

          <img
            src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1758820133/luxury-apartment-locator-list-Dallas-dallas-houston-san-antonio_cfbc0q.png"
            alt="Curated Dallas Townhome List"
            style={{
              width: "100%",
              marginBottom: "20px",
              borderRadius: "8px",
              border: "1px solid #ddd",
            }}
          />

          <p style={{ fontStyle: "italic", color: "#666" }}>
            This is a preview. Contact us to receive your personalized townhome
            matches with current pricing and availability.
          </p>

          <h2>What You Get When You Work With Us</h2>
          <div style={{ lineHeight: "1.9" }}>
            <div>✅ Custom townhome recommendations</div>
            <div>✅ Guidance on landlord approvals and applications</div>
            <div>✅ Access to move-in incentives and rebates</div>
            <div>✅ Completely free service with local expertise</div>
          </div>

          <h2>Ready to Tour a Dallas Townhome?</h2>
          <p>
            From modern townhomes near Uptown to more affordable options with
            outdoor space, we will help you lease with confidence. Our service
            is free and may include cash back or free movers after you lease.
          </p>

          <h2 style={{ marginTop: "3rem" }}>
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
        </>
      }
    />
  );
};

export default DallasTownhomesPage;
