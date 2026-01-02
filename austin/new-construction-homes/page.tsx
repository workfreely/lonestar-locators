"use client";

import { useState } from "react";
import BlogLayout from "@/app/components/BlogLayout";
import BuyNewHomeExitIntentPopup from "@/app/components/BuyNewHomeExitIntentPopup";
// import NewHomeFooter from "@/app/components/NewHomeFooter";

export const metadata = {
  title: "New Construction Homes in Austin TX | Best Builder Deals 2025",
  description:
    "Discover the best new construction homes in Austin, TX. Get builder incentives, first-time buyer programs, and expert help — 100% free.",
  keywords: [
    "new construction homes Austin",
    "new homes Austin TX",
    "Austin new construction",
    "first-time homebuyer Austin",
    "builder incentives Austin",
    "new communities Austin",
  ],
};

const NewConstructionHomesAustinPage = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const IMG_BLURRED_LIST =
    "https://res.cloudinary.com/dxtiguwzm/image/upload/v1760740971/new-construction-homes-list-san-_antonio-austin-dallas-houston_cvp0yz.png";

  const faqs = [
    {
      question:
        "Can I buy a new construction home in Austin with less than perfect credit?",
      answer:
        "Yes. Many builders offer flexible financing programs. We match you with builders that fit your credit profile.",
    },
    {
      question: "Are there new construction homes in Austin under $400K?",
      answer:
        "Yes — depending on location and incentives. We know which communities to target.",
    },
    {
      question: "Do I need an agent to buy a new construction home?",
      answer:
        "Yes. Builders represent themselves. Having your own agent costs nothing and protects you.",
    },
    {
      question: "Are there first-time homebuyer programs for new construction?",
      answer:
        "Absolutely. Many lenders and builders offer incentives and assistance programs.",
    },
    {
      question: "How do I get started?",
      answer:
        "Click Start Your Search below and we’ll send a curated list of deals that fit your goals.",
    },
  ];

  return (
    <>
      <BlogLayout
        title="New Construction Homes in Austin TX | Best Builder Deals 2025"
        content={
          <>
            <p>
              Thinking about buying a brand new home in Austin? We help buyers
              find the best new construction deals, builder incentives, and
              first-time homebuyer programs — all at <strong>no cost</strong>.
            </p>

            <h2>Why Buy a New Construction Home in Austin?</h2>
            <p>
              New construction homes offer modern designs, energy efficiency,
              builder warranties, and customization options without the issues
              of older homes.
            </p>

            <h2>Popular Price Points</h2>
            <ul>
              <li>✅ New homes under $300K</li>
              <li>✅ New construction under $400K</li>
              <li>✅ First-time buyer friendly communities</li>
              <li>✅ Builder incentives & closing cost help</li>
            </ul>

            <h2>Preview: Exclusive Builder Deals</h2>
            {IMG_BLURRED_LIST && (
              <img
                src={IMG_BLURRED_LIST}
                alt="New Construction Homes Austin"
                style={{
                  width: "100%",
                  marginBottom: "20px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                }}
              />
            )}

            <h2 style={{ marginTop: "50px" }}>Frequently Asked Questions</h2>
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
      {/* <NewHomeFooter citySlug="austin" /> */}
    </>
  );
};

export default NewConstructionHomesAustinPage;
