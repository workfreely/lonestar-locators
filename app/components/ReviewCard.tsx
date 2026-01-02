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
  const href = review.review_link
    ? review.review_link
    : `/${review.city_slug}/apartments/${review.slug}`;

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
      >
        <img
          src={review.image || defaultImage}
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

          <p
            style={{
              margin: "0 0 0.6rem",
              color: "#666",
              fontSize: "0.95rem",
            }}
          >
            Neighborhood: {review.neighborhood}
          </p>

          <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
            {review.property_type && (
              <span className="tag">{review.property_type}</span>
            )}
            <span className="tag">Review</span>
            <span className="tag">Good/Bad/Ugly</span>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default ReviewCard;
