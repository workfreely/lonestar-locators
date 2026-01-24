"use client";

import React from "react";
import Link from "next/link";
import BlogCard from "./BlogCard";

interface CityBlogLayoutProps {
  cityName: string;
  posts: any[];
  categories?: string[];
}

export default function CityBlogLayout({
  cityName,
  posts,
  categories = [
    "Apartment Reviews",
    "Neighborhood Guides",
    "Move-In Specials",
  ],
}: CityBlogLayoutProps) {
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://www.lonestarlocators.app",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog",
        item: "https://www.lonestarlocators.app/blog",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: cityName,
        item: `https://www.lonestarlocators.app/${cityName
          .toLowerCase()
          .replace(/\s+/g, "-")}/blog`,
      },
    ],
  };

  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "0rem 1rem 2rem",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Breadcrumb Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbSchema),
        }}
      />

      {/* Breadcrumb UI */}
      <nav
        style={{
          fontSize: "0.9rem",
          marginBottom: "1rem",
          color: "#666",
        }}
      >
        <Link
          href="/"
          style={{
            textDecoration: "none",
            color: "#2e7d32",
            fontWeight: 600,
          }}
        >
          Home
        </Link>
        {" / "}
        <Link
          href="/blog"
          style={{
            textDecoration: "none",
            color: "#2e7d32",
            fontWeight: 600,
          }}
        >
          Blog
        </Link>
        {" / "}
        <span style={{ color: "#333", fontWeight: 500 }}>{cityName}</span>
      </nav>

      {/* Title */}
      <h1
        style={{
          fontSize: "2.5rem",
          fontWeight: 800,
          marginBottom: "0.75rem",
          color: "#111",
          textAlign: "left",
        }}
      >
        {cityName} Apartment Blog
      </h1>

      {/* Categories */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          marginBottom: "2rem",
        }}
      >
        {categories.map((cat) => (
          <span
            key={cat}
            style={{
              backgroundColor: "#f5f5f5",
              padding: "8px 14px",
              borderRadius: "6px",
              fontSize: "0.9rem",
              fontWeight: 500,
              color: "#333",
              border: "1px solid #ddd",
              cursor: "pointer",
            }}
          >
            {cat}
          </span>
        ))}
      </div>

      {/* Description */}
      <p
        style={{
          fontSize: "1.1rem",
          color: "#555",
          maxWidth: "760px",
          marginBottom: "2.5rem",
        }}
      >
        In depth apartment guides and comparisons coming soon {cityName}.
      </p>

   {/* Blog Grid */}
<div
  className="city-blog-grid"
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)", // Desktop default
    gap: "1.75rem",
  }}
>
  {posts.map((post, index) => (
    <BlogCard key={index} {...post} />
  ))}
</div>
    </div>
  );
}
