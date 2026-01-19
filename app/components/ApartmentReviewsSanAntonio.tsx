"use client";

import { useState, useEffect } from "react";
import "@/app/styles/apartmentlistings.css";
import SchemaItemList from "@/app/components/SchemaItemList";
import AISchema from "@/app/components/AISchema";
import ReviewCard from "@/app/components/ReviewCard";
import { createClient } from "@supabase/supabase-js";
import { matchReviewQuery } from "@/app/utils/matchReviewQuery";

const supabaseUrl = "https://ukkxisleiprdpptaaxcs.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVra3hpc2xlaXByZHBwdGFheGNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NTA3MTgsImV4cCI6MjA3NDQyNjcxOH0.2toax3wY19COqPtJh64qpRcvYNlnFIndI_27og8jp-4";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const defaultImage =
  "https://res.cloudinary.com/dxtiguwzm/image/upload/v1748277676/photos-coming-soon-lone-star-locators_be1dyx.jpg";

export default function ApartmentReviewsSanAntonio() {
  const allNeighborhoods = [
    "Downtown San Antonio",
    "La Cantera/The Rim",
    "The Dominion",
    "Stone Oak",
    "Alamo Ranch",
    "Southtown",
    "UTSA",
    "Medical Center",
    "Universal City/Converse",
    "Westover Hills",
    "Alamo Heights",
  ];

  const allSubmarkets = ["New Braunfels", "Boerne", "Schertz"];

  // ✅ state for filters
 const [filters, setFilters] = useState({
  q: "",
  beds: "",
  baths: "",
  price: "",
  propertyType: "",
  neighborhoods: [] as string[],
  submarkets: [] as string[],
});


  // ✅ Handles updates for dropdowns, neighborhoods, and new submarkets
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;

    // ✅ Neighborhood checkboxes
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

    // ✅ Submarket checkboxes
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

    // ✅ NORMAL DROPDOWNS (this is what your price bug needed)
    setFilters((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

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

  // ✅ FETCH LIVE DATA FROM SUPABASE
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchListings = async () => {
      try {
        setLoading(true);

        // 🪵 Log connection start
        console.log("🔌 Connecting to Supabase:", supabaseUrl);

       // ✅ Fetch San Antonio + nearby sub-markets (metro-aware)
const { data, error } = await supabase
  .from("property_reviews")
  .select("*")
  .eq("city_slug", "san-antonio")
  .order("created_at", { ascending: false });
  console.log("🧮 RAW SUPABASE COUNT:", data?.length);

  if (error) throw error;


        // 🪵 Log fetch result
        console.log("✅ Fetched listings:", data, error);

        if (error) throw error;

        // ✅ Apply fallback image if missing
        const withDefaults = (data || []).map((listing) => ({
          ...listing,
          image:
            listing.image ||
            "https://res.cloudinary.com/dxtiguwzm/image/upload/v1748277676/photos-coming-soon-lone-star-locators_be1dyx.jpg",
          gallery_images:
            listing.gallery_images ||
            "https://res.cloudinary.com/dxtiguwzm/image/upload/v1748277676/photos-coming-soon-lone-star-locators_be1dyx.jpg",
        }));

        setListings(withDefaults);
      } catch (err: any) {
        console.error("Error loading listings:", err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchListings();
  }, []);

  const filteredListings = listings.filter((listing) => {
  const { q, beds, baths, price, propertyType, neighborhoods, submarkets } =
    filters;

  // ✅ PROPERTY NAME SEARCH (case-insensitive)
const matchQuery = matchReviewQuery(q, listing.property_name);


  // existing logic continues below...


    // ✅ RANGE-AWARE + STUDIO-SAFE PARSER
    const parseRange = (val: any): [number, number] => {
      if (!val) return [0, 0];

      const str = val.toString().toLowerCase();

      // ✅ Studio = 0 beds
      if (str.includes("studio")) return [0, 0];

      // ✅ Extract all numbers in the string
     const nums =
  str.match(/\d+/g)?.map((n: string) => parseInt(n, 10)) || [];

      if (nums.length === 1) return [nums[0], nums[0]];
      if (nums.length >= 2) return [nums[0], nums[nums.length - 1]];

      return [0, 0];
    };

    const rawBeds = listing.beds || listing.bedrooms || "";

    const [listingMinBeds, listingMaxBeds] =
      rawBeds.toString().toLowerCase().includes("studio") ||
      rawBeds === "0" ||
      rawBeds === 0 ||
      rawBeds === null ||
      rawBeds === ""
        ? [0, 0]
        : parseRange(rawBeds);

    const [listingMinBaths, listingMaxBaths] = parseRange(
      listing.baths || listing.bathrooms
    );

    // ✅ FILTER VALUES
    const numericBeds = beds ? parseInt(beds, 10) : null;
    const numericBaths = baths ? parseInt(baths, 10) : null;

    // ✅ PROPER RANGE MATCHING
    // ✅ OVERRIDE: If Studio is selected, ignore bed filtering
    const matchBeds =
      propertyType === "Studio"
        ? true
        : numericBeds === null ||
          (numericBeds >= listingMinBeds && numericBeds <= listingMaxBeds);

    const matchBaths =
      numericBaths === null ||
      (numericBaths >= listingMinBaths && numericBaths <= listingMaxBaths);

    const matchNeighborhoods =
      neighborhoods.length === 0 ||
      neighborhoods.includes("All of San Antonio") ||
      neighborhoods.includes(listing.neighborhood);

    const matchSubmarkets =
      submarkets.length === 0 ||
      submarkets.includes("All Submarkets") ||
      submarkets.includes(listing.submarket);

    const matchPrice =
      !price ||
      (priceRanges[price] &&
        listing.price_value >= priceRanges[price][0] &&
        listing.price_value <= priceRanges[price][1]);

    // ✅ PROPERTY TYPE / STUDIO LOGIC
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
      matchQuery && // ✅ ADD THIS
      matchBeds &&
      matchBaths &&
      matchNeighborhoods &&
      matchSubmarkets &&
      matchPrice &&
      matchPropertyType
    );
  });

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
        San Antonio Apartment Reviews
      </h1>
    </div>

      {/*
<h1 style={{ fontSize: "2rem", marginBottom: "1.5rem", color: "#222" }}>
  San Antonio Apartment Reviews
</h1>
*/}

      {/* ✅ Add AI Schema right after SchemaItemList */}
      <SchemaItemList city="San Antonio" listings={listings} />
      <AISchema city="San Antonio" listings={listings} />
      {/* Schema Markup */}
      {/* Search Bar */}
      <div
        className="search-bar"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
         marginBottom: "1.5rem",     // ⬅️ reduce bottom spacing too
  padding: "1.1rem 1.25rem",  // ⬅️ key fix
          backgroundColor: "#f9f9f9", // ✅ soft gray is back
          border: "1px solid rgba(0,0,0,0.08)", // ✅ clean definition
          borderRadius: "12px",
          boxShadow: "0 6px 18px rgba(0,0,0,0.06)", // ✅ modern depth
        }}
      >
        {/* PROPERTY NAME SEARCH */}
<input
  type="text"
  name="q"
  placeholder="Property Name Search"
  value={filters.q}
  onChange={(e) =>
    setFilters((prev) => ({
      ...prev,
      q: e.target.value,
    }))
  }
  style={{
    minWidth: "220px",
    padding: "0.55rem 0.6rem",
    borderRadius: "6px",
    border: "1px solid #ccc",
    fontSize: "0.95rem",
  }}
/>

        {/* PROPERTY TYPE */}
        <select
          name="propertyType"
          value={filters.propertyType}
          onChange={(e) => {
            const value = e.target.value;

            let newBeds = filters.beds;
            let newBaths = filters.baths;

            if (value === "Studio") {
              newBeds = "0"; // ✅ THIS is why studios weren’t showing
              newBaths = "";
            } else if (value === "Rental Home") {
              newBeds = "3";
              newBaths = "2";
            }

            setFilters((prev) => ({
              ...prev,
              propertyType: value,
              beds: newBeds,
              baths: newBaths,
            }));
          }}
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
          <label
            style={{
              fontWeight: "bold",
              display: "block",
              marginBottom: "0rem",
            }}
          >
            Neighborhoods
          </label>

          <div style={{ display: "flex", gap: "rem", marginBottom: "0.25rem" }}>
         
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
            {/* ✅ All of San Antonio */}
            <label>
              <input
                type="checkbox"
                name="neighborhoods"
                value="All of San Antonio"
                checked={filters.neighborhoods.includes("All of San Antonio")}
                onChange={(e) => {
                  const { checked } = e.target;
                  if (checked) {
                    setFilters({
                      ...filters,
                      neighborhoods: [
                        "All of San Antonio",
                        ...allNeighborhoods,
                      ],
                    });
                  } else {
                    setFilters({ ...filters, neighborhoods: [] });
                  }
                }}
              />
              All of San Antonio
            </label>

            {/* ✅ Regular neighborhoods */}
            {allNeighborhoods.map((neighborhood) => (
              <label key={neighborhood}>
                <input
                  type="checkbox"
                  name="neighborhoods"
                  value={neighborhood}
                  checked={
                    filters.neighborhoods.includes("All of San Antonio") ||
                    filters.neighborhoods.includes(neighborhood)
                  }
                  onChange={handleChange}
                />
                {neighborhood}
              </label>
            ))}
          </div>
        </div>{" "}
        {/* ✅ closes Neighborhoods block */}
        {/* ✅ Submarkets */}
        <div style={{ flexBasis: "100%", marginTop: ".25rem" }}>
          <label
            style={{
              fontWeight: "bold",
              display: "block",
              marginBottom: "0rem",
            }}
          >
            Nearby Submarkets
          </label>

          <div style={{ display: "flex", gap: "1rem", marginBottom: "0.25rem" }}>
           
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
            {/* ✅ All Submarkets */}
            <label>
              <input
                type="checkbox"
                name="submarkets"
                value="All Submarkets"
                checked={filters.submarkets.includes("All Submarkets")}
                onChange={(e) => {
                  const { checked } = e.target as HTMLInputElement;
                  if (checked) {
                    setFilters({
                      ...filters,
                      submarkets: ["All Submarkets", ...allSubmarkets],
                    });
                  } else {
                    setFilters({ ...filters, submarkets: [] });
                  }
                }}
              />
              All Submarkets
            </label>

            {/* ✅ Individual submarkets */}
            {allSubmarkets.map((sub) => (
              <label key={sub}>
                <input
                  type="checkbox"
                  name="submarkets"
                  value={sub}
                  checked={
                    filters.submarkets.includes("All Submarkets") ||
                    filters.submarkets.includes(sub)
                  }
                  onChange={handleChange}
                />
                {sub}
              </label>
            ))}
          </div>
        </div>
      </div>{" "}
      {/* ✅ closes Search Bar */}
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

      {filteredListings.length === 0 && (
        <p
          style={{
            marginTop: "1rem",
            fontSize: "1rem",
            color: "#555",
            textAlign: "center",
          }}
        >
          No listings available right now. Contact me for a free list of the
          latest options!
        </p>
      )}
      {/* ✅ Clean listings section */}
      <div style={{ padding: "0rem" }}>
        {" "}
        {/* ← Left/Right padding safely added here */}
      <div className="card-grid">
  {filteredListings.map((listing, index) => (
    <ReviewCard
  key={listing.id}
  review={{
    name: listing.property_name,
    slug: listing.slug,
    city_slug: "san-antonio",
    neighborhood: listing.neighborhood,
    image: listing.hero_image_url,      // ✅ review image
    property_type: listing.review_type, // ✅ preserves filtering
  }}
  defaultImage={defaultImage}
/>

  ))}
</div>

      </div>
    </div>
  );
};