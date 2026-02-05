import { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

const SITE_URL = "https://www.lonestarlocators.app";

// Server-only Supabase setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  /* ===============================
     STATIC CORE PAGES (HIGH PRIORITY)
  =============================== */

  const staticPages: MetadataRoute.Sitemap = [
    "",
    "/start-your-search",
    "/how-it-works",
    "/ai-apartment-locator",
    "/meet-your-locators",
    "/why-choose-us",
    "/privacy",
    "/terms",
    "/disclaimer",
    "/site-map",
  ].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
  }));

  /* ===============================
     CITY CATEGORY PAGES (INDEX-WORTHY ONLY)
     ❌ Removed thin / navigational pages
  =============================== */

  const cities = ["san-antonio", "austin", "dallas", "houston"];

  const indexableCategories = [
    "apartments",
    "luxury-apartments",
    "second-chance-apartments",
    "townhomes",
    "new-construction-homes",
  ];

  const cityCategoryPages: MetadataRoute.Sitemap = cities.flatMap((city) =>
    indexableCategories.map((category) => ({
      url: `${SITE_URL}/${city}/${category}`,
      lastModified: now,
    }))
  );

  /* ===============================
     APARTMENT LISTINGS
     ✅ Active listings only
     ✅ Crawl pacing friendly
  =============================== */

  const { data: listings } = supabase
    ? await supabase
        .from("properties_import")
        .select("slug, city_slug, updated_at")
        .eq("status", "active")
    : { data: [] };

  const listingPages: MetadataRoute.Sitemap =
    listings?.map((listing) => ({
      url: `${SITE_URL}/${listing.city_slug}/apartments/${listing.slug}`,
      lastModified: listing.updated_at
        ? new Date(listing.updated_at)
        : now,
    })) ?? [];

  /* ===============================
     PROPERTY REVIEWS (PUBLISHED ONLY)
  =============================== */

  const { data: reviews } = supabase
    ? await supabase
        .from("property_reviews")
        .select("slug, city_slug, review_type, updated_at, published_at")
        .not("published_at", "is", null)
    : { data: [] };

  const reviewPages: MetadataRoute.Sitemap =
    reviews?.map((review) => {
      // Property reviews
      if (review.review_type === "property") {
        return {
          url: `${SITE_URL}/${review.city_slug}/apartments/reviews/${review.slug}`,
          lastModified: review.updated_at
            ? new Date(review.updated_at)
            : now,
        };
      }

      // Comparison reviews (blog-style)
      return {
        url: `${SITE_URL}/${review.city_slug}/blog/${review.slug}`,
        lastModified: review.updated_at
          ? new Date(review.updated_at)
          : now,
      };
    }) ?? [];

  /* ===============================
     BLOG POSTS
     ✅ Posts only, NOT blog hubs
  =============================== */

  const { data: blogs } = supabase
    ? await supabase
        .from("blogs_import")
        .select("slug, city_slug, updated_at")
    : { data: [] };

  const blogPages: MetadataRoute.Sitemap =
    blogs?.map((blog) => ({
      url: `${SITE_URL}/${blog.city_slug}/blog/${blog.slug}`,
      lastModified: blog.updated_at
        ? new Date(blog.updated_at)
        : now,
    })) ?? [];

  /* ===============================
     FINAL MERGE
  =============================== */

  return [
    ...staticPages,
    ...cityCategoryPages,
    ...listingPages,
    ...reviewPages,
    ...blogPages,
  ];
}
