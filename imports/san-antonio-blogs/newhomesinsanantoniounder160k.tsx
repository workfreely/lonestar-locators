import React, { useState } from "react";
import BlogLayout from "../../components/BlogLayout";
import BuyNewHomeExitIntentPopup from "../../components/BuyNewHomeExitIntentPopup";
import NewHomeFooter from "../../components/NewHomeFooter";
import { Helmet } from "react-helmet";

const NewHomesInSanAntonioUnder160k = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const faqs = [
    {
      question: "Are there really new homes in San Antonio under $160K?",
      answer:
        "Yes! While limited, there are new construction opportunities—typically in smaller starter communities or through builder incentives. We’ll help you find them.",
    },
    {
      question: "Can first-time homebuyers qualify for homes under $160K?",
      answer:
        "Absolutely—many programs (USDA, FHA, down-payment assistance) target this price range. We’ll guide you through eligibility and application.",
    },
    {
      question: "Is it worth buying an affordable new-home?",
      answer:
        "For first-time buyers, retirees, or those seeking low-maintenance investment options, these homes can offer strong value—especially when paired with financing help.",
    },
    {
      question: "How do builder incentives help?",
      answer:
        "Builders may include closing cost assistance or upgrades to meet the $160K range. We identify which communities are offering these.",
    },
    {
      question: "How do I get started?",
      answer:
        "Click “Start Your Search” below to tell us what matters most—budget, size, location—and we’ll send a personalized list of available homes under $160K.",
    },
  ];

  return (
    <BlogLayout
      title="New Homes in San Antonio Under $160K | Affordable Construction Deals"
      publishDate="2025-07-06T12:00:00"
      ctaType="newhome"
      keywords={[
        "new homes under 160k San Antonio",
        "move-in ready homes San Antonio",
        "San Antonio homes for sale under 160k",
      ]}
      content={
        <>
          <Helmet>
            <title>
              New Homes in San Antonio Under $160K | Affordable Construction
              Deals
            </title>
            <meta
              name="description"
              content="Looking for new homes in San Antonio under $160k? Learn the best communities, financing options, incentives, and how to get your personalized list—all at no cost!"
            />
            <meta
              name="keywords"
              content="new homes in San Antonio under 160k, affordable new construction San Antonio, first-time homebuyer San Antonio, builder incentives 160k San Antonio"
            />
            <script type="application/ld+json">{`
              {
                "@context":"https://schema.org",
                "@type":"Article",
                "headline":"New Homes in San Antonio Under $160K | Affordable Construction Deals",
                "description":"Discover new-construction homes in San Antonio under $160K—including builder incentives, first-time buyer programs, and community picks.",
                "author":{"@type":"Organization","name":"Lone Star Locators"},
                "publisher":{"@type":"Organization","name":"Lone Star Locators","logo":{"@type":"ImageObject","url":"https://res.cloudinary.com/dxtiguwzm/image/upload/v1748223464/lone-star-locators-white-logo-footer_dyrwka.png"}},
                "datePublished":"2025-06-10",
                "mainEntityOfPage":{"@type":"WebPage","@id":"https://yourdomain.com/sanantonio/new-construction-homes-under-160k"}
              }
            `}</script>
          </Helmet>

          <p>
            📍 Searching for *new homes in San Antonio under $160K*? You’re in
            the right spot! Many options exist—from smaller starter communities
            to great builder deals with incentives—all tailored to help you get
            into a brand-new home without overspending.
          </p>

          <h2>Why Focus on Homes Under $160K?</h2>
          <p>
            This price range is ideal for first-time buyers, retiree downsizers,
            or anyone looking for a low-cost, low-maintenance new home. New
            construction offers energy efficiency and builder warranties—without
            the high price tag of larger communities.
          </p>

          <h2>What’s Available at the $160K Level?</h2>
          <ul className="checklist">
            <li>✅ Compact, efficient 2–3 bedroom starter homes</li>
            <li>✅ Smaller lot communities on San Antonio’s outskirts</li>
            <li>✅ Model home sales or leftover lots with discounts</li>
            <li>
              ✅ Builder incentives, closing cost help, or mortgage subsidies
            </li>
          </ul>

          <h2>First-Time Buyer & Financing Perks</h2>
          <ul className="checklist">
            <li>✅ USDA and FHA loans with low down payment options</li>
            <li>✅ Local down payment assistance programs</li>
            <li>✅ Household income fit for qualifying at $160K</li>
            <li>✅ Incentives helping reduce monthly costs</li>
          </ul>

          <h2>Preview: Deals We’ve Found for You</h2>
          <p>
            We track builder deals and new communities actively pricing homes in
            this range. Here's a sneak peek at the types of homes you can
            expect:
          </p>

          <img
            src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1760740971/new-construction-homes-list-san-_antonio-austin-dallas-houston_cvp0yz.png"
            alt="Exclusive affordable new-homes list image"
            style={{
              width: "100%",
              marginBottom: "20px",
              borderRadius: "8px",
              border: "1px solid #ddd",
            }}
          />

          <p style={{ fontStyle: "italic", color: "#555" }}>
            Click “Start Your Search” below to tell us what matters most—and
            we’ll send a customized list of affordable new homes under $160K!
          </p>

          <h2>Next Steps</h2>
          <p>
            Ready to explore the best affordable new-home options in San
            Antonio? <strong>Our service is 100% free</strong>, and we can help
            you unlock builder incentives, financing programs, and more.
          </p>

          {/* FAQ Accordion */}
          <h2 style={{ marginTop: "50px", fontWeight: "700" }}>
            Frequently Asked Questions (FAQ)
          </h2>
          <div style={{ borderTop: "1px solid #ddd", paddingTop: "15px" }}>
            {faqs.map((faq, i) => (
              <div key={i} style={{ marginBottom: "15px" }}>
                <div
                  onClick={() => setActiveIndex(activeIndex === i ? null : i)}
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
                {activeIndex === i && (
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
// <NewHomeFooter citySlug="austin" /> // TODO: Move into return block later
<BuyNewHomeExitIntentPopup />;
export default NewHomesInSanAntonioUnder160k;
