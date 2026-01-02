"use client";

import React from "react";
import Link from "next/link";
import Script from "next/script";

type CityName = "Austin" | "Dallas" | "Houston" | "San Antonio";

interface CityCategoryPageProps {
  city: CityName;
  slug: string;
  path: string;
}

const baseUrl = "https://www.lonestarlocators.app";

const citySlugMap: Record<CityName, string> = {
  Austin: "austin",
  Dallas: "dallas",
  Houston: "houston",
  "San Antonio": "san-antonio",
};

function getCategoryContent(city: CityName, slug: string) {
  const cityName = city;
  const market = `${cityName}, TX`;

  let title = "";
  let metaDescription = "";
  let h1 = "";
  let intro = "";
  let sections: { heading: string; items: string[] }[] = [];

  switch (slug) {
    case "luxury-apartments":
      title = `Luxury Apartments in ${market}`;
      metaDescription = `Explore the best luxury apartments in ${market}.`;
      h1 = `Luxury Apartments in ${market}`;
      intro = `Looking for upscale living in ${market}? Here are the top options.`;
      sections = [
        {
          heading: "Top Luxury Communities",
          items: ["Resort-style pools", "Concierge services"],
        },
      ];
      break;

    default:
      h1 = `${city} Apartments`;
      intro = `Browse apartments in ${market}.`;
  }

  return { title, metaDescription, h1, intro, sections };
}

const CityCategoryPage: React.FC<CityCategoryPageProps> = ({
  city,
  slug,
  path,
}) => {
  const { title, metaDescription, h1, intro, sections } = getCategoryContent(
    city,
    slug
  );

  const canonical = `${baseUrl}${path}`;
  const breadcrumbApartmentsPath = `/apartments/${citySlugMap[city]}`;

  return (
    <>
      {/* ✅ Schema: WebPage */}
      <Script
        id={`webpage-schema-${path}`}
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: title,
            description: metaDescription,
            url: canonical,
            about: {
              "@type": "Place",
              name: `${city} Apartments`,
              address: {
                "@type": "PostalAddress",
                addressLocality: city,
                addressRegion: "TX",
                addressCountry: "US",
              },
            },
          }),
        }}
      />

      {/* ✅ Schema: Breadcrumbs */}
      <Script
        id={`breadcrumb-schema-${path}`}
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: baseUrl,
              },
              {
                "@type": "ListItem",
                position: 2,
                name: `${city} Apartments`,
                item: `${baseUrl}${breadcrumbApartmentsPath}`,
              },
              {
                "@type": "ListItem",
                position: 3,
                name: h1,
                item: canonical,
              },
            ],
          }),
        }}
      />

      {/* ===== PAGE CONTENT ===== */}
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "2.5rem 1.5rem 3.5rem",
          fontFamily: "'Inter', sans-serif",
          color: "#333",
        }}
      >
        {/* Breadcrumb UI */}
        <nav style={{ fontSize: "0.9rem", marginBottom: "1rem" }}>
          <Link href="/" style={{ color: "#2ecc71" }}>
            Home
          </Link>{" "}
          /{" "}
          <Link href={breadcrumbApartmentsPath} style={{ color: "#2ecc71" }}>
            {city} Apartments
          </Link>{" "}
          / <span>{h1}</span>
        </nav>

        <h1 style={{ fontSize: "2.2rem", fontWeight: 800 }}>{h1}</h1>

        <p style={{ fontSize: "1.05rem", lineHeight: 1.7 }}>{intro}</p>

        {/* Sections */}
        {sections.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "1.5rem",
              marginBottom: "2.5rem",
            }}
          >
            {sections.map((section) => (
              <div
                key={section.heading}
                style={{
                  backgroundColor: "#f7f7f7",
                  borderRadius: "10px",
                  padding: "1.2rem",
                }}
              >
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                  {section.heading}
                </h2>
                <ul style={{ paddingLeft: "1.1rem" }}>
                  {section.items.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        <div
          style={{
            backgroundColor: "#e8f7ee",
            borderRadius: "12px",
            padding: "1.5rem",
          }}
        >
          <h2 style={{ fontSize: "1.4rem", fontWeight: 700 }}>
            Get a free custom list for {city}
          </h2>
          <p>Share your budget and move date and I’ll send a curated list.</p>
          <Link
            href="/start-your-search"
            style={{
              backgroundColor: "#28a745",
              color: "#fff",
              padding: "0.8rem 1.6rem",
              borderRadius: "6px",
              fontWeight: 600,
            }}
          >
            Start Your Search
          </Link>
        </div>
      </div>
    </>
  );
};

export default CityCategoryPage;
