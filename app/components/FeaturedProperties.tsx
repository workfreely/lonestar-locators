"use client";

import React from "react";
import ListingCard from "./ListingCard";

const FeaturedProperties: React.FC = () => {
  const featuredListings = [
    {
      name: "300 Main",
      slug: "300-main",
      href: "/san-antonio/apartments/300-main",
      city_slug: "san-antonio",
      neighborhood: "Downtown",
      region: "San Antonio",
      image: "",
      price: "$1,650+",
      beds: "0 - 2",
      baths: "1 - 2",
      tags: ["Luxury", "Downtown", "High-Rise"],
      special: "1 Month Free on Select Units!",
    },
    {
      name: "Oasis at Stone Oak",
      slug: "oasis-at-stone-oak",
      href: "/san-antonio/apartments/oasis-at-stone-oak",
      city_slug: "san-antonio",
      neighborhood: "Stone Oak",
      region: "San Antonio",
      image: "",
      price: "$1,600+",
      beds: "2 - 3",
      baths: "2 - 2.5",
      tags: ["Luxury", "Townhome", "Stone Oak"],
      special: "8 Weeks free on a 14-month lease!",
    },
    {
      name: "Collection Schertz Station",
      slug: "collection-schertz-station",
      href: "/san-antonio/apartments/collection-schertz-station",
      city_slug: "san-antonio",
      neighborhood: "Schertz",
      region: "San Antonio",
      image: "",
      price: "$1,750+",
      beds: "2 - 3",
      baths: "2 - 2.5",
      tags: ["Luxury", "Schertz", "Townhome"],
      special: "Move-In Specials Available!",
    },
  ];

  const defaultImage =
    "https://res.cloudinary.com/dxtiguwzm/image/upload/v1748277676/photos-coming-soon-lone-star-locators_be1dyx.jpg";

  return (
    <section
      id="featured-wrap"
      style={{
        maxWidth: "1200px",
        margin: "3rem auto",
        padding: "0 1rem",
      }}
    >
      {/* HEADER */}
      <h2
        style={{
          fontSize: "2rem",
          fontWeight: 800,
          marginBottom: "0.5rem",
          color: "#222",
          textAlign: "center",
        }}
      >
        Properties We’re Recommending in San Antonio
      </h2>

      <p
        style={{
          fontSize: "1.1rem",
          color: "#555",
          marginBottom: "2rem",
          textAlign: "center",
        }}
      >
        Hand-picked communities chosen for lifestyle and value. We’ll confirm
        pricing and incentives before you apply.
      </p>

      {/* GRID — THIS IS THE KEY */}
      <div className="card-grid">
        {featuredListings.map((listing) => (
          <ListingCard
            key={listing.slug}
            listing={listing}
            defaultImage={defaultImage}
          />
        ))}
      </div>

      {/* CTA */}
      <div style={{ marginTop: "2.5rem", textAlign: "center" }}>
        <a
          href="/san-antonio/apartments"
          className="start-your-search-btn"
        >
          View All San Antonio Listings →
        </a>
      </div>
    </section>
  );
};

export default FeaturedProperties;
