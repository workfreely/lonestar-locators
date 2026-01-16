// /src/components/BlogLayout.tsx
"use client";

import React from "react";
import Script from "next/script";
import { FaFacebook, FaTwitter, FaLinkedin, FaGift } from "react-icons/fa";
import ShareBlock from "@/app/components/ShareBlock";
import ContactForm from "./ContactForm";

interface BlogLayoutProps {
  title: string;
  content: React.ReactNode;
  faqs?: { question: string; answer: string }[];
  publishDate?: string;
  keywords?: string[];
  ctaType?: "apartment" | "newhome" | "home";
 schemaType?: "BlogPosting" | "Article" | "ApartmentComplex" | "Place" | "Service";
  address?: {
    streetAddress?: string;
    addressLocality: string;
    addressRegion: string;
    postalCode?: string;
    addressCountry?: string;
  };
}

const BlogLayout = ({
  title,
  content,
  faqs = [],
  publishDate,
  keywords = [],
  ctaType = "apartment",
  schemaType = "BlogPosting",
  address,
}: BlogLayoutProps) => {

  const schemaMarkup: any = {
    "@context": "https://schema.org",
    "@type": schemaType,
    headline: title,
    author: {
      "@type": "Person",
      name: "Jay Morris",
    },
    description: `Content titled "${title}" by Jay Morris.`,
    keywords: keywords.join(", "),
  };

  // ✅ Attach address when provided (Service / Place schema support)
if (address) {
  schemaMarkup.address = {
    "@type": "PostalAddress",
    ...address,
  };
}

  // ✅ Only include datePublished when it exists
  if (publishDate) {
    schemaMarkup.datePublished = publishDate;
  }

const faqSchema =
  faqs.length > 0
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      }
    : null;


  return (
    
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "40px 20px",
        fontFamily: "'Inter', sans-serif",
        lineHeight: "1.7",
        fontSize: "18px",
        color: "#333",
      }}
    >
      {/* ✅ SAFE JSON-LD */}
      <Script
        id="blog-schema"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(schemaMarkup),
        }}
      />


{/* ✅ FAQ SCHEMA (only when FAQs exist) */}
{faqSchema && (
  <Script
    id="faq-schema"
    type="application/ld+json"
    strategy="afterInteractive"
    dangerouslySetInnerHTML={{
      __html: JSON.stringify(faqSchema),
    }}
  />
)}

      {/* MAIN LAYOUT */}
      <div className="blog-layout">
        {/* LEFT COLUMN */}
        <div className="blog-main">
          {/* TITLE */}
          <h1
  style={{
    fontSize: "36px",
    fontWeight: 800,
    textAlign: "left", // ✅ aligns with AI Locator
    marginBottom: publishDate ? "0.75rem" : "2rem", // ✅ spacing logic
  }}
>
  {title}
