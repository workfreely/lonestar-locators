"use client";

import { useState } from "react";
import BlogLayout from "@/app/components/BlogLayout";

export const metadata = {
  title: "New Construction Homes in Houston TX | Best Builder Deals 2025",
  description:
    "Discover the best new construction homes in Houston, TX. Get access to builder incentives, first-time buyer programs, and exclusive deals — 100% free service.",
};

const NewConstructionHomesHoustonPage = () => {
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
        "Yes! Many builders offer flexible financing options and programs for buyers with various credit profiles. We’ll match you with the best opportunities.",
    },
    {
      question: "Are there new construction homes in Houston under $400K?",
      answer:
        "Yes — there are new communities with homes starting under $400K depending on location and builder incentives.",
    },
    {
      question: "Do I need an agent to buy a new construction home?",
      answer:
        "Yes. Builders represent themselves. Having your own agent costs you nothing and protects your interests.",
    },
    {
      question: "Are there first-time homebuyer programs for new construction?",
      answer:
        "Absolutely. Many lenders and builders offer first-time buyer incentives, down payment assistance, and special financing.",
    },
    {
      question: "How do I get started?",
      answer:
        "Click Start Your Search and we’ll send you a personalized list of new construction homes in Houston.",
    },
  ];

  return (
    <BlogLayout
      title="New Construction Homes in Houston TX | Best Builder Deals 2025"
      content={
        <>
          <p>
            Thinking about buying a brand new home in Houston? You’re in the
            right place. We help buyers discover{" "}
            <em>the best new construction deals</em>, builder incentives, and
            first-time homebuyer programs — all at{" "}
            <strong>no cost</strong> to you.
          </p>

          <h2>Why Buy a New Construction Home in Houston?</h2>
          <p>
            New construction homes offer modern designs, energy efficiency,
            builder warranties, and the ability to personalize your space —
            without the maintenance of an older home.
          </p>

          <h2>Popular Price Points — New Homes in Houston</h2>
          <div style={{ paddingLeft: "20px", lineHeight: "1.8" }}>
            <div>✅ New homes in Houston under $300K</div>
            <div>✅ New construction homes under $400K</div>
            <div>✅ New homes under $500K</div>
            <div>✅ First-time buyer friendly communities</div>
            <div>✅ Builder incentives & closing cost assistance</div>
          </div>

          <h2>How We Help You Find the Best Deals</h2>
          <div style={{ paddingLeft: "20px", lineHeight: "1.8" }}>
            <div>✅ Curated list based on your budget & goals</div>
            <div>✅ Access to exclusive builder incentives</div>
            <div>✅ First-time buyer & financing guidance</div>
            <div>✅ Free representation — builder pays us</div>
            <div>✅ Expert support from start to close</div>
          </div>

          <h2>Preview: Exclusive Houston New Construction List</h2>
          <p>
            We maintain an updated list of top new construction communities and
            builder incentives across Houston.
          </p>

          <img
            src={IMG_BLURRED_LIST}
            alt="Exclusive New Construction Homes List Houston"
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
            Click <span style={{ color: "#007a38" }}>Start Your Search</span>{" "}
            below and we’ll send you a personalized list of new construction
            homes in Houston.
          </p>

          <h2>Next Steps</h2>
          <p>
            Our service is <strong>100% free for buyers</strong> — and we help
            clients save thousands through builder incentives and smarter
            choices.
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

export default NewConstructionHomesHoustonPage;
