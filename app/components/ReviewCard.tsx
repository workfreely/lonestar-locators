import React from "react";
import Link from "next/link";

interface ReviewCardProps {
  review: {
    name: string;
    slug: string;
    city_slug: string;
    neighborhood: string;
    image?: string;
    property_type?: string;
    review_link?: string | null; // Supabase field
  };
  defaultImage: string;
}

const ReviewCard: React.FC<ReviewCardProps> = ({ review, defaultImage }) => {
  // ✅ SINGLE SOURCE OF TRUTH: Supabase
  const href =
  review.review_link ??
  `/${review.city_slug}/apartments/reviews/${review.slug}`;

  // ✅ Normalize + capitalize property type for SEO/UI
  const displayPropertyType =
    review.property_type
      ? review.property_type
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : null;

  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <div
        className="card"
        style={{
          borderRadius: "10px",
          overflow: "hidden",
          backgroundColor: "#fff",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          transition: "transform 0.25s ease, box-shadow 0.25s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.03)";
          e.currentTarget.style.boxShadow =
            "0 6px 14px rgba(0, 0, 0, 0.12)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow =
            "0 2px 8px rgba(0,0,0,0.06)";
        }}
      >
        {/* ✅ Image (safe fallback, same behavior as ListingCard) */}
        <img
          src={
            review.image && review.image.trim() !== ""
              ? review.image
              : defaultImage
          }
          alt={review.name}
          loading="lazy"
          className="listing-image"
          style={{
            width: "100%",
            height: "260px",
            objectFit: "cover",
          }}
        />

        <div style={{ padding: "1rem 1.25rem" }}>
          {/* Title */}
          <h3
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              margin: "0 0 0.35rem",
              color: "#222",
            }}
          >
            {review.name}
          </h3>

          {/* Neighborhood */}
          <p
            style={{
              margin: "0 0 0.6rem",
              color: "#666",
              fontSize: "0.95rem",
            }}
          >
            Neighborhood: {review.neighborhood}
          </p>

          {/* Tags */}
          <div
  style={{
    marginTop: "0.5rem",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.4rem",
  }}
>
  <span
    className="tag"
    style={{
      backgroundColor: "#f5f5f5",
      color: "#555",
      fontSize: "0.8rem",
      padding: "0.25rem 0.5rem",
      borderRadius: "4px",
    }}
  >
    {displayPropertyType ?? "Apartment"}
  </span>

  <span
    className="tag"
    style={{
      backgroundColor: "#f5f5f5",
      color: "#555",
      fontSize: "0.8rem",
      padding: "0.25rem 0.5rem",
      borderRadius: "4px",
    }}
  >
    Review
  </span>

  <span
    className="tag"
    style={{
      backgroundColor: "#f5f5f5",
      color: "#555",
      fontSize: "0.8rem",
      padding: "0.25rem 0.5rem",
      borderRadius: "4px",
    }}
  >
    Good / Bad / Ugly
  </span>
</div>

        </div>
      </div>
    </Link>
  );
};

export default ReviewCard;
