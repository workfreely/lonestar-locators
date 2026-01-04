"use client";

import React, { useState } from "react";
import BlogLayout from "@/app/components/BlogLayout";


const NewConstructionHomesHouston = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const IMG_BLURRED_LIST =
    "https://res.cloudinary.com/dxtiguwzm/image/upload/v1760740971/new-construction-homes-list-san-_antonio-austin-dallas-houston_cvp0yz.png";

  const faqs = [
    {
      question:
        "Can I buy a new construction home in Houston with less than perfect credit?",
      answer:
        "Yes. Many builders offer flexible financing options and programs for buyers with various credit profiles. We help match you with the best opportunities.",
    },
    {
      question: "Are there new construction homes in Houston under $400K?",
      answer:
        "Yes. Several new communities offer homes under $400K depending on location and builder incentives.",
    },
    {
      question: "Do I need an agent to buy a new construction home?",
      answer:
        "Yes. Builders represent their own interests. Having your own agent costs you nothing and protects you throughout the process.",
    },
    {
      question: "Are there first-time homebuyer programs for new construction?",
      answer:
        "Yes. Many lenders and builders offer first-time buyer incentives, down payment assistance, and special financing.",
    },
    {
      question: "How do I get started?",
      answer:
        "Start by requesting a personalized list. We review your goals and send curated new construction options that fit your needs.",
    },
  ];

  return (
    <BlogLayout
      title="New Construction Homes in Houston TX | Best Builder Deals 2026"
      content={
        <>

          <p>
            Thinking about buying a brand new home in Houston? You’re in the
            right place. We help buyers uncover the best new construction
            opportunities, builder incentives, and first-time buyer programs.
            All at no cost.
          </p>

          <h2>Why Buy a New Construction Home in Houston?</h2>
          <p>
            New construction homes offer modern layouts, energy-efficient
            designs, builder warranties, and customization options without the
            maintenance issues of older homes.
          </p>

          <h2>Popular Price Points for New Homes</h2>
          <div style={{ paddingLeft: "20px", lineHeight: "1.8" }}>
            <div>✅ New homes under $300K</div>
            <div>✅ New construction homes under $400K</div>
            <div>✅ New homes under $500K</div>
            <div>✅ First-time homebuyer-friendly communities</div>
            <div>✅ Builder incentives and closing cost assistance</div>
          </div>

          <h2>How We Help You Find the Best Deals</h2>
          <div style={{ paddingLeft: "20px", lineHeight: "1.8" }}>
            <div>✅ Personalized community list based on your goals</div>
            <div>✅ Access to builder incentives and promotions</div>
            <div>✅ Guidance on financing and first-time buyer programs</div>
            <div>✅ Free buyer representation</div>
            <div>✅ Support from search through closing</div>
          </div>

          <h2>Preview Our Exclusive New Construction List</h2>
          <p>
            We maintain a curated list of top new construction communities and
            builder deals across Houston.
          </p>

          <img
            src={IMG_BLURRED_LIST}
            alt="New Construction Homes Houston List"
            style={{
              width: "100%",
              marginBottom: "20px",
              borderRadius: "8px",
              border: "1px solid #ddd",
            }}
          />

          <p
            style={{
              backgroundColor: "#e6f4ea",
              padding: "12px",
              borderRadius: "6px",
              fontWeight: "bold",
            }}
          >
            Click “Start Your Search” below to receive a personalized list of
            new construction homes in Houston.
          </p>

          <h2>Next Steps</h2>
          <p>
            Our service is completely free for buyers. We help you avoid costly
            mistakes, access incentives, and move forward with confidence.
          </p>

          <h2 style={{ marginTop: "40px" }}>
            Frequently Asked Questions
          </h2>

          <div style={{ borderTop: "1px solid #ddd", paddingTop: "15px" }}>
            {faqs.map((faq, index) => (
              <div key={index} style={{ marginBottom: "12px" }}>
                <div
                  onClick={() => toggleAccordion(index)}
                  style={{
                    cursor: "pointer",
                    backgroundColor: "#f1f1f1",
                    padding: "10px 14px",
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
                      padding: "10px 14px",
                      border: "1px solid #ddd",
                      borderTop: "none",
                      borderRadius: "0 0 5px 5px",
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

export default NewConstructionHomesHouston;
