"use client";

import React from "react";
import ListingCard from "./ListingCard";

const FeaturedProperties: React.FC = () => {
  const featuredListings = [
    {
      name: "300 Main",
      slug: "300-main",
      href: "/san-antonio/apartments/300-main",
      city_slug: "san-antonio", // ✅ REQUIRED
      neighborhood: "Downtown",
      region: "San Antonio",
      image: "",
      price: "$1,650+",
      priceValue: 1650,
      beds: "0 - 2",
      baths: "1 - 2",
      propertyType: "Apartment",
      tags: ["Luxury", "Downtown", "High-Rise"],
      special: "1 Month Free on Select Units!",
      rebate: "Get a Cash Rebate or Free Movers",
    },
    {
      name: "Oasis at Stone Oak",
      slug: "oasis-at-stone-oak",
      href: "/san-antonio/apartments/oasis-at-stone-oak",
      city_slug: "san-antonio", // ✅ REQUIRED
      neighborhood: "Stone Oak",
      region: "San Antonio",
      image: "",
      price: "$1,600+",
      priceValue: 1600,
      beds: "2 - 3",
      baths: "2 - 2.5",
      propertyType: "Townhome",
      tags: ["Luxury", "Townhome", "Stone Oak"],
      special: "8 Weeks free on a 14-month lease!",
      rebate: "Get a Cash Rebate or Free Movers",
    },
    {
      name: "Collection Schertz Station",
      slug: "collection-schertz-station",
      city_slug: "san-antonio", // ✅ REQUIRED
      href: "/san-antonio/apartments/collection-schertz-station",
      neighborhood: "Schertz",
      region: "San Antonio",
      image: "",
      price: "$1,750+",
      priceValue: 1750,
      beds: "2 - 3",
      baths: "2 - 2.5",
      propertyType: "Townhome",
      tags: ["Luxury", "Schertz", "Townhome"],
      special: "Move-In Specials Available!",
      rebate: "Get a Cash Rebate or Free Movers",
    },
  ];

  const defaultImage =
    "https://res.cloudinary.com/dxtiguwzm/image/upload/v1748277676/photos-coming-soon-lone-star-locators_be1dyx.jpg";

  return (
    <section id="featured-wrap">
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
        Hand-picked communities chosen for lifestyle and value. We’ll confirm pricing and incentives before you apply.
      </p>

<div className="apartment-listings-page">
  <div style={{ padding: ".5rem", fontFamily: "'Inter', sans-serif" }}>
    <div className="card-grid">
      {featuredListings.map((listing) => {
        const href =
          listing.href || `/san-antonio/apartments/${listing.slug}`;

        return (
          <ListingCard
            key={listing.slug}
            listing={{
              ...listing,
              href,
            }}
            defaultImage={defaultImage}
          />
        );
      })}
    </div>
  </div>
</div>

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
