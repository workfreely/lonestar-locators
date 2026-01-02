"use client";

import React, { useState } from "react";

const ApartmentLocatorsSanAntonio = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const IMG_BLURRED_LIST =
    "https://res.cloudinary.com/dxtiguwzm/image/upload/v1758820133/luxury-apartment-locator-list-austin-dallas-houston-san-antonio_cfbc0q.png";

  const faqs = [
    {
      question: "What does an apartment locator do?",
      answer:
        "A professional apartment locator helps you find the best apartment for your needs — saving you time, money, and stress by providing expert guidance, insider knowledge, and access to current specials.",
    },
    {
      question: "Is your apartment locating service free?",
      answer:
        "Yes — our service is 100% free to you. We are paid by the apartment communities when you lease.",
    },
    {
      question: "Do you specialize in luxury apartments?",
      answer:
        "Yes — we specialize in luxury and lifestyle-driven apartments, but we also help affordable and second-chance clients.",
    },
    {
      question: "Do you help renters with bad credit or broken leases?",
      answer:
        "Yes — we have extensive experience helping clients with credit challenges, broken leases, or prior denials.",
    },
    {
      question: "Do you know about move-in specials or coming soon properties?",
      answer:
        "Yes — we track current specials and upcoming inventory across San Antonio to help you find the best deals.",
    },
  ];

  return (
          <p>
            Searching for the best
            <strong>Apartment Locators in San Antonio</strong>? You’ve come to
            the right place.
          </p>

          <p>
            Whether you’re looking for luxury apartments, affordable options, or
            need help with second-chance approvals — we’re here to help.
          </p>

          <p>
            We provide
            <strong>concierge-level apartment locating services</strong> across
            San Antonio — saving renters time, money, and stress.
          </p>

          <h2>Why Use an Apartment Locator?</h2>
          <p>Here’s why smart renters in San Antonio choose us:</p>

          <ul style={{ paddingLeft: "20px", lineHeight: "1.8" }}>
            <li>✅ Our service is 100% free</li>
            <li>✅ We save you time and stress</li>
            <li>✅ We know approval criteria</li>
            <li>✅ We track move-in specials</li>
            <li>✅ We know which properties are second-chance friendly</li>
            <li>✅ We know San Antonio neighborhoods and lifestyle fits</li>
            <li>
              ✅ We provide concierge-level service — not just a list of links
            </li>
          </ul>

          <h2>Who We Help</h2>
          <p>We help a wide range of renters in San Antonio, including:</p>

          <ul style={{ paddingLeft: "20px", lineHeight: "1.8" }}>
            <li>✅ Luxury renters seeking lifestyle-driven communities</li>
            <li>✅ Professionals relocating to San Antonio</li>
            <li>✅ Families seeking value + good schools</li>
            <li>
              ✅ Second-chance renters (bad credit, broken lease, background)
            </li>
            <li>✅ Military and medical professionals</li>
            <li>✅ Affordable renters looking for great deals</li>
          </ul>

          <h2>Exclusive Apartment List for San Antonio (2025)</h2>
          <p>
            We maintain an <strong>exclusive, updated list</strong> of luxury,
            affordable, and second-chance friendly apartments in San Antonio.
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
            /> */}
          )}

          <p style={{ fontStyle: "italic", color: "#666" }}>
            (Property names and details are blurred for privacy. Contact us
            below to get your personalized list!)
          </p>

          <h2>Common Mistakes Renters Make Without a Locator</h2>
          <p>
            Many renters make these costly mistakes when searching on their own:
          </p>

          <ul style={{ paddingLeft: "20px", lineHeight: "1.8" }}>
            <li>🚫 Applying to properties that won’t approve them</li>
            <li>🚫 Overpaying because they missed specials</li>
            <li>🚫 Touring unsafe or poorly managed properties</li>
            <li>🚫 Falling for scams on Craigslist or Facebook</li>
            <li>🚫 Wasting time on outdated apartment websites</li>
          </ul>

          <p>
            Using a <strong>professional Apartment Locator</strong> eliminates
            these risks — and helps you find the RIGHT apartment for your
            lifestyle.
          </p>

          <h2>Final Thoughts</h2>
          <p>
            Whether you’re looking for a <strong>luxury apartment</strong>, an
            <strong>affordable gem</strong>, or need help with
            <strong>second-chance approval</strong> — we’re here to help.
          </p>

          <p>
            Click below to request your personalized
            <strong>Apartment List for San Antonio</strong> — 100% free and with
            no obligation!
          </p>

          <p style={{ fontWeight: "bold", fontSize: "18px", color: "#2e7d32" }}>
            ✅ Get your free apartment list today!
          </p>

          {/* Accordion FAQ Section */}
          <h2 style={{ marginTop: "50px", fontWeight: "700" }}>
            Frequently Asked Questions (FAQ)
          </h2>
          <div style={{ borderTop: "1px solid #ddd", paddingTop: "15px" }}>
            {faqs.map((faq, index) => (
              <div key={index} style={{ marginBottom: "15px" }}>
                    fontWeight: "600",
                    color: "#004aad",
                  }}
                >
                  {faq.question}
                </div>
                {activeIndex === index && (
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
        </> */}
      }
    /> */}
  );
};

export default ApartmentLocatorsSanAntonio;
