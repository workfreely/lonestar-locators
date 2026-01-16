"use client";

import { useState, useEffect } from "react";
import "@/app/styles/apartmentlistings.css";
import SchemaItemList from "@/app/components/SchemaItemList";
import AISchema from "@/app/components/AISchema";
import ListingCard from "@/app/components/ListingCard";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ukkxisleiprdpptaaxcs.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVra3hpc2xlaXByZHBwdGFheGNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NTA3MTgsImV4cCI6MjA3NDQyNjcxOH0.2toax3wY19COqPtJh64qpRcvYNlnFIndI_27og8jp-4";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const defaultImage =
  "https://res.cloudinary.com/dxtiguwzm/image/upload/v1748277676/photos-coming-soon-lone-star-locators_be1dyx.jpg";

type Listing = Record<string, unknown>;

type SchemaListing = {
  name: string;
  slug: string;
  image: string;
  beds: string;
  baths: string;
  neighborhood: string;
  price_value?: number;
};

export default function ApartmentListingsSanAntonio() {
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
    beds: "",
    baths: "",
    price: "",
    propertyType: "",
    neighborhoods: [] as string[],
    submarkets: [] as string[], // ← NEW
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

const [listings, setListings] = useState<Listing[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    const fetchListings = async () => {
      try {
        setLoading(true);

        // 🪵 Log connection start
        console.log("🔌 Connecting to Supabase:", supabaseUrl);

        // ✅ Fetch all San Antonio listings
        const { data, error } = await supabase
  .from("properties")
  .select("*")
  .eq("city_slug", "san-antonio")
  .order("created_at", { ascending: false });

        if (error) throw error;

        // ✅ Apply fallback image if missing
        const normalized = (data || []).map((listing) => ({
  ...listing,

  // 🔑 Normalize pricing fields
  price: listing.rent,
  priceValue: listing.price_value,

  // 🔑 Normalize bed / bath naming
  beds: listing.beds || listing.bedrooms,
  baths: listing.baths || listing.bathrooms,

  // 🔑 Image fallbacks (DO NOT break default image logic)
  image:
    listing.image ||
    "https://res.cloudinary.com/dxtiguwzm/image/upload/v1748277676/photos-coming-soon-lone-star-locators_be1dyx.jpg",

  gallery_images: listing.gallery_images
    ? listing.gallery_images
    : [],

 // 🔑 Normalize tags safely
tags:
  typeof listing.tags === "string"
    ? listing.tags.split(",").map((t: string) => t.trim())
    : listing.tags,
}));

setListings(normalized);
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
    const { beds, baths, price, propertyType, neighborhoods, submarkets } =
      filters;

    // ✅ RANGE-AWARE + STUDIO-SAFE PARSER

   const parseRange = (val: unknown): [number, number] => {

      if (!val) return [0, 0];

      const str = String(val).toLowerCase();

      // ✅ Studio = 0 beds
      if (str.includes("studio")) return [0, 0];

      // ✅ Extract all numbers in the string
      const nums = str.match(/\d+/g)?.map((n) => parseInt(n, 10)) || [];

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
// ✅ Open to All + Studio must ignore bed/bath filtering
const matchBeds =
  propertyType === "Open to All" || propertyType === "Studio"
    ? true
    : numericBeds === null ||
      (numericBeds >= listingMinBeds && numericBeds <= listingMaxBeds);

const matchBaths =
  propertyType === "Open to All"
    ? true
    : numericBaths === null ||
      (numericBaths >= listingMinBaths && numericBaths <= listingMaxBaths);

    const matchNeighborhoods =
      neighborhoods.length === 0 ||
      neighborhoods.includes("All of San Antonio") ||
      typeof listing.neighborhood === "string" &&
neighborhoods.includes(listing.neighborhood);

      // ✅ Normalize helper so UI labels match DB slugs
// "New Braunfels" → "new-braunfels"
const normalize = (val?: string) =>
  val?.toLowerCase().replace(/\s+/g, "-").trim();

    const matchSubmarkets =
  submarkets.length === 0 ||
  submarkets.includes("All Submarkets") ||
  (typeof listing.submarket === "string" &&
    submarkets
      .map((s) => normalize(s))
      .includes(normalize(listing.submarket)));

    const matchPrice =
  !price ||
  (priceRanges[price] &&
    typeof listing.price_value === "number" &&
    listing.price_value >= priceRanges[price][0] &&
    listing.price_value <= priceRanges[price][1]);

    // ✅ PROPERTY TYPE / STUDIO LOGIC
let matchPropertyType = true;

if (propertyType && propertyType !== "Open to All") {
  const typeLower = propertyType.toLowerCase();

  const propertyTypeText =
  typeof listing.property_type === "string"
    ? listing.property_type.toLowerCase()
    : "";
  const tagsText =
    typeof listing.tags === "string" ? listing.tags.toLowerCase() : "";

  if (propertyType === "Studio") {
    // ✅ Studios are apartments with 0-bed layouts
    const rawBedsText = (listing.beds || listing.bedrooms || "")
      .toString()
      .toLowerCase();

    const allowsStudio =
      rawBedsText.includes("studio") || rawBedsText.includes("0");

    const isApartment =
      propertyTypeText.includes("apartment") ||
      tagsText.includes("apartment");

    matchPropertyType = allowsStudio && isApartment;
  } else {
    // ✅ NORMAL PROPERTY TYPE MATCHING
    matchPropertyType =
      propertyTypeText.includes(typeLower) || tagsText.includes(typeLower);
  }
}

    return (
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
      {/*
<h1 style={{ fontSize: "2rem", marginBottom: "1.5rem", color: "#222" }}>
  Apartments in San Antonio, Texas
</h1>
*/}

      {/* ✅ Add AI Schema right after SchemaItemList */}
<SchemaItemList city="San Antonio" listings={[]} />
<AISchema city="San Antonio" />
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
        {/* BEDS */}
        <select
          name="beds"
          value={filters.beds}
          onChange={(e) => {
            const value = e.target.value;
            let newBaths = filters.baths;

            if (filters.propertyType === "Rental Home") {
              return;
            }

            if (value === "1") {
              newBaths = "1";
            } else if (value === "2") {
              newBaths = "2";
            } else if (
              value === "3" &&
              [
                "Penthouse",
                "Rental Home",
                "Townhome",
                "Apartment",
                "Open to All",
              ].includes(filters.propertyType)
            ) {
              newBaths = "2";
            }

            setFilters((prev) => ({
              ...prev,
              beds: value,
              baths: newBaths,
            }));
          }}
          disabled={
            filters.propertyType === "Studio" || // ✅ locks beds for Studio
            filters.propertyType === "Rental Home"
          }
        >
          <option value="">Beds</option>
          <option value="1" disabled={filters.propertyType === "Rental Home"}>
            1 Bed
          </option>
          <option value="2" disabled={filters.propertyType === "Rental Home"}>
            2 Beds
          </option>
          <option value="3">3 Beds</option>
        </select>
        {/* BATHS */}
        <select
          name="baths"
          value={filters.baths}
          onChange={handleChange}
          disabled={
            filters.propertyType === "Studio" ||
            filters.beds === "1" ||
            filters.beds === "2"
          }
        >
          <option value="">Baths</option>

          {filters.beds === "1" && <option value="1">1 Bath</option>}
          {filters.beds === "2" && <option value="2">2 Baths</option>}

          {filters.beds === "3" && (
            <>
              <option value="2">2 Baths</option>
              <option value="3">3 Baths</option>
            </>
          )}
        </select>
        <select name="price" value={filters.price} onChange={handleChange}>
          <option value="">Price Range</option>
          {Object.keys(priceRanges).map((key) => (
            <option key={key} value={key}>
              {key === "under-1000"
                ? "Under $1,000"
                : key === "2000+"
                ? "$2,000+"
                : `$${key.replace("-", " - $")}`}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="search-button"
          onClick={() =>
            setFilters({
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
      properties match your search
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
      <ListingCard
  key={index}
  citySlug="san-antonio"   // ✅ REQUIRED
  listing={{
    name: String(listing["name"] ?? ""),
    slug: String(listing["slug"] ?? ""),
    price: String(listing["rent"] ?? listing["price"] ?? ""),
    beds: String(listing["bedrooms"] ?? listing["beds"] ?? ""),
    baths: String(listing["baths"] ?? listing["bathrooms"] ?? ""),
    tags:
      typeof listing["tags"] === "string"
        ? listing["tags"].split(",").map((t) => t.trim())
        : [],
  }}
  defaultImage={defaultImage}
/>


          ))}
        </div>
      </div>
    </div>
  );
};

