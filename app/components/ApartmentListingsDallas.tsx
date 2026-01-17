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

export default function ApartmentListingsDallas() {
  // ✅ Dallas neighborhoods (from your original Dallas file)
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

  // ✅ keep structure identical; Dallas submarkets optional
  const allSubmarkets: string[] = [];

  const [filters, setFilters] = useState({
    beds: "",
    baths: "",
    price: "",
    propertyType: "",
    neighborhoods: [] as string[],
    submarkets: [] as string[],
  });

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

    // ✅ Submarket checkboxes (kept for parity)
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

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchListings = async () => {
      try {
        setLoading(true);
        console.log("🔌 Connecting to Supabase:", supabaseUrl);

        // ✅ Fetch all Dallas listings
       const { data, error } = await supabase
  .from("properties")
  .select("*")
  .eq("city_slug", "dallas")
  .order("created_at", { ascending: false });

if (error) throw error;

const withDefaults = (data || []).map((listing) => ({
  ...listing,

  // ✅ CRITICAL: guarantee routing works
  city_slug: listing.city_slug,

  // ✅ image safety
  image: listing.image || defaultImage,
  gallery_images: listing.gallery_images || defaultImage,
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
    const { beds, baths, price, propertyType, neighborhoods, submarkets } =
      filters;

    const parseRange = (val: unknown): [number, number] => {

      if (!val) return [0, 0];

      const str = String(val).toLowerCase();
      if (str.includes("studio")) return [0, 0];

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

    const numericBeds = beds ? parseInt(beds, 10) : null;
    const numericBaths = baths ? parseInt(baths, 10) : null;

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
      neighborhoods.includes("All of Dallas") ||
      typeof listing.neighborhood === "string" &&
neighborhoods.includes(listing.neighborhood);

    const matchSubmarkets =
      submarkets.length === 0 ||
      submarkets.includes("All Submarkets") ||
     typeof listing.submarket === "string" &&
submarkets.includes(listing.submarket);

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
    <div className="apartment-listings-page">
      <div style={{ padding: ".5rem", fontFamily: "'Inter', sans-serif" }}>
        {/* ✅ AI Schema + SEO */}
        <SchemaItemList city="Dallas" listings={[]} />
        <AISchema city="Dallas" />

        {/* ✅ Search Bar */}
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
          {/* PROPERTY TYPE */}
          <select
            name="propertyType"
            value={filters.propertyType}
            onChange={(e) => {
              const value = e.target.value;

              let newBeds = filters.beds;
              let newBaths = filters.baths;

              if (value === "Studio") {
                newBeds = "0";
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

              if (filters.propertyType === "Rental Home") return;

              if (value === "1") newBaths = "1";
              else if (value === "2") newBaths = "2";
              else if (
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
              filters.propertyType === "Studio" ||
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
                marginBottom: ".25rem",
              }}
            >
              Neighborhoods
            </label>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
              {/* ✅ All of Dallas */}
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

              {/* ✅ Regular neighborhoods */}
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
      properties match your search
    </>
  )}
</div>



        {loading && (
          <p style={{ textAlign: "center", marginTop: "1rem" }}>
            Loading listings...
          </p>
        )}

        {error && (
          <p style={{ textAlign: "center", marginTop: "1rem", color: "crimson" }}>
            Error: {error}
          </p>
        )}

        {!loading && filteredListings.length === 0 && (
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

        <div style={{ padding: "0rem" }}>
          <div className="card-grid">
           {filteredListings.map((listing: Listing, index) => (
            <ListingCard
  key={index}
  citySlug="dallas"
  listing={{
    name: String(listing["name"] ?? ""),
    slug: String(listing["slug"] ?? ""),
    city_slug: String(listing["city_slug"] ?? "san-antonio"),

    // 🔑 PRICE
    price: String(listing["rent"] ?? ""),

    // 🔑 BEDS / BATHS
    beds: String(listing["bedrooms"] ?? listing["beds"] ?? ""),
    baths: String(listing["baths"] ?? listing["bathrooms"] ?? ""),

    // 🔑 LOCATION
    neighborhood:
      typeof listing["neighborhood"] === "string"
        ? listing["neighborhood"]
        : undefined,
    submarket:
      typeof listing["submarket"] === "string"
        ? listing["submarket"]
        : undefined,

    // 🔑 IMAGE
    image:
      typeof listing["image"] === "string" && listing["image"].trim() !== ""
        ? listing["image"]
        : defaultImage,

    // 🔑 MOVE-IN SPECIAL (THIS FIXES THE BLUE BANNER)
    special:
      typeof listing["special"] === "string"
        ? listing["special"]
        : undefined,

    // 🔑 TAGS
    tags:
      typeof listing["tags"] === "string"
        ? listing["tags"].split(",").map((t) => t.trim())
        : Array.isArray(listing["tags"])
        ? listing["tags"]
        : [],
  }}
  defaultImage={defaultImage}
/>

            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
