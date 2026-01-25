"use client";

import React from "react";
import ContactForm from "./ContactForm";
import ShareBlock from "./ShareBlock";
import ComparisonFAQ from "./ComparisonFAQ";
import "./ComparisonLayout.css";

/* =========================================
   TYPES
========================================= */

export interface ComparisonProperty {
  name: string;
  image: string;
  imageCaption?: string;
  address?: string;
  rent?: string;
  bedrooms?: string;
  neighborhood?: string;   // ✅ ADD
  propertyType?: string;   // ✅ ADD
  good: string[];
  bad: string[];
  ugly: string[];
  verdict?: string;
  tags?: string[]; // 👈 ADD THIS
}

interface ComparisonLayoutProps {
  title: string;
  subtitle?: string;
  cityName: string; // ✅ ADD THIS
  left: ComparisonProperty;
  right: ComparisonProperty;
}

/* =========================================
   MAIN LAYOUT
========================================= */

const DEFAULT_PROPERTY_IMAGE =
  "https://res.cloudinary.com/dxtiguwzm/image/upload/v1748277676/photos-coming-soon-lone-star-locators_be1dyx.jpg";

const ComparisonLayout: React.FC<ComparisonLayoutProps> = ({
  title,
  subtitle,
  cityName, // ✅ ADD THIS
  left,
  right,
}) => {


     /* ===============================
     SCHEMA — COMPARISON + FAQ (SEO / AI)
  =============================== */

  const comparisonSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `${left.name} vs ${right.name}`,
    "description": subtitle,
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": left.name,
        "item": {
          "@type": "Apartment",
          "name": left.name,
          "address": left.address,
          "offers": left.rent
            ? {
                "@type": "Offer",
                "price": left.rent,
                "priceCurrency": "USD",
              }
            : undefined,
        },
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": right.name,
        "item": {
          "@type": "Apartment",
          "name": right.name,
          "address": right.address,
          "offers": right.rent
            ? {
                "@type": "Offer",
                "price": right.rent,
                "priceCurrency": "USD",
              }
            : undefined,
        },
      },
    ],
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": `Which apartment is better: ${left.name} or ${right.name}?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `${left.name} is better for ${
            left.good[0] || "luxury features"
          }, while ${right.name} is better for ${
            right.good[0] || "space and privacy"
          } in ${cityName}.`,
        },
      },
      {
        "@type": "Question",
        "name": "How much do these apartments cost?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `${left.name} starts around ${
            left.rent || "varies"
          }, while ${right.name} starts around ${
            right.rent || "varies"
          }.`,
        },
      },
      {
        "@type": "Question",
        "name": "How do I get a cash rebate or free movers?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text":
            "List Jay Morris with AptAmigo on your application and report your lease after move-in to qualify for a cash rebate or free movers.",
        },
      },
    ],
  };
 
const reviewSchema = {
  "@context": "https://schema.org",
  "@type": "Review",
  "name": `${left.name} vs ${right.name} apartment comparison review`,
  "reviewBody":
    subtitle ||
    `${left.name} and ${right.name} are compared using a Good, Bad & Ugly review format by a licensed apartment locator.`,
  "author": {
    "@type": "Person",
    "name": "Jay Morris",
    "jobTitle": "Licensed Apartment Locator",
    "affiliation": {
      "@type": "Organization",
      "name": "Lone Star Locators"
    }
  },
  "publisher": {
    "@type": "Organization",
    "name": "Lone Star Locators"
  },
  "itemReviewed": {
    "@type": "ItemList",
    "name": `${left.name} vs ${right.name}`,
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "item": {
          "@type": "Apartment",
          "name": left.name,
          "address": left.address
        }
      },
      {
        "@type": "ListItem",
        "position": 2,
        "item": {
          "@type": "Apartment",
          "name": right.name,
          "address": right.address
        }
      }
    ]
  },
  "reviewAspect": [
    "Pros and Cons",
    "Pricing",
    "Neighborhood",
    "Property Type"
  ]
};


  return (
    <div className="comparison-layout">
      <div className="comparison-columns">
        {/* ================= MAIN CONTENT ================= */}
        <main className="comparison-main">
          {/* HEADER */}
          <header className="comparison-header">
            <h1 className="comparison-title">{title}</h1>
            {subtitle && <p className="comparison-subtitle">{subtitle}</p>}
          </header>

          {/* SEO SCHEMA — Comparison */}
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify(comparisonSchema),
  }}
/>

{/* SEO SCHEMA — FAQ */}
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify(faqSchema),
  }}
/>

{/* SEO SCHEMA — Review */}
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify(reviewSchema),
  }}
/>

          {/* ================= DESKTOP COMPARISON GRID ================= */}
<div className="comparison-grid desktop-only">
  <ComparisonTopCard property={left} />
  <ComparisonTopCard property={right} />

  <ComparisonRow
    title="The Good"
    color="#2e7d32"
    leftItems={left.good}
    rightItems={right.good}
  />

  <ComparisonRow
    title="The Bad"
    color="#e67e22"
    leftItems={left.bad}
    rightItems={right.bad}
  />

  <ComparisonRow
    title="The Ugly"
    color="#c62828"
    leftItems={left.ugly}
    rightItems={right.ugly}
  />

  {(left.verdict || right.verdict) && (
    <ComparisonVerdictRow
      leftText={left.verdict}
      rightText={right.verdict}
    />
  )}
</div>

{/* ================= MOBILE COMPARISON ================= */}
<div className="mobile-only">
  <MobilePropertyStack property={left} />
  <MobilePropertyStack property={right} />
</div>


{/* FAQs — SEO + Comparison */}
<ComparisonFAQ
  left={left}
  right={right}
  cityName={cityName}
/>

          {/* SHARE */}
          <div className="comparison-share">
            <ShareBlock />
          </div>
        </main>

        {/* ================= SIDEBAR ================= */}
        <aside className="comparison-sidebar">
          <div className="comparison-sidebar-card">
            <div className="rebateBox">
              Get up to a <strong>$200 Cash Rebate</strong> or <br />
              <strong>2 Hours of Free Movers!</strong>
            </div>

            <ContactForm mode="short" />

            <div className="comparison-definition-box">
              <div className="agentCard">
                <img
                  src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1748014964/jay-morris-free-apartment-locator-san-antonio-texas_pgf7fs.png"
                  alt="Jay Morris"
                />
                <p className="agentName">Licensed Agent: Jay Morris</p>
                <p className="agentDesc">
                  Helping renters find the perfect home.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

/* =========================================
   TOP CARD (IMAGE + META)
========================================= */

const ComparisonTopCard = ({
  property,
}: {
  property: ComparisonProperty;
}) => {
  return (
    <article className="comparison-card comparison-card-top">
<img
  src={
    property.image && property.image.trim() !== ""
      ? property.image
      : DEFAULT_PROPERTY_IMAGE
  }
  alt={property.name}
  className="comparison-image"
  onError={(e) => {
    e.currentTarget.src = DEFAULT_PROPERTY_IMAGE;
  }}
/>

      {property.imageCaption && (
        <p className="comparison-caption">{property.imageCaption}</p>
      )}

      <h2 className="comparison-property-name">{property.name}</h2>

      {property.address && (
        <p className="comparison-address">{property.address}</p>
      )}

      {property.rent && (
  <p className="comparison-detail">
    <strong>Rent:</strong> {property.rent}
  </p>
)}

{property.bedrooms && (
  <p className="comparison-detail">
    <strong>Bedrooms:</strong> {property.bedrooms}
  </p>
)}

{property.neighborhood && (
  <p className="comparison-detail">
    <strong>Neighborhood:</strong> {property.neighborhood}
  </p>
)}

{property.propertyType && (
  <p className="comparison-detail">
    <strong>Property Type:</strong> {property.propertyType}
  </p>
)}


{/* TAGS */}
{property.tags && property.tags.length > 0 && (
  <div className="comparison-tags">
    {property.tags.map((tag, i) => (
      <span key={i} className="comparison-tag">
        {tag}
      </span>
    ))}
  </div>
)}
    </article>
  );
};



/* =========================================
   ALIGNED ROW (GOOD / BAD / UGLY)
========================================= */

const ComparisonRow = ({
  title,
  color,
  leftItems,
  rightItems,
}: {
  title: string;
  color: string;
  leftItems: string[];
  rightItems: string[];
}) => {
  return (
    <>
      <section className="comparison-row-card">
        <h3 className="comparison-row-title" style={{ color }}>
          {title}
        </h3>
        <ul className={`comparison-row-list comparison-${title.toLowerCase().replace(" ", "-")}-list`}>
  {leftItems.map((item, i) => (
    <li key={i} className="comparison-point">
      {item}
    </li>
  ))}
</ul>

      </section>

      <section className="comparison-row-card">
        <h3 className="comparison-row-title" style={{ color }}>
          {title}
        </h3>
        <ul className={`comparison-row-list comparison-${title.toLowerCase().replace(" ", "-")}-list`}>
  {rightItems.map((item, i) => (
    <li key={i} className="comparison-point">
      {item}
    </li>
  ))}
</ul>
      </section>
    </>
  );
};

/* =========================================
   VERDICT ROW
========================================= */

const ComparisonVerdictRow = ({
  leftText,
  rightText,
}: {
  leftText?: string;
  rightText?: string;
}) => {
  return (
    <>
      <section className="comparison-row-card">
        <h4 className="comparison-verdict-title">Who this is best for</h4>
        <p className="comparison-verdict-text">{leftText || ""}</p>
      </section>

      <section className="comparison-row-card">
        <h4 className="comparison-verdict-title">Who this is best for</h4>
        <p className="comparison-verdict-text">{rightText || ""}</p>
      </section>
    </>
  );
};

/* =========================================
   MOBILE PROPERTY STACK (MOBILE ONLY)
========================================= */

const MobilePropertyStack = ({
  property,
}: {
  property: ComparisonProperty;
}) => {
  return (
    <section className="mobile-property-stack">
      {/* IMAGE + META */}
      <ComparisonTopCard property={property} />

      {/* GOOD */}
      <h3 className="mobile-good">The Good</h3>
      <ul className="comparison-row-list comparison-the-good-list">
        {property.good.map((item, i) => (
          <li key={i} className="comparison-point">{item}</li>
        ))}
      </ul>

      {/* BAD */}
      <h3 className="mobile-bad">The Bad</h3>
      <ul className="comparison-row-list comparison-the-bad-list">
        {property.bad.map((item, i) => (
          <li key={i} className="comparison-point">{item}</li>
        ))}
      </ul>

      {/* UGLY */}
      <h3 className="mobile-ugly">The Ugly</h3>
      <ul className="comparison-row-list comparison-the-ugly-list">
        {property.ugly.map((item, i) => (
          <li key={i} className="comparison-point">{item}</li>
        ))}
      </ul>
    </section>
  );
};


export default ComparisonLayout;
