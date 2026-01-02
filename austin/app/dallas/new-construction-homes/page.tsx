"use client";

import { useState } from "react";
import BlogLayout from "@/app/components/BlogLayout";
import BuyNewHomeExitIntentPopup from "@/app/components/BuyNewHomeExitIntentPopup";

export const metadata = {
  title: "New Construction Homes in Dallas TX | Best Builder Deals 2025",
  description:
    "Discover the best new construction homes in Dallas, TX. Get access to builder incentives, first-time buyer programs, and expert guidance — 100% free service.",
};

const NewConstructionHomesDallasPage = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const IMG_BLURRED_LIST =
    "https://res.cloudinary.com/dxtiguwzm/image/upload/v1760740971/new-construction-homes-list-san-_antonio-austin-dallas-houston_cvp0yz.png";

  const faqs = [
    {
      question:
        "Can I buy a new construction home in Dallas with less than perfect credit?",
      answer:
        "Yes. Many builders offer flexible financing programs. We help match buyers with the best available options.",
    },
    {
      question: "Are there new construction homes in Dallas under $400K?",
      answer:
        "Yes. Pricing depends on location and builder incentives. We know which communities to target.",
    },
    {
      question: "Do I need an agent to buy a new construction home?",
      answer:
        "Yes. Builders represent themselves. Having your own agent costs you nothing and protects your interests.",
    },
    {
      question: "Are there first-time homebuyer programs?",
      answer:
        "Absolutely. Many builders and lenders offer first-time buyer incentives and down payment assistance.",
    },
    {
      question: "How do I get started?",
      answer:
        "Click Start Your Search and we’ll send you a personalized list of new construction deals in Dallas.",
    },
  ];

  return (
    <>
      <BlogLayout
        title="New Construction Homes in Dallas TX | Best Builder Deals 2025"
        content={
          <>
            {/* JSON-LD */}
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: JSON.stringify({
                  "@context": "https://schema.org",
                  "@type": "Article",
                  headline:
                    "New Construction Homes in Dallas TX | Best Builder Deals 2025",
                  description:
                    "Discover the best new construction homes in Dallas with builder incentives and first-time buyer programs.",
                  author: {
                    "@type": "Organization",
                    name: "Lone Star Locators",
                  },
                  publisher: {
                    "@type": "Organization",
                    name: "Lone Star Locators",
                    logo: {
                      "@type": "ImageObject",
                      url: "https://res.cloudinary.com/dxtiguwzm/image/upload/v1748223464/lone-star-locators-white-logo-footer_dyrwka.png",
                    },
                  },
                  mainEntityOfPage: {
                    "@type": "WebPage",
                    "@id":
                      "https://lonestarlocators.app/dallas/new-construction-homes",
                  },
                }),
              }}
            />

            <p>
              Thinking about buying a brand new home in Dallas? We help buyers
              discover <em>the best new construction deals</em>, builder
              incentives, and first-time homebuyer programs — all at{" "}
              <strong>no cost</strong>.
            </p>

            <h2>Why Buy a New Construction Home in Dallas?</h2>
            <p>
              New construction homes offer modern layouts, energy efficiency,
              warranties, and the ability to personalize finishes — without the
              maintenance issues of older homes.
            </p>

            <h2>Popular Price Points</h2>
            <ul>
              <li>✅ New homes under $300K</li>
              <li>✅ New construction under $400K</li>
              <li>✅ Homes under $500K</li>
              <li>✅ First-time buyer friendly communities</li>
              <li>✅ Builder incentives & closing cost assistance</li>
            </ul>

            <h2>How We Help</h2>
            <ul>
              <li>✅ Personalized list based on your goals</li>
              <li>✅ Access to builder-only promotions</li>
              <li>✅ Financing & first-time buyer guidance</li>
              <li>✅ Free buyer representation</li>
            </ul>

            <h2>Exclusive New Construction List</h2>
            {IMG_BLURRED_LIST && (
              <img
                src={IMG_BLURRED_LIST}
                alt="New Construction Homes Dallas List"
                style={{
                  width: "100%",
                  marginBottom: "20px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                }}
              />
            )}

            <h2>Frequently Asked Questions</h2>
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

      <BuyNewHomeExitIntentPopup />
    </>
  );
};

export default NewConstructionHomesDallasPage;
