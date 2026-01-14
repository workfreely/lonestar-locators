// app/components/BlogCard.tsx
"use client";

import React from "react";
import Link from "next/link";
import Script from "next/script";
import Image from "next/image";


const BlogCard = ({
  title, 
  imageUrl,
  excerpt,
  tags = [],
  postUrl = "",
  date,
}) => {
  const placeholderImage =
  "https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937030/lone-star-locators-san-antonio-texas-free-apartment-locating_trgkaj.jpg";


  // 🧠 Determine city from the URL to apply default tags
  const cityFromUrl = (() => {
    if (postUrl.includes("/austin/")) return "Austin";
    if (postUrl.includes("/dallas/")) return "Dallas";
    if (postUrl.includes("/houston/")) return "Houston";
if (postUrl.includes("/san-antonio/")) return "San Antonio";

    return "Texas";
  })();

  const defaultTagsMap = {
    Austin: ["Austin", "Luxury", "Pet-Friendly"],
    Dallas: ["Dallas", "Luxury", "Pet-Friendly"],
    Houston: ["Houston", "Luxury", "Pet-Friendly"],
    "San Antonio": ["San Antonio", "Luxury", "Pet-Friendly"],
    Texas: ["Texas", "Luxury", "Pet-Friendly"],
  };

 const normalizeTags = (tags: string[], city: string) => {
  // Always enforce exactly 3 clean UI tags
  return [
    "Luxury",
    "Apartments",
    city,
  ];
};

const displayTags = Array.isArray(tags) ? tags.slice(0, 3) : [];

  const schemaId = `blog-schema-${postUrl.replace(/\W+/g, "-")}`;

// ✅ Supabase + fallback-safe image resolver
const getOptimizedImage = (url?: string) => {
  // 🔹 Always fall back to placeholder
  if (!url) return placeholderImage;

  // 🔹 Optimize Supabase images
  if (url.includes("supabase.co")) {
    return `${url}?width=800&height=450&resize=cover&quality=80&format=webp`;
  }

  // 🔹 Cloudinary or other CDN images (already optimized)
  return url;
};


  return (
    <>
      <Link
        href={postUrl}
        style={{ textDecoration: "none", color: "inherit" }}
      >
        <div
          className="blog-card"
          style={{
            borderRadius: "8px",
            overflow: "hidden",
            boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
            transition: "transform 0.3s ease, box-shadow 0.3s ease",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.03)";
            e.currentTarget.style.boxShadow =
              "0 8px 16px rgba(0,0,0,0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow =
              "0 4px 8px rgba(0,0,0,0.1)";
          }}
        >
         {/* Image */}
<img
  src={getOptimizedImage(imageUrl)}
  alt={title}
  loading="lazy"
  style={{
    width: "100%",
    height: "150px",
    objectFit: "cover",
    display: "block",
    backgroundColor: "#f0f0f0",
  }}
  onError={(e) => {
    const target = e.currentTarget;
    if (target.src !== placeholderImage) {
      target.src = placeholderImage;
    }
  }}
/>

          {/* Content */}
          <div style={{ padding: "1rem" }}>
            <h3
              style={{
                marginBottom: "0.5rem",
                fontSize: "1.25rem",
                color: "#333",
              }}
            >
              {title}
            </h3>

            <p
              style={{
                fontSize: "0.95rem",
                color: "#666",
                marginBottom: "0.75rem",
              }}
            >
              {excerpt}
            </p>

            {/* Tags */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {displayTags.map((tag, index) => (
                <span
                  key={index}
                  style={{
                    backgroundColor: "#f5f5f5",
                    padding: "6px 10px",
                    borderRadius: "4px",
                    fontSize: "0.9rem",
                    color: "#333",
                    border: "1px solid #ddd",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Link>

      {/* ✅ Schema Markup (Next.js safe) */}
      <Script
        id={schemaId}
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: title,
            description: excerpt,
            datePublished: date || "2025-09-27",
            author: {
              "@type": "Organization",
              name: "Lone Star Locators",
              url: "https://www.lonestarlocators.app",
            },
            publisher: {
              "@type": "Organization",
              name: "Lone Star Locators",
              logo: {
                "@type": "ImageObject",
                url: "https://res.cloudinary.com/dxtiguwzm/image/upload/v1748277676/logo-lone-star-locators.png",
              },
            },
            mainEntityOfPage: {
              "@type": "WebPage",
              "@id": `https://www.lonestarlocators.app${postUrl}`,
            },
            image: imageUrl || placeholderImage,
          }),
        }}
      />
    </>
  );
};

export default BlogCard;
