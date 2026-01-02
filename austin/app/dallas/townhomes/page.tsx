"use client";

import { useState } from "react";
import BlogLayout from "@/app/components/BlogLayout";

export const metadata = {
  title:
    "Dallas Townhomes for Rent (2025) | Luxury, Affordable & 3-Bedroom Options",
  description:
    "Looking for townhomes for rent in Dallas? Explore luxury and affordable townhomes, 2–3 bedroom options, and communities with yards. Free locating service included.",
};

const DallasTownhomesPage = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const faqs = [
    {
      question: "Are there affordable townhomes for rent in Dallas?",
      answer:
        "Yes — Dallas has several townhome communities that offer luxury amenities at affordable prices, especially in North and South Dallas neighborhoods.",
    },
    {
      question: "Do townhomes for rent in Dallas come with a yard?",
      answer:
        "Many townhomes offer private patios, balconies, or fenced yards. Let us know your preference and we’ll match you with available options.",
    },
    {
      question: "Are townhomes better than apartments?",
      answer:
        "Townhomes often provide more space, privacy, and multiple floors — ideal for families or anyone wanting a more residential feel.",
    },
    {
      question: "Can I get a 2 or 3 bedroom townhome in Dallas?",
      answer:
        "Absolutely. Communities like 2929 Wycliff and Echelon offer multi-bedroom townhomes with attached garages and modern finishes.",
    },
  ];

  return (
    <BlogLayout
      title="Dallas Townhomes for Rent (2025)"
      content={
        <>
          <p>
            Looking for a luxury or affordable townhome in Dallas? Whether
            you’re searching for a 3-bedroom townhome for rent, something with a
            yard, or a quiet upscale neighborhood — we’ve got you covered.
          </p>

          <h2>Why Choose a Townhome in Dallas?</h2>
          <p>
            Townhomes offer a unique blend of space, privacy, and comfort —
            perfect for renters who want more than an apartment without the
            commitment of buying. In Dallas, many townhomes come with:
          </p>

          <div style={{ lineHeight: "1.8" }}>
            <div>✅ Attached garages or private parking</div>
            <div>✅ Private yards or fenced patios</div>
            <div>✅ Two or more stories of living space</div>
            <div>✅ Easier approval than single-family homes</div>
          </div>

          <h2>Top Townhome Communities in Dallas</h2>

          <h3>1. Kessler Bluffs (North Oak Cliff)</h3>
          <p>
            Nestled in scenic North Oak Cliff, Kessler Bluffs is a gated
            townhome-style rental community offering oversized 2 and 3-bedroom
            floorplans with garages, private balconies, and views of downtown.
          </p>

          <h3>2. Echelon at Reverchon Bluffs (Southwest Dallas)</h3>
          <p>
            Located minutes from Bishop Arts and Trinity Groves, Echelon blends
            traditional townhouse charm with modern interiors, including
            attached garages, fenced-in yards, and open-concept kitchens.
          </p>

          <h3>3. 2929 Wycliff (Oak Lawn / Uptown)</h3>
          <p>
            This boutique community offers luxury 2-bedroom townhomes in one of
            Dallas’s most walkable neighborhoods, just blocks from dining and
            nightlife.
          </p>

          <h2>Preview of Our Curated Townhome List</h2>
          <p>
            We maintain a curated list of townhomes for rent in Dallas —
            including off-market listings, private landlords, and flexible
            approval options.
          </p>

          <img
            src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1749011732/exclusive-second-chance-apartment-list-austin_ipjabc.jpg"
            alt="Curated Dallas Townhome List"
            style={{
              width: "100%",
              marginBottom: "20px",
              borderRadius: "8px",
              border: "1px solid #ddd",
            }}
          />

          <p style={{ fontStyle: "italic", color: "#666" }}>
            This is a preview of our curated list. Contact us to receive your
            personalized matches.
          </p>

          <h2>What You Get When You Work With Us</h2>
          <div style={{ lineHeight: "1.8" }}>
            <div>✅ Personalized townhome matches</div>
            <div>✅ Approval guidance and application support</div>
            <div>✅ Access to move-in specials and rebates</div>
            <div>✅ Free local apartment locating service</div>
          </div>

          <h2>Ready to Tour a Dallas Townhome?</h2>
          <p>
            From modern Uptown townhomes to affordable options with yards,
            we’ll help you lease confidently — 100% free, with perks included.
          </p>

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

export default DallasTownhomesPage;
