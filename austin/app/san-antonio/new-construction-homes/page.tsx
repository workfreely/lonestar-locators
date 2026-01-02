"use client";

import { useState } from "react";
import BlogLayout from "@/app/components/BlogLayout";
import NewHomeFooter from "@/app/components/NewHomeFooter";

export const metadata = {
  title: "New Construction Homes in San Antonio TX | Best Builder Deals 2025",
  description:
    "Discover the best new construction homes in San Antonio, TX. We help buyers find builder incentives, first-time buyer programs, and exclusive deals — free service.",
};

const NewConstructionHomesSanAntonioPage = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const IMG_BLURRED_LIST =
    "https://res.cloudinary.com/dxtiguwzm/image/upload/v1760740971/new-construction-homes-list-san-_antonio-austin-dallas-houston_cvp0yz.png";

  const faqs = [
    {
      question:
        "Can I buy a new construction home in San Antonio with less than perfect credit?",
      answer:
        "Yes! Many builders offer flexible financing options and programs for buyers with various credit profiles.",
    },
    {
      question: "Are there new construction homes in San Antonio under $400K?",
      answer:
        "Yes — there are new communities with homes starting under $400K depending on location and builder incentives.",
    },
    {
      question: "Do I need an agent to buy a new construction home?",
      answer:
        "Yes. Builders represent themselves. Having your own agent costs you nothing and protects your interests.",
    },
    {
      question: "Are there first-time homebuyer programs?",
      answer:
        "Absolutely. Many lenders and builders offer down payment assistance and special financing.",
    },
    {
      question: "How do I get started?",
      answer:
        "Click Start Your Search and we’ll send you a curated list of new construction homes that match your goals.",
    },
  ];

  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline:
              "New Construction Homes in San Antonio TX | Best Builder Deals 2025",
            description:
              "Discover the best new construction homes in San Antonio with builder incentives and first-time buyer programs.",
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
          }),
        }}
      />

      <BlogLayout
        title="New Construction Homes in San Antonio TX | Best Builder Deals 2025"
        content={
          <>
            <p>
              Thinking about buying a brand new home in San Antonio? We help
              buyers uncover <em>the best new construction deals</em>, builder
              incentives, and first-time buyer programs — all at{" "}
              <strong>no cost</strong>.
            </p>

            <h2>Why Buy a New Construction Home in San Antonio?</h2>
            <p>
              New builds offer modern layouts, energy efficiency, warranties,
              and personalization — without the maintenance of older homes.
            </p>

            <h2>Popular Price Points</h2>
            <div style={{ lineHeight: "1.8" }}>
              <div>✅ Under $300K</div>
              <div>✅ Under $400K</div>
              <div>✅ Under $500K</div>
              <div>✅ First-time buyer friendly</div>
              <div>✅ Builder incentives</div>
            </div>

            <h2>Preview Our Exclusive Builder List</h2>

            <img
              src={IMG_BLURRED_LIST}
              alt="New Construction Homes San Antonio"
              style={{
                width: "100%",
                marginBottom: "20px",
                borderRadius: "8px",
                border: "1px solid #ddd",
              }}
            />

            <p style={{ fontWeight: "bold", background: "#e6f4ea", padding: 12 }}>
              Click <span style={{ color: "#007a38" }}>Start Your Search</span>{" "}
              below and we’ll send you a personalized list of San Antonio new
              construction homes.
            </p>

            <h2>FAQ</h2>
            {faqs.map((faq, index) => (
              <div key={index} style={{ marginBottom: 15 }}>
                <div
                  onClick={() => toggleAccordion(index)}
                  style={{
                    cursor: "pointer",
                    background: "#f1f1f1",
                    padding: "10px 15px",
                    borderRadius: 5,
                    fontWeight: 600,
                  }}
                >
                  {faq.question}
                </div>
                {activeIndex === index && (
                  <div
                    style={{
                      padding: "10px 15px",
                      border: "1px solid #ddd",
                      borderTop: "none",
                    }}
                  >
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </>
        }
      />

      <NewHomeFooter citySlug="san-antonio" />
    </>
  );
};

export default NewConstructionHomesSanAntonioPage;
