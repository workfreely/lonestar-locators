"use client";

import { Suspense } from "react";
import BlogLayout from "@/app/components/BlogLayout";
import AISchema from "@/app/components/AISchema";


const SanAntonioNeighborhoodsPage = () => {
  const title = "San Antonio Neighborhoods Map & Guide";

  const content = (
    <div>
      <p>
        San Antonio is a vibrant city shaped by history, culture, and rapid
        growth. From the iconic River Walk to quiet, family-friendly suburbs,
        there’s a neighborhood here for every lifestyle. Use this guide and
        interactive map to explore the best areas across the city.
      </p>

      <div style={{ margin: "40px 0" }}>
        <iframe
          src="https://www.google.com/maps/d/u/0/embed?mid=1CPI42z6JgvySuzbhmAvVN7g9zPm4E4k&ehbc=2E312F&noprof=1"
          width="100%"
          height="480"
          style={{ border: 0 }}
          loading="lazy"
          title="San Antonio Neighborhood Map"
        ></iframe>
      </div>

      <h2>Popular San Antonio Neighborhoods</h2>

      <h3>Downtown / River Walk</h3>
      <p>
        Downtown San Antonio is anchored by the world-famous River Walk and
        offers walkable access to restaurants, nightlife, museums, and major
        events like Fiesta. Apartments here range from historic lofts to modern
        luxury towers.
      </p>

      <h3>King William</h3>
      <p>
        Located just south of downtown, King William is known for its historic
        Victorian homes, art galleries, and strong community vibe. It’s highly
        walkable and popular with creatives and professionals.
      </p>

      <h3>Southtown / South Alamo Heights</h3>
      <p>
        Southtown features murals, galleries, coffee shops, and an arts-forward
        culture. South Alamo Heights is slightly quieter and residential while
        still offering quick access to central San Antonio.
      </p>

      <h3>Stone Oak / North Central San Antonio</h3>
      <p>
        Stone Oak is a master-planned area with newer apartments, top-rated
        schools, shopping centers, and easy access to Loop 1604. It’s a top
        choice for families and professionals seeking suburban comfort.
      </p>

      <h3>Tobin Hill / Olmos Park</h3>
      <p>
        Tobin Hill sits just north of the Pearl District and offers a mix of
        historic homes and modern apartments. Olmos Park provides tree-lined
        streets and quick access to Olmos Basin Park and downtown.
      </p>

      <h3>The Pearl District</h3>
      <p>
        The Pearl is one of San Antonio’s most desirable neighborhoods, offering
        upscale apartments, chef-driven restaurants, and a lively riverfront
        atmosphere. It’s ideal for walkable, modern living.
      </p>

      <h3>Alamo Heights</h3>
      <p>
        Alamo Heights is a centrally located enclave known for excellent
        schools, quiet streets, and local dining. It’s popular with families
        seeking a strong community feel.
      </p>

      <h3>Castle Hills</h3>
      <p>
        Castle Hills features mid-century homes, golf courses, large yards, and
        mature trees. It’s a well-established neighborhood with easy access to
        major highways and schools.
      </p>

      <h3>Medical Center Area</h3>
      <p>
        Near UT Health and major hospitals, this area offers a wide range of
        apartments for students, medical professionals, and families. It’s
        highly accessible via I-10 and Loop 410.
      </p>

      <h3>Alamo Ranch / West Side</h3>
      <p>
        Alamo Ranch is one of the fastest-growing areas in San Antonio, offering
        newer homes, affordable apartments, and expanding retail options. It’s
        a strong choice for value-focused renters.
      </p>

      <h2>How to Choose the Right San Antonio Neighborhood</h2>
      <ul style={{ listStyle: "none", paddingLeft: 0 }}>
        <li>Commute distance to work, school, or military bases</li>
        <li>Access to I-10, I-35, Loop 1604, and Hwy 281</li>
        <li>Walkable urban living vs quiet suburban areas</li>
        <li>Schools, parks, and family amenities</li>
        <li>Budget, lease terms, and credit flexibility</li>
      </ul>

      <h2>Walkable Areas in San Antonio</h2>
      <ul style={{ listStyle: "none", paddingLeft: 0 }}>
        <li>Downtown / River Walk</li>
        <li>King William</li>
        <li>The Pearl District</li>
        <li>Southtown / Tobin Hill</li>
      </ul>

      <h2>Luxury vs Second-Chance Friendly Areas</h2>
      <p>
        Luxury renters often gravitate toward Downtown, the Pearl, and Stone
        Oak. Renters needing more flexible approval options may find better
        opportunities in Alamo Ranch, the Medical Center area, and parts of the
        West and South Side.
      </p>

      <h2>Need Help Choosing?</h2>
      <p>
        San Antonio is large and diverse. Our licensed apartment locators help
        match you with neighborhoods and apartments that fit your budget,
        lifestyle, and rental history — completely free.
      </p>
    </div>
  );

  const faqs = [
    {
      question: "Which San Antonio neighborhoods are the most walkable?",
      answer:
        "Downtown, King William, the Pearl District, and Southtown are the most walkable areas with dining, entertainment, and river access.",
    },
    {
      question: "Are Stone Oak schools highly rated?",
      answer:
        "Yes. Stone Oak is served by North East ISD, one of the highest-rated school districts in the San Antonio area.",
    },
    {
      question: "Can I find second-chance apartments in San Antonio?",
      answer:
        "Yes. Areas like Alamo Ranch, the Medical Center, and parts of the South Side often offer more flexible leasing options.",
    },
    {
      question: "Is downtown San Antonio expensive to rent?",
      answer:
        "Downtown rents tend to be higher due to location and amenities, while suburban areas like Alamo Ranch and Castle Hills offer more affordable options.",
    },
    {
      question: "Which neighborhoods are best for families?",
      answer:
        "Stone Oak, Alamo Heights, Castle Hills, and parts of the North and West Side are popular with families due to schools and parks.",
    },
  ];

  return (
  <Suspense fallback={null}>
    <>
      <AISchema city="San Antonio" />
      <BlogLayout
        title={title}
        content={content}
        faqs={faqs}
        ctaType="apartment"
        schemaType="Article"
        address={{
          addressLocality: "San Antonio",
          addressRegion: "TX",
        }}
      />
    </>
  </Suspense>
);
};

export default SanAntonioNeighborhoodsPage;
