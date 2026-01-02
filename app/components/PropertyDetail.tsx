// BEGIN FILE: src/pages/PropertyDetail.tsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import ListingLayout from "../components/ListingLayout";

// --- Supabase client (safe for CodeSandbox + production) ---
const supabaseUrl =
  (typeof process !== "undefined" && process.env.VITE_SUPABASE_URL) ||
  "https://ukkxisleiprdpptaaxcs.supabase.co";

const supabaseAnonKey =
  (typeof process !== "undefined" && process.env.VITE_SUPABASE_ANON_KEY) ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVra3hpc2xlaXByZHBwdGFheGNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NTA3MTgsImV4cCI6MjA3NDQyNjcxOH0.2toax3wY19COqPtJh64qpRcvYNlnFIndI_27og8jp-4";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function prettyCity(slug?: string) {
  if (!slug) return "";
  const map: Record<string, string> = {
    "san-antonio": "San Antonio",
    austin: "Austin",
    dallas: "Dallas",
    houston: "Houston",
  };
  return (
    map[slug] ||
    slug.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())
  );
}

const PropertyDetail: React.FC = () => {
  const { city: citySlug, slug } = useParams<{ city: string; slug: string }>();
  const [listing, setListing] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        // 🟩 ADD THESE LOGS
        console.log("🔍 Fetching listing from Supabase...", {
          table: "san_antonio_listings",
          slug,
          citySlug,
        });

        // 🗺 Map city slugs to Supabase tables
        const tableMap: Record<string, string> = {
          "san-antonio": "san_antonio_listings",
          austin: "austin_listings",
          dallas: "dallas_listings",
          houston: "houston_listings",
        };

        // 🧩 Choose the right table dynamically
        const tableName = tableMap[citySlug || ""] || "san_antonio_listings";

        console.log("🔍 Fetching from table:", tableName, "for slug:", slug);

        const { data, error } = await supabase
          .from(tableName)
          .select("*")
          .eq("slug", slug)
          .single();

        // 🟩 ADD THIS TOO
        console.log("✅ Supabase response:", { data, error });

        if (error) throw error;
        setListing(data);
      } catch (e: any) {
        console.error("❌ Supabase fetch error:", e);
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, citySlug]);

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (err || !listing) return <div style={{ padding: 24 }}>Not found.</div>;

  // ======================================================
  // SMART IMAGE LOGIC (handles all edge cases cleanly)
  // ======================================================
  const defaultImg =
    "https://res.cloudinary.com/dxtiguwzm/image/upload/v1748277676/photos-coming-soon-lone-star-locators_be1dyx.jpg";

  // Normalize gallery input
  let gallery: string[] = [];
  if (typeof listing.gallery_images === "string") {
    gallery = listing.gallery_images
      .split(",")
      .map((s: string) => s.trim())
      .filter((s) => s.length > 5);
  } else if (Array.isArray(listing.gallery_images)) {
    gallery = listing.gallery_images.filter((s) => s && s.length > 5);
  }

  // Determine hero image
  let heroImage =
    listing.image && listing.image.length > 5 ? listing.image : defaultImg;

  // CASE 1: Real gallery images exist
  if (gallery.length > 0) {
    // If hero image appears inside gallery, remove duplicate
    gallery = gallery.filter((img) => img !== heroImage);

    // Promote first gallery image if hero image is default
    if (heroImage === defaultImg && gallery.length > 0) {
      heroImage = gallery[0];
    }
  }
  // CASE 2: No real gallery images
  else {
    gallery = []; // show no thumbnails
  }
  // CASE 3: If heroImage is default AND no gallery → clean display
  if (heroImage === defaultImg && gallery.length === 0) {
    gallery = []; // absolutely no thumbnails
  }

  return (
    <ListingLayout
      // REQUIRED
      name={listing.name}
      city={prettyCity(citySlug)} // 👈 human readable for breadcrumbs
      // OPTIONAL BUT NICE
      rent={listing.rent || `$${listing.price_value || ""}`}
      bedrooms={listing.beds || listing.bedrooms || ""}
      sqft={listing.sqft || ""}
      yearBuilt={listing.year_built || ""}
      yearRenovated={listing.year_renovated || ""}
      address={listing.full_address || ""}
      special={listing.special || ""}
      website={listing.website || ""}
      description={listing.description || ""}
      image={heroImage}
      gallery={gallery}
      video={listing.video_url || ""}
      map={listing.map_url || ""}
      agentVideo={listing.agent_video_url || ""}
      amenities={
        typeof listing.amenities === "string"
          ? listing.amenities.split(",").map((s: string) => s.trim())
          : listing.amenities || []
      }
      tags={
        typeof listing.tags === "string"
          ? listing.tags.split(",").map((s: string) => s.trim())
          : listing.tags || []
      }
      neighborhood={listing.neighborhood || ""}
      submarket={listing.submarket || ""} // ✅ NEW — for San Antonio, New Braunfels, etc.
      region={listing.address_region || listing.region || ""}
      propertyType={listing.property_type || "Apartment"}
      review_link={listing.review_link || ""}
      // ✅ FAQ FIELDS (passed through for ListingLayout to use)
      faq1_q={listing.faq1_q || ""}
      faq1_a={listing.faq1_a || ""}
      faq2_q={listing.faq2_q || ""}
      faq2_a={listing.faq2_a || ""}
      faq3_q={listing.faq3_q || ""}
      faq3_a={listing.faq3_a || ""}
      faq4_q={listing.faq4_q || ""}
      faq4_a={listing.faq4_a || ""}
      faq5_q={listing.faq5_q || ""}
      faq5_a={listing.faq5_a || ""}
    />
  );
};

export default PropertyDetail;
// END FILE: src/pages/PropertyDetail.tsx
