"use client";

import { useState } from "react";
import BlogLayout from "@/app/components/BlogLayout";

export const metadata = {
  title:
    "Dallas Penthouses for Rent (2025) | Luxury & Affordable High-Rise Options",
  description:
    "Explore the best Dallas penthouses for rent in 2025. Luxury and affordable high-rise penthouses with skyline views, VIP amenities, and exclusive access.",
};

const DallasPenthousesPage = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const faqs = [
    {
      question: "Are there affordable penthouses for rent in Dallas?",
      answer:
        "Yes. While many penthouses are ultra-luxury, some buildings offer smaller or more affordable penthouse units under $5,000 per month, especially with move-in specials.",
    },
    {
      question: "Where are the best penthouses in Dallas located?",
      answer:
        "Most Dallas penthouses are in Downtown, Uptown, and the East Quarter, offering skyline views and high-end amenities.",
    },
    {
      question: "Do any Dallas penthouses allow short-term rentals?",
      answer:
        "Most luxury buildings restrict Airbnb, but some allow 3+ month leases or corporate housing. We can guide you to the right options.",
    },
    {
      question:
        "What’s the difference between a penthouse and a luxury apartment?",
      answer:
        "Penthouses are usually on the highest floors and feature larger layouts, premium finishes, higher ceilings, and expansive views.",
    },
  ];

  return (
    <BlogLayout
      title="Dallas Penthouses for Rent (2025) | Luxury & Affordable High-Rise Options"
      content={
        <>
          <p>
            Searching for the best penthouses in Dallas? Whether you want
            floor-to-ceiling windows, skyline views, or private rooftop terraces,
            this guide highlights the top Dallas penthouses for 2025 — including
            luxury and more affordable options.
          </p>

          <h2>Why Rent a Penthouse in Dallas?</h2>
          <p>
            Penthouses offer unmatched privacy, space, and views. In Dallas,
            they’re most commonly found in Downtown, Uptown, and East Quarter
            high-rises near dining, culture, and nightlife.
          </p>

          <ul>
            <li>✅ Expansive layouts and top-floor privacy</li>
            <li>✅ Stunning Dallas skyline views</li>
            <li>✅ High-end finishes and premium appliances</li>
            <li>✅ Concierge, valet, and resident lounges</li>
          </ul>

          <h2>Top Penthouses in Dallas (2025)</h2>

          <h3>1. The National Residences – Downtown</h3>
          <p>
            One of Dallas’s most iconic towers, The National offers true
            penthouse living with soaring ceilings, oversized windows, and
            access to Thompson Hotel services, rooftop pool, and spa.
          </p>

          <h3>2. East Quarter Residences – East Downtown</h3>
          <p>
            These modern penthouses feature industrial-chic design, 2- and
            3-bedroom layouts, chef-style kitchens, and panoramic views of
            Downtown and Deep Ellum.
          </p>

          <h3>3. Carlisle & Vine – Uptown</h3>
          <p>
            A boutique Uptown favorite offering large balconies, wine fridges,
            smart-home features, and spa-inspired bathrooms — steps from Katy
            Trail and Turtle Creek.
          </p>

          <h2>Preview Our Curated Dallas Penthouse List</h2>
          <p>
            We maintain a private list of Dallas penthouses, including
            off-market units, incentives, and VIP leasing options not shown on
            public apartment sites.
          </p>

          <img
            src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1749011732/exclusive-second-chance-apartment-list-austin_ipjabc.jpg"
            alt="Dallas Penthouse Preview"
            style={{
              width: "100%",
              marginBottom: "20px",
              borderRadius: "8px",
              border: "1px solid #ddd",
            }}
          />

          <p style={{ fontStyle: "italic", color: "#666" }}>
            This is a preview of our curated list. Contact us to receive your
            personalized penthouse matches.
          </p>

          <h2>Why Work With Lone Star Locators?</h2>
          <ul>
            <li>✅ Personalized penthouse recommendations</li>
            <li>✅ Access to move-in specials and incentives</li>
            <li>✅ Private tours and leasing guidance</li>
            <li>✅ Free service with rebates or free movers</li>
          </ul>

          <h2>Ready to Tour a Dallas Penthouse?</h2>
          <p>
            From Downtown skyline units to Uptown boutique penthouses, we’ll
            help you find the perfect match — fast, free, and stress-free.
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

export default DallasPenthousesPage;
