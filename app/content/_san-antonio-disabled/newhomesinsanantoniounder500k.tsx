"use client";

import React, { useState } from "react";
// import BuyNewHomeExitIntentPopup from "../../components/BuyNewHomeExitIntentPopup";

const NewHomesInSanAntonioUnder500k = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const faqs = [
    {
      question: "What types of homes can I expect under $500K in San Antonio?",
      answer:
        "In this price range, you’ll find a mix of move-in-ready homes, upgraded new builds, and homes in master-planned communities with amenities. Builders like Lennar, KB Home, and D.R. Horton offer excellent options under $500K.",
    },
    {
      question: "Are there new homes near good schools or shopping?",
      answer:
        "Yes — many neighborhoods under $500K are in growing suburbs like Alamo Ranch, Westover Hills, and Cibolo that offer great schools, parks, and access to shopping, dining, and entertainment.",
    },
    {
      question: "Is $500K a good budget for new homes in 2025?",
      answer:
        "Yes — it opens the door to larger homes, more upgrades, and better locations than lower price points. Builders are also offering incentives in this range to attract qualified buyers.",
    },
    {
      question: "Can I still get builder incentives or closing cost help?",
      answer:
        "Absolutely. Many builders are offering closing cost assistance, rate buydowns, and design upgrades for homes under $500K — especially for first-time buyers or VA/FHA financing.",
    },
    {
      question: "How do I get matched with the right home?",
      answer:
        "Click 'Start Your Search' below, and we’ll send you a curated list of homes, builders, and promotions tailored to your budget and goals.",
    },
  ];

  return (
        <>
            <title>
              New Homes in San Antonio Under $500K – Explore Top Picks for 2025
            </title>
            <meta
              name="description"
              content="Explore new homes in San Antonio under $500K. Find move-in ready properties, builder incentives, and family-friendly neighborhoods for 2025."
            /> */}
            <meta
              name="keywords"
              content="new homes under 500k San Antonio, move-in ready homes San Antonio, San Antonio homes for sale under 500k"
            /> */}
            <script type="application/ld+json">
              {`
              {
                "@context": "https://schema.org",
                "@type": "Article",
                "headline": "New Homes in San Antonio Under $500K – Explore Top Picks for 2025",
                "description": "Explore new homes in San Antonio under $500K. Get expert help finding move-in ready homes and builder incentives in 2025.",
                "author": {
                  "@type": "Organization",
                  "name": "Lone Star Locators"
                },
                "publisher": {
                  "@type": "Organization",
                  "name": "Lone Star Locators",
                  "logo": {
                    "@type": "ImageObject",
                    "url": "https://res.cloudinary.com/dxtiguwzm/image/upload/v1748223464/lone-star-locators-white-logo-footer_dyrwka.png"
                  }
                },
                "datePublished": "2025-07-06",
                "mainEntityOfPage": {
                  "@type": "WebPage",
                  "@id": "https://yourdomain.com/new-homes-in-san-antonio-under-500k"
                }
              }
              `}
            </script>

          <p>
            Shopping for new homes in San Antonio under $500K? This price range
            gives you access to a wide variety of homes in desirable
            neighborhoods — with room for upgrades, larger floor plans, and
            builder incentives.
          </p>

          <h2>What You Get for $500K in San Antonio</h2>
          <p>
            With up to $500K to work with, you can afford a 3–4 bedroom home,
            often with upgraded finishes, open layouts, spacious backyards, and
            community amenities like parks and pools.
          </p>
          <ul className="checklist">
            <li>✅ 1,500–2,400+ sq. ft. modern floor plans</li>
            <li>✅ Energy-efficient features and smart home technology</li>
            <li>
              ✅ Granite countertops, tile floors, and stainless appliances
            </li>
            <li>✅ Established or up-and-coming neighborhoods</li>
            <li>✅ Opportunities for customization or builder upgrades</li>
          </ul>

          <h2>Top Areas for New Homes Under $500K</h2>
          <p>
            San Antonio’s west, northwest, and northeast corridors have
            experienced rapid growth — and many communities in these areas still
            offer homes under $500K.
          </p>
          <ul className="checklist">
            <li>✅ Alamo Ranch & Culebra Rd corridor</li>
            <li>✅ Westover Hills & Luckey Ranch</li>
            <li>✅ Converse, Schertz, and Cibolo</li>
            <li>✅ Helotes and Far Northwest San Antonio</li>
            <li>✅ South Side near Texas A&M-San Antonio</li>
          </ul>

          <h2>How We Help You Save on Your New Home</h2>
          <p>
            We specialize in helping buyers navigate builder promotions, hidden
            incentives, and limited-time offers. With our free service, you’ll:
          </p>
          <ul className="checklist">
            <li>✅ Receive a custom list of new homes under $500K</li>
            <li>✅ Get access to move-in ready homes and price drops</li>
            <li>
              ✅ Take advantage of builder-paid closing costs and rate buydowns
            </li>
            <li>
              ✅ Work with experts who know the best deals — not just what’s on
              Zillow
            </li>
          </ul>

          <h2>Preview: Our Builder Incentives List</h2>
          <p>
            We update our internal list of the top builder incentives,
            communities, and available homes in real time. You won’t find most
            of these on public sites.
          </p>
          <img
            src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1760740971/new-construction-homes-list-san-_antonio-austin-dallas-houston_cvp0yz.png"
            alt="San Antonio New Homes Builder Deals"
            style={{
              width: "100%",
              marginBottom: "20px",
              borderRadius: "8px",
              border: "1px solid #ddd",
            }}
          /> */}

          <p
            style={{
              backgroundColor: "#e6f4ea",
              padding: "12px",
              borderRadius: "6px",
              fontWeight: "bold",
            }}
          >
            <span style={{ fontWeight: "bold" }}>
              <span style={{ color: "black" }}>
                <strong>(</strong>
              </span>
              <span style={{ color: "#007a38" }}>
                <strong>Start Your Search</strong>
              </span>
              <span style={{ color: "black" }}>
                <strong>)</strong> below to tell us what you're looking for —
                we'll send a curated list of new homes in San Antonio under
                $500K.
              </span>
            </span>
          </p>

          <h2>Next Steps</h2>
          <p>
            With prices still relatively affordable in San Antonio, homes under
            $500K represent strong value and long-term upside. Whether you’re a
            first-time buyer or moving up, we’ll help you compare communities,
            incentives, and floor plans — all for free.
          </p>
          <p>
            Let’s make your new home dream a reality. Get in touch today and
            receive a handpicked list of the best new homes available now.
          </p>

          {/* FAQ Section */}
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

{/* <BuyNewHomeExitIntentPopup /> */};
export default NewHomesInSanAntonioUnder500k;
