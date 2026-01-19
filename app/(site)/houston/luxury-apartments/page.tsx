"use client";

import { useState, Suspense } from "react";
import BlogLayout from "@/app/components/BlogLayout";
import AISchema from "@/app/components/AISchema";
import JayBotWidget from "@/app/components/JayBotWidget";

const HoustonLuxuryApartments = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const IMG_CHELSEA =
    "https://res.cloudinary.com/dxtiguwzm/image/upload/v1716077436/chelsea-museum-district-houston.webp";
  const IMG_PARKSIDE =
    "https://res.cloudinary.com/dxtiguwzm/image/upload/v1716077410/parkside-residences-houston.webp";
  const IMG_PARKER =
    "https://res.cloudinary.com/dxtiguwzm/image/upload/v1716077449/the-parker-houston.webp";

  const BLURRED_LIST =
    "https://res.cloudinary.com/dxtiguwzm/image/upload/v1750015063/how-apartment-locating-works-select-realtor-locator_qm12ei.jpg";

  const faqs = [
    {
      question: "What are the best luxury apartments in Houston?",
      answer:
        "Chelsea Museum District, Parkside Residences, and The Parker are among the most sought-after luxury apartments in Houston for 2026.",
    },
    {
      question: "Are there affordable luxury apartments in Houston?",
      answer:
        "Yes. Some luxury communities offer units under typical luxury pricing when move-in specials are available. Availability changes frequently.",
    },
    {
      question: "Do luxury apartments in Houston offer virtual tours?",
      answer:
        "Most modern Houston communities offer virtual tours, self-guided tours, or live video walkthroughs.",
    },
    {
      question: "What is the difference between luxury and high-rise apartments?",
      answer:
        "High-rise apartments are a category of luxury living that typically includes skyline views, premium amenities, and central locations.",
    },
  ];

  const content = (
    <>
      <p>
        Searching for the best luxury apartments in Houston? From Downtown towers
        to Museum District residences, Houston offers upscale living with modern
        amenities, skyline views, and prime locations.
      </p>

      <h2>Why Rent a Luxury Apartment in Houston?</h2>
      <p>
        Houston’s luxury market continues to expand in 2026, especially in
        Downtown, the Museum District, and River Oaks. Residents enjoy
        resort-style pools, concierge services, coworking lounges, and walkable
        access to dining and entertainment.
      </p>

      <h2>Top Luxury Apartments in Houston</h2>

      <h3>Chelsea Museum District</h3>
      <img
        src={IMG_CHELSEA}
        alt="Chelsea Museum District Houston"
        style={{ width: "100%", marginBottom: "14px", borderRadius: "8px" }}
      />
      <p>
        Located near Hermann Park and Houston’s cultural core, Chelsea offers
        open layouts, modern kitchens, and a rooftop terrace with city views.
      </p>

      <h3>Parkside Residences</h3>
      <img
        src={IMG_PARKSIDE}
        alt="Parkside Residences Houston"
        style={{ width: "100%", marginBottom: "14px", borderRadius: "8px" }}
      />
      <p>
        A Downtown favorite featuring spacious floorplans, concierge service,
        fitness studios, and coworking spaces designed for professionals.
      </p>

      <h3>The Parker</h3>
      <img
        src={IMG_PARKER}
        alt="The Parker Houston"
        style={{ width: "100%", marginBottom: "14px", borderRadius: "8px" }}
      />
      <p>
        A standout Museum District high-rise known for artistic design, valet
        service, resident events, and panoramic views of Downtown and Rice
        University.
      </p>

      <h2>Preview Our Curated Luxury Apartment List</h2>
      <p>
        We maintain a private list of luxury apartments in Houston, including
        off-market availability and buildings not shown on public listing
        sites.
      </p>

      <img
        src={BLURRED_LIST}
        alt="Curated Luxury Apartment List Houston"
        style={{
          width: "100%",
          marginBottom: "16px",
          borderRadius: "8px",
          border: "1px solid #ddd",
        }}
      />

      <p style={{ fontStyle: "italic", color: "#666" }}>
        This image is a preview. Full lists are customized for each renter.
      </p>

      <h2>What You Get When You Work With Us</h2>
      <ul>
        <li>Personalized luxury apartment list</li>
        <li>Access to move-in specials and incentives</li>
        <li>Tour scheduling and availability verification</li>
        <li>Free locating service with rebate opportunities</li>
      </ul>

      <div style={{ marginTop: "2.5rem" }}>
        <h2>Talk With a Free Houston Apartment Locator</h2>
        <p>
          Speak with our assistant to receive tailored luxury apartment options
          reviewed for accuracy before you tour.
        </p>
        <JayBotWidget />
      </div>

      <h2 style={{ marginTop: "2.5rem" }}>
        Frequently Asked Questions
      </h2>

      <div style={{ borderTop: "1px solid #ddd", paddingTop: "12px" }}>
        {faqs.map((faq, index) => (
          <div key={index} style={{ marginBottom: "10px" }}>
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
  );

  return (
    <Suspense fallback={null}>
      <>
        <AISchema city="Houston" />
        <BlogLayout
          title="Best Luxury Apartments in Houston (2026)"
          content={content}
          faqs={faqs}
          ctaType="apartment"
          schemaType="Service"
          address={{
            addressLocality: "Houston",
            addressRegion: "TX",
          }}
        />
      </>
    </Suspense>
  );
};

export default HoustonLuxuryApartments;
