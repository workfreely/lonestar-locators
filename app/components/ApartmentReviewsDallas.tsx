"use client";

import { useState, useEffect } from "react";
import "@/app/styles/apartmentlistings.css";
import SchemaItemList from "@/app/components/SchemaItemList";
import AISchema from "@/app/components/AISchema";
import ReviewCard from "@/app/components/ReviewCard";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ukkxisleiprdpptaaxcs.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVra3hpc2xlaXByZHBwdGFheGNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NTA3MTgsImV4cCI6MjA3NDQyNjcxOH0.2toax3wY19COqPtJh64qpRcvYNlnFIndI_27og8jp-4";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const defaultImage =
  "https://res.cloudinary.com/dxtiguwzm/image/upload/v1748277676/photos-coming-soon-lone-star-locators_be1dyx.jpg";

export default function ApartmentReviewsDallas() {
  /* ================================
     CITY-SPECIFIC DATA
     ================================ */
  const allNeighborhoods = [
    "Downtown Dallas",
    "Uptown",
    "Deep Ellum",
    "Bishop Arts District",
    "Knox-Henderson",
    "Oak Lawn",
    "Design District",
    "Victory Park",
    "Lower Greenville",
    "Trinity Groves",
  ];

  const allSubmarkets: string[] = [];

  /* ================================
     FILTER STATE
     ================================ */
  const [filters, setFilters] = useState({
    q: "",
    beds: "",
    baths: "",
    price: "",
    propertyType: "",
    neighborhoods: [] as string[],
    submarkets: [] as string[],
  });

  /* ================================
     FILTER HANDLER
     ================================ */
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;

    if (
      type === "checkbox" &&
      name === "neighborhoods" &&
      e.target instanceof HTMLInputElement
    ) {
      const { checked } = e.target;
      const updated = checked
        ? [...filters.neighborhoods, value]
        : filters.neighborhoods.filter((n) => n !== value);

      setFilters({ ...filters, neighborhoods: updated });
      return;
    }

    if (
      type === "checkbox" &&
      name === "submarkets" &&
      e.target instanceof HTMLInputElement
    ) {
      const { checked } = e.target;
      const updated = checked
        ? [...filters.submarkets, value]
        : filters.submarkets.filter((s) => s !== value);

      setFilters({ ...filters, submarkets: updated });
      return;
    }

    setFilters((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  /* ================================
     PRICE RANGES
     ================================ */
  const priceRanges: { [key: string]: [number, number] } = {
    "under-1000": [0, 999],
    "1000-1100": [1000, 1100],
    "1100-1200": [1100, 1200],
    "1200-1300": [1200, 1300],
    "1300-1400": [1300, 1400],
    "1400-1500": [1400, 1500],
    "1500-1600": [1500, 1600],
    "1600-1700": [1600, 1700],
    "1700-1800": [1700, 1800],
    "1800-1900": [1800, 1900],
    "1900-2000": [1900, 2000],
    "2000+": [2001, Infinity],
  };

  /* ================================
     DATA FETCH
     ================================ */
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchListings = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("dallas_listings")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error.message);
        setLoading(false);
        return;
      }

      const withDefaults = (data || []).map((listing) => ({
        ...listing,
        image: listing.image || defaultImage,
        gallery_images: listing.gallery_images || defaultImage,
      }));

      setListings(withDefaults);
      setLoading(false);
    };

    fetchListings();
  }, []);

  /* ================================
     FILTER LOGIC
     ================================ */
  const filteredListings = listings.filter((listing) => {
    const { q, beds, baths, price, propertyType, neighborhoods } = filters;

    const matchQuery =
      !q || listing.name?.toLowerCase().includes(q.toLowerCase());

    const parseRange = (val: any): [number, number] => {
      if (!val) return [0, 0];
      const str = val.toString().toLowerCase();
      if (str.includes("studio")) return [0, 0];
      const nums = str.match(/\d+/g)?.map(Number) || [];
      if (nums.length === 1) return [nums[0], nums[0]];
      if (nums.length >= 2) return [nums[0], nums[nums.length - 1]];
      return [0, 0];
    };

    const rawBeds = listing.beds || listing.bedrooms || "";
    const [listingMinBeds, listingMaxBeds] =
      rawBeds.toString().toLowerCase().includes("studio") ||
      rawBeds === "0" ||
      rawBeds === 0
        ? [0, 0]
        : parseRange(rawBeds);

    const numericBeds = beds ? parseInt(beds, 10) : null;

    const matchBeds =
      propertyType === "Studio"
        ? true
        : numericBeds === null ||
          (numericBeds >= listingMinBeds &&
            numericBeds <= listingMaxBeds);

    const normalize = (str: string) =>
      str.toLowerCase().replace(" dallas", "").replace(" tx", "").trim();

    const matchNeighborhoods =
      neighborhoods.length === 0 ||
      neighborhoods.includes("All of Dallas") ||
      neighborhoods.some(
        (n) => normalize(listing.neighborhood || "") === normalize(n)
      );

    let matchPropertyType = true;

if (propertyType && propertyType !== "Open to All") {
  const propertyTypeText = (listing.property_type || "").toLowerCase();
  const tagsText =
    typeof listing.tags === "string"
      ? listing.tags.toLowerCase()
      : "";

  if (propertyType === "Studio") {
    // ✅ Studio = Apartments only (no townhomes, no rental homes)
    matchPropertyType =
      propertyTypeText.includes("apartment") ||
      tagsText.includes("apartment");
  } else {
    const typeLower = propertyType.toLowerCase();
    matchPropertyType =
      propertyTypeText.includes(typeLower) ||
      tagsText.includes(typeLower);
  }
}

    return (
      matchQuery &&
      matchBeds &&
      matchNeighborhoods &&
      matchPropertyType
    );
  });

  /* ================================
     RENDER
     ================================ */
  return (
    <div style={{ padding: ".5rem", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 0.5rem" }}>
        <h1
          style={{
            fontSize: "2rem",
            marginBottom: "1.5rem",
            color: "#222",
            fontWeight: 700,
            textAlign: "left",
          }}
        >
          Dallas Apartment Reviews
        </h1>
      </div>

      <SchemaItemList city="Dallas" listings={listings} />
      <AISchema city="Dallas" listings={listings} />

      {/* SEARCH BAR */}
      <div
        className="search-bar"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1.5rem",
          padding: "1.1rem 1.25rem",
          backgroundColor: "#f9f9f9",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: "12px",
          boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
        }}
      >
        <input
          type="text"
          name="q"
          placeholder="Property Name Search"
          value={filters.q}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, q: e.target.value }))
          }
          style={{
            minWidth: "220px",
            padding: "0.55rem 0.6rem",
            borderRadius: "6px",
            border: "1px solid #ccc",
            fontSize: "0.95rem",
          }}
        />

        <select
          name="propertyType"
          value={filters.propertyType}
          onChange={(e) =>
            setFilters((prev) => ({
              ...prev,
              propertyType: e.target.value,
            }))
          }
        >
          <option value="">Property Type</option>
          <option value="Studio">Studio</option>
          <option value="Apartment">Apartment</option>
          <option value="Townhome">Townhome</option>
          <option value="Rental Home">Rental Home</option>
          <option value="Penthouse">Penthouse</option>
          <option value="Open to All">Open to All</option>
        </select>

        <button
          type="button"
          className="search-button"
          onClick={() =>
            setFilters({
              q: "",
              beds: "",
              baths: "",
              price: "",
              propertyType: "",
              neighborhoods: [],
              submarkets: [],
            })
          }
        >
          Reset Filters
        </button>

        {/* Neighborhoods */}
        <div style={{ flexBasis: "100%", marginTop: ".25rem" }}>
          <label style={{ fontWeight: "bold", display: "block" }}>
            Neighborhoods
          </label>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
            <label>
              <input
                type="checkbox"
                name="neighborhoods"
                value="All of Dallas"
                checked={filters.neighborhoods.includes("All of Dallas")}
                onChange={(e) => {
                  const { checked } = e.target;
                  if (checked) {
                    setFilters({
                      ...filters,
                      neighborhoods: ["All of Dallas", ...allNeighborhoods],
                    });
                  } else {
                    setFilters({ ...filters, neighborhoods: [] });
                  }
                }}
              />
              All of Dallas
            </label>

            {allNeighborhoods.map((neighborhood) => (
              <label key={neighborhood}>
                <input
                  type="checkbox"
                  name="neighborhoods"
                  value={neighborhood}
                  checked={
                    filters.neighborhoods.includes("All of Dallas") ||
                    filters.neighborhoods.includes(neighborhood)
                  }
                  onChange={handleChange}
                />
                {neighborhood}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div
  style={{
    marginTop: "0.75rem",
    marginBottom: "2rem",
    fontSize: "1.05rem",
    fontWeight: 600,
    color: "#222",
    textAlign: "center",
  }}
>
  {!loading && (
    <>
      <span style={{ color: "#28a745" }}>
        {filteredListings.length}
      </span>{" "}
      property reviews match your search
    </>
  )}
</div>


      <div className="card-grid">
        {filteredListings.map((listing, index) => (
          <ReviewCard
            key={index}
            review={{
              name: listing.name,
              slug: listing.slug,
              city_slug: "dallas",
              neighborhood: listing.neighborhood,
              image: listing.image,
              property_type: listing.property_type || "",
            }}
            defaultImage={defaultImage}
          />
        ))}
      </div>
    </div>
  );
}
