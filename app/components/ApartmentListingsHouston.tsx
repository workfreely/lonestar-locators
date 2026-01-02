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

export default function ApartmentListingsHouston() {
  // ✅ Houston neighborhoods
  const allNeighborhoods = [
    "Downtown Houston",
    "Midtown",
    "Montrose",
    "The Heights",
    "Museum District",
    "River Oaks",
    "Medical Center",
    "Galleria",
    "Washington Ave",
    "EaDo",
  ];

  // ✅ Nearby submarkets (edit to match your data model)
  const allSubmarkets = [
    "Sugar Land",
    "Katy",
  ];

  // ✅ state for filters
  const [filters, setFilters] = useState({
    beds: "",
    baths: "",
    price: "",
    propertyType: "",
    neighborhoods: [] as string[],
    submarkets: [] as string[],
  });

  // ✅ Handles updates for dropdowns, neighborhoods, and submarkets
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

    // ✅ NORMAL DROPDOWNS
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

        console.log("🔌 Connecting to Supabase:", supabaseUrl);

        // ✅ Fetch all Houston listings
        // IMPORTANT: If your table name is different, change "houston_listings"
        const { data, error } = await supabase
          .from("houston_listings")
          .select("*")
          .order("created_at", { ascending: false });

        console.log("✅ Fetched listings:", data, error);

        if (error) throw error;

        // ✅ Apply fallback image if missing
        const withDefaults = (data || []).map((listing) => ({
          ...listing,
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

    // ✅ RANGE-AWARE + STUDIO-SAFE PARSER
    const parseRange = (val: any): [number, number] => {
      if (!val) return [0, 0];

      const str = val.toString().toLowerCase();

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
      neighborhoods.includes("All of Houston") ||
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
      const typeLower = propertyType.toLowerCase();

      const propertyTypeText = (listing.property_type || "").toLowerCase();
      const tagsText =
        typeof listing.tags === "string" ? listing.tags.toLowerCase() : "";

      if (propertyType === "Studio") {
        const rawBedsText = (listing.beds || listing.bedrooms || "")
          .toString()
          .toLowerCase();

        const looksStudio =
          rawBedsText.includes("studio") ||
          rawBedsText === "0" ||
          rawBedsText === "0 beds";

        matchPropertyType = looksStudio;
      } else {
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
      {/* ✅ AI + SEO Schema (Houston) */}
      <SchemaItemList city="Houston" listings={listings} />
      <AISchema city="Houston" listings={listings} />

      {/* Search Bar */}
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
            {/* ✅ All of Houston */}
            <label>
              <input
                type="checkbox"
                name="neighborhoods"
                value="All of Houston"
                checked={filters.neighborhoods.includes("All of Houston")}
                onChange={(e) => {
                  const { checked } = e.target;
                  if (checked) {
                    setFilters({
                      ...filters,
                      neighborhoods: ["All of Houston", ...allNeighborhoods],
                    });
                  } else {
                    setFilters({ ...filters, neighborhoods: [] });
                  }
                }}
              />
              All of Houston
            </label>

            {/* ✅ Regular neighborhoods */}
            {allNeighborhoods.map((neighborhood) => (
              <label key={neighborhood}>
                <input
                  type="checkbox"
                  name="neighborhoods"
                  value={neighborhood}
                  checked={
                    filters.neighborhoods.includes("All of Houston") ||
                    filters.neighborhoods.includes(neighborhood)
                  }
                  onChange={handleChange}
                />
                {neighborhood}
              </label>
            ))}
          </div>
        </div>

        {/* ✅ Submarkets */}
        <div style={{ flexBasis: "100%", marginTop: ".25rem" }}>
          <label
            style={{
              fontWeight: "bold",
              display: "block",
              marginBottom: ".25rem",
            }}
          >
            Nearby Submarkets
          </label>

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

      {/* ✅ Listings */}
      <div style={{ padding: "0rem" }}>
        <div className="card-grid">
          {filteredListings.map((listing, index) => (
            <ListingCard
              key={index}
              listing={{
                ...listing,
                price: listing.rent || listing.price,
                beds: listing.bedrooms || listing.beds,
                baths: listing.baths || listing.bathrooms,
                tags:
                  typeof listing.tags === "string"
                    ? listing.tags.split(",").map((t: string) => t.trim())
                    : listing.tags,
              }}
              defaultImage={defaultImage}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
