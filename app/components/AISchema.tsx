"use client";

import Script from "next/script";

interface AISchemaProps {
  city?: string;
}

export default function AISchema({ city }: AISchemaProps) {
  const baseUrl = "https://www.lonestarlocators.app";

  // ✅ Safe fallback (prevents runtime crash)
  const safeCity = city ?? "Texas";

  const summaries: Record<string, string> = {
  Austin:
    "Find luxury apartments, townhomes, and penthouses in Austin, TX with move-in specials, free movers, and up to $200 cash back.",
  Dallas:
    "Explore luxury apartments, townhomes, and high-rises in Dallas, TX with exclusive move-in specials and rebates.",
  Houston:
    "Discover luxury apartments, modern townhomes, and penthouses in Houston, TX with move-in specials and cash back rebates.",
  "San Antonio":
    "Apartment locating service in San Antonio, TX for luxury apartments, townhomes, and second chance rentals with rebates and free movers.",
  Texas:
    "Free apartment locating service across Texas including Austin, Dallas, Houston, and San Antonio with rebates and free movers.",
};


  const serviceTags = [
    `Apartment Locator ${safeCity}`,
    `Apartment Finder ${safeCity}`,
    `Free Apartment Locator ${safeCity}`,
    `Luxury Apartments ${safeCity}`,
    `Townhome Locator ${safeCity}`,
    `Penthouse Finder ${safeCity}`,
    `Second Chance Apartments ${safeCity}`,
  ];

  const schema = {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    name: `Lone Star Locators - ${safeCity}`,
    url: `${baseUrl}/${safeCity.toLowerCase().replace(/\s+/g, "-")}`,
    areaServed: safeCity === "Texas" ? "Texas, USA" : `${safeCity}, TX`,
    keywords: serviceTags,
    description:
      summaries[safeCity] ||
      `Free apartment locating in ${safeCity}, TX.`,
  };

  return (
    <Script
      id={`ai-schema-${safeCity.toLowerCase().replace(/\s+/g, "-")}`}
      type="application/ld+json"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(schema),
      }}
    />
  );
}