</h1>


          {/* OPTIONAL PUBLISH DATE */}
          {publishDate && (
            <p
              style={{
                color: "#666",
                fontSize: "14px",
                marginBottom: "2.25rem",
              }}
            >
              Published on{" "}
              {new Date(publishDate).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          )}

          {/* CONTENT */}
          <div
            style={{
              maxWidth: "720px",
              lineHeight: "1.75",
              fontSize: "1rem",
            }}
          >
            <div className="blog-content">{content}</div>
          </div>

          {/* FAQ */}
          {faqs.length > 0 && (
            <div style={{ marginTop: "3rem" }}>
              <h2
                style={{
                  fontSize: "2rem",
                  fontWeight: 800,
                  marginBottom: "1rem",
                  color: "#111",
                }}
              >
                Frequently Asked Questions
              </h2>

              {faqs.map((faq, index) => (
                <details
                  key={index}
                  style={{
                    marginBottom: "10px",
                    padding: "12px 18px",
                    border: "1px solid #ddd",
                    borderRadius: "6px",
                    backgroundColor: "#fafafa",
                  }}
                >
                  <summary
                    style={{
                      fontWeight: 600,
                      cursor: "pointer",
                      fontSize: "1.05rem",
                    }}
                  >
                    {faq.question}
                  </summary>
                  <div
                    style={{ marginTop: "8px", color: "#555" }}
                    dangerouslySetInnerHTML={{ __html: faq.answer }}
                  />
                </details>
              ))}
            </div>
          )}

          {/* AUTHOR */}
          <div
            style={{
              marginTop: "3rem",
              padding: "1.5rem",
              backgroundColor: "#fafafa",
              borderTop: "2px solid #ddd",
              borderRadius: "8px",
              display: "flex",
              gap: "15px",
              alignItems: "center",
            }}
          >
            <img
              src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1748014964/jay-morris-free-apartment-locator-san-antonio-texas_pgf7fs.png"
              alt="Jay Morris"
              style={{
                width: "80px",
                height: "80px",
                borderRadius: "50%",
                objectFit: "cover",
                border: "2px solid #ddd",
              }}
            />
            <div style={{ lineHeight: "1.6", color: "#555", fontSize: "15px" }}>
              <strong>Jay Morris</strong> is a{" "}
              <strong>licensed real estate agent</strong> and local{" "}
              <strong>luxury apartment locator</strong> helping clients find
              luxury apartments, second chance leasing, and the best move-in
              specials in Texas.
            </div>
          </div>

        {/* CTA */}
<div
  style={{
    marginTop: "3rem",
    padding: "2rem",
    backgroundColor: "#ecf8ee",
    border: "1px solid #cde9d6",
    borderRadius: "10px",
    textAlign: "center",
  }}
>
  <h2
    style={{
      fontSize: "32px",
      marginBottom: "1rem", // slightly tighter
      fontWeight: 800,
    }}
  >
    Ready to tour your apartment?
  </h2>

  {/* ✅ NEW SUPPORTING LINE */}
  <p
    style={{
      fontSize: "1.1rem",
      color: "#333",
      marginBottom: "1.75rem",
      lineHeight: "1.7",
      maxWidth: "720px",
      marginInline: "auto",
    }}
  >
    I’ll help you find the best deals, cash rebates, or free movers.
  </p>

  <a
    href="/start-your-search"
    style={{
      backgroundColor: "#2e7d32",
      color: "#fff",
      padding: "12px 28px",
      borderRadius: "8px",
      textDecoration: "none",
      fontWeight: 600,
      display: "inline-block",
    }}
  >
    Start Your Search
  </a>
</div>

          {/* SOCIAL SHARE */}
       <div
  style={{
    maxWidth: "720px",
    margin: "3rem auto 0",
  }}
>
  <ShareBlock />
</div>
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="blog-sidebar">
          {/* REBATE BOX */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              gap: "0.75rem",
              padding: "1.25rem",
              backgroundColor: "#e8f7ec",
              border: "1px solid #bde5c8",
              borderRadius: "10px",
              color: "#1e7a3c",
              fontSize: "1.05rem",
              lineHeight: "1.5",
              textAlign: "center",
              marginBottom: "0.5rem",
            }}
          >
            <FaGift style={{ fontSize: "1.3rem", marginTop: "0.15rem" }} />
            <span>
              <strong>Get up to a $200 Cash Rebate</strong>
              <br />
              <strong>or 2 Hours of Free Movers</strong>
            </span>
          </div>

          <ContactForm mode="short" />

          {/* AGENT CARD */}
          <div
            style={{
              backgroundColor: "#fff",
              padding: "1.25rem",
              borderRadius: "10px",
              border: "1px solid #e4e4e4",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              textAlign: "center",
              marginTop: "2rem",
            }}
          >
            <img
              src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1748014964/jay-morris-free-apartment-locator-san-antonio-texas_pgf7fs.png"
              alt="Jay Morris"
              style={{
                width: "95px",
                height: "95px",
                borderRadius: "50%",
                objectFit: "cover",
                margin: "0 auto 0.75rem auto",
              }}
            />
            <p style={{ fontWeight: 700, fontSize: "1.2rem" }}>
              Licensed Agent: Jay Morris
            </p>
            <p style={{ fontSize: "0.95rem", color: "#666", margin: 0 }}>
              Helping renters find the perfect home.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlogLayout;
