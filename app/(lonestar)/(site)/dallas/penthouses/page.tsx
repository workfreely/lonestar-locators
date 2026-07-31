"use client";

import { useState, Suspense } from "react";
import BlogLayout from "@/app/components/BlogLayout";
import AISchema from "@/app/components/AISchema";

const DallasPenthousesPage = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const faqs = [
    {
      question: "Are there affordable penthouses for rent in Dallas?",
      answer:
        "Yes. While many penthouses are ultra luxury, some buildings offer smaller or more accessible penthouse layouts under $5,000 per month, especially when move in specials are available.",
    },
    {
      question: "Where are the best penthouses in Dallas located?",
      answer:
        "Most Dallas penthouses are located in Downtown, Uptown, and the East Quarter, offering skyline views, walkability, and access to top amenities.",
    },
    {
      question: "Do any Dallas penthouses allow short term or corporate stays?",
      answer:
        "Most luxury buildings restrict short term rentals, but some allow three month or longer leases or work with corporate housing providers. We can guide you to the right options.",
    },
    {
      question: "What is the difference between a penthouse and a luxury apartment?",
      answer:
        "Penthouses are typically located on the top floors and feature larger layouts, higher ceilings, premium finishes, and expansive views. Not all luxury apartments qualify as true penthouses.",
    },
  ];

  return (
    <Suspense fallback={null}>
      <>
        <AISchema city="Dallas" />
        <BlogLayout
          title="Dallas Penthouses for Rent (2026) | Luxury High-Rise Living"
          content={
            <>
              <p>
                Searching for the best penthouses in Dallas? Whether you want
                floor-to-ceiling windows, skyline views, or a private terrace, this
                guide highlights the top penthouse residences in Dallas for 2026,
                including luxury and more accessible options.
              </p>

              <h2>Why Rent a Penthouse in Dallas?</h2>
              <p>
                Penthouses offer top-tier living with more space, privacy, and
                elevated views. In Dallas, many are located in high-rise towers
                surrounded by dining, nightlife, and major employment hubs.
              </p>

              <div style={{ lineHeight: "1.9", marginTop: "1rem" }}>
                <div>✅ Expansive layouts with top-floor privacy</div>
                <div>✅ Sweeping views of the Dallas skyline</div>
                <div>✅ High-end finishes and premium appliances</div>
                <div>✅ Concierge services, lounges, and valet access</div>
              </div>

              <h2>Top Penthouses in Dallas</h2>

              <h3>The National Residences Downtown Dallas</h3>
              <p>
                Sitting atop one of the city’s most iconic towers, The National
                offers true high-rise penthouse living with soaring ceilings,
                oversized windows, and access to hotel-style amenities including a
                spa and rooftop pool.
              </p>

              <h3>East Quarter Residences</h3>
              <p>
                East Quarter penthouses feature modern industrial design, chef-style
                kitchens, and panoramic views of Downtown and Deep Ellum. These homes
                are ideal for renters who want luxury with a creative edge.
              </p>

              <h3>Carlisle and Vine Uptown Dallas</h3>
              <p>
                Located near Katy Trail and Turtle Creek, Carlisle and Vine offers
                boutique penthouse layouts with large balconies, smart home
                features, and spa-inspired bathrooms.
              </p>

              <h2>Preview Our Curated Dallas Penthouse List</h2>
              <p>
                We maintain a private list of Dallas penthouses, including
                off-market availability, leasing incentives, and priority
                showings not found on public apartment sites.
              </p>

              <img
                src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1758820133/luxury-apartment-locator-list-Dallas-dallas-houston-san-antonio_cfbc0q.png"
                alt="Dallas Penthouse List Preview"
                style={{
                  width: "100%",
                  marginBottom: "20px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                }}
              />

              <p style={{ fontStyle: "italic", color: "#666" }}>
                This is a preview. Contact us to receive your personalized penthouse
                matches with current pricing and availability.
              </p>

              <h2>What You Get When You Work With Us</h2>
              <div style={{ lineHeight: "1.9" }}>
                <div>✅ Custom penthouse recommendations based on your goals</div>
                <div>✅ Access to move in incentives and preferred pricing</div>
                <div>✅ Help scheduling private tours and negotiations</div>
                <div>
                  ✅ Completely free service with rebates or movers after you lease
                </div>
              </div>

              <h2>Ready to Tour a Dallas Penthouse?</h2>
              <p>
                Whether you are looking Downtown or Uptown, we will help you secure
                the right penthouse quickly and with expert guidance at no cost to
                you.
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
      </>
    </Suspense>
  );
};

export default DallasPenthousesPage;
