"use client";

import { useState } from "react";
import BlogLayout from "@/app/components/BlogLayout";

export const metadata = {
  title: "Best Luxury Apartments in Houston (2025)",
  description:
    "Discover the best luxury apartments in Houston for 2025. Explore high-rise living, Museum District favorites, move-in specials, and curated luxury apartment lists — all with a free locator service.",
};

const HoustonLuxuryApartmentsPage = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const IMG_CHELSEA = "/images/chelsea-museum-district.jpg";
  const IMG_PARKSIDE = "/images/parkside-residences.jpg";
  const IMG_PARKER = "/images/the-parker-houston.jpg";
  const BLURRED_LIST =
    "https://res.cloudinary.com/dxtiguwzm/image/upload/v1750015063/how-apartment-locating-works-select-realtor-locator_qm12ei.jpg";

  const faqs = [
    {
      question: "What are the best luxury apartments in Houston?",
      answer:
        "Chelsea Museum District, Parkside Residences, and The Parker are some of the best luxury apartments in Houston, combining upscale amenities with prime locations.",
    },
    {
      question: "Are there any affordable luxury apartments in Houston?",
      answer:
        "Yes — several properties offer luxury finishes with rent under $1,000 or $1,300, especially with move-in specials. Contact us to see current availability.",
    },
    {
      question: "Do any luxury apartments in Houston offer virtual tours?",
      answer:
        "Yes — most modern communities offer online appointments, video tours, and self-guided options. We can help you find properties that match your preferences.",
    },
    {
      question:
        "What’s the difference between luxury and high-rise apartments?",
      answer:
        "High-rise apartments are a type of luxury living, typically offering premium views, 24/7 concierge, and modern amenities. Many are located in Downtown or the Museum District.",
    },
  ];

  return (
    <BlogLayout
      title="Best Luxury Apartments in Houston (2025)"
      content={
        <>
          <p>
            Searching for the best luxury apartments in Houston? Whether you’re
            eyeing Downtown, the Museum District, or a high-rise with skyline
            views, this guide highlights top-rated communities for 2025 —
            including luxury apartments under $1,000, brand-new buildings, and
            move-in specials.
          </p>

          <h2>Why Rent a Luxury Apartment in Houston?</h2>
          <p>
            Houston’s luxury rental market is booming, especially in areas like
            Downtown, the Museum District, and River Oaks. From high-rise towers
            with rooftop lounges to pet-friendly communities with resort-style
            pools, luxury apartments in Houston offer comfort, convenience, and
            location.
          </p>

          <h2>Top Picks: Best Luxury Apartments in Houston</h2>

          <h3>1. Chelsea Museum District</h3>
          <img src={IMG_CHELSEA} alt="Chelsea Museum District Houston" style={{ width: "100%", marginBottom: "20px", borderRadius: "8px" }} />
          <p>
            Located in the heart of the Museum District, Chelsea offers walkable
            access to Hermann Park, the Houston Zoo, and the city’s finest
            museums.
          </p>

          <h3>2. Parkside Residences</h3>
          <img src={IMG_PARKSIDE} alt="Parkside Residences Houston" style={{ width: "100%", marginBottom: "20px", borderRadius: "8px" }} />
          <p>
            Parkside Residences offers sleek interiors and spacious floorplans
            in Downtown Houston with concierge services and coworking lounges.
          </p>

          <h3>3. The Parker</h3>
          <img src={IMG_PARKER} alt="The Parker Houston" style={{ width: "100%", marginBottom: "20px", borderRadius: "8px" }} />
          <p>
            A luxury high-rise in the Museum District with valet parking,
            resident events, and panoramic skyline views.
          </p>

          <h2>Preview of Our Curated Luxury Apartment List</h2>
          <img src={BLURRED_LIST} alt="Curated Luxury Apartment List Houston" style={{ width: "100%", marginBottom: "20px", borderRadius: "8px", border: "1px solid #ddd" }} />

          <h2>Frequently Asked Questions (FAQ)</h2>
          <div style={{ borderTop: "1px solid #ddd", paddingTop: "15px" }}>
            {faqs.map((faq, index) => (
              <div key={index} style={{ marginBottom: "15px" }}>
                <div onClick={() => toggleAccordion(index)} style={{ cursor: "pointer", backgroundColor: "#f1f1f1", padding: "10px 15px", borderRadius: "5px", fontWeight: 600, color: "#004aad" }}>
                  {faq.question}
                </div>
                {activeIndex === index && (
                  <div style={{ backgroundColor: "#fafafa", padding: "10px 15px", border: "1px solid #ddd", borderTop: "none", borderRadius: "0 0 5px 5px", marginTop: "-5px", color: "#555" }}>
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

export default HoustonLuxuryApartmentsPage;
