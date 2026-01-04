"use client";

import { useState } from "react";
import BlogLayout from "@/app/components/BlogLayout";

const NewConstructionHomesDallas = () => {
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
        "Yes. Many builders offer flexible financing options and programs for buyers with different credit profiles.",
    },
    {
      question: "Are there new construction homes in Dallas under $400K?",
      answer:
        "Yes. There are communities with homes starting under $400K depending on location and incentives.",
    },
    {
      question: "Do I need an agent to buy a new construction home?",
      answer:
        "Yes. Builders represent themselves. Having your own agent costs you nothing and protects your interests.",
    },
    {
      question: "Are there first-time homebuyer programs for new construction?",
      answer:
        "Yes. Many lenders and builders offer first-time buyer incentives and down payment assistance.",
    },
    {
      question: "How do I get started?",
      answer:
        "Request your personalized list and we will match you with the best new construction deals.",
    },
  ];

  return (
    <>
      {/* JSON-LD Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "New Construction Homes in Dallas TX (2026)",
            description:
              "Explore the best new construction homes in Dallas TX. Access builder incentives, first-time homebuyer programs, and exclusive deals with free buyer representation.",
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
            datePublished: "2026-01-01",
            mainEntityOfPage: {
              "@type": "WebPage",
              "@id":
                "https://lonestarlocators.app/dallas/new-construction-homes",
            },
          }),
        }}
      />

      <BlogLayout
        title="New Construction Homes in Dallas TX | Best Builder Deals (2026)"
        content={
          <>
            <p>
              Thinking about buying a brand new home in Dallas? You’re in the
              right place. We help buyers discover the best new construction
              deals, builder incentives, and first-time homebuyer programs at
              no cost to you.
            </p>

            <h2>Why Buy a New Construction Home in Dallas?</h2>
            <p>
              New construction homes offer modern layouts, energy efficiency,
              builder warranties, and customization options without the issues
              that come with older homes.
            </p>

            <h2>Popular Price Points for New Homes</h2>
            <div style={{ lineHeight: "1.8", paddingLeft: "20px" }}>
              <div>✅ New homes in Dallas under $300K</div>
              <div>✅ New construction homes under $400K</div>
              <div>✅ New homes under $500K</div>
              <div>✅ First-time homebuyer friendly communities</div>
              <div>✅ Builder incentives and closing cost assistance</div>
            </div>

            <h2>How We Help You Find the Best Deals</h2>
            <div style={{ lineHeight: "1.8", paddingLeft: "20px" }}>
              <div>✅ Personalized list of new construction communities</div>
              <div>✅ Access to builder promotions and incentives</div>
              <div>✅ Guidance on financing and buyer programs</div>
              <div>✅ Free representation paid by the builder</div>
              <div>✅ Expert support from start to closing</div>
            </div>

            <h2>Preview Our Exclusive New Construction List</h2>
            <p>
              We maintain an updated list of top new construction communities
              and builder incentives in Dallas. Here is a preview.
            </p>

            <img
              src={IMG_BLURRED_LIST}
              alt="New Construction Homes Dallas List Preview"
              style={{
                width: "100%",
                borderRadius: "8px",
                border: "1px solid #ddd",
                marginBottom: "20px",
              }}
            />

            <p
              style={{
                backgroundColor: "#e6f4ea",
                padding: "12px",
                borderRadius: "6px",
                fontWeight: 600,
              }}
            >
              Click “Start Your Search” below and we will send you a
              personalized list of new construction homes in Dallas.
            </p>

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
  );
};

export default NewConstructionHomesDallas;
