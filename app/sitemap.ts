import { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

const SITE_URL = "https://www.lonestarlocators.app";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SSUPABASE_SERVICE_ROLE_KEY_SERVER!
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  /* ===============================
     STATIC CORE PAGES
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
     CITY CATEGORY PAGES
  =============================== */

  const cities = ["san-antonio", "austin", "dallas", "houston"];
  const categories = [
    "apartments",
    "luxury-apartments",
    "second-chance-apartments",
    "penthouses",
    "townhomes",
    "new-construction-homes",
    "neighborhoods",
    "events",
    "blog",
    "free-apartment-locator",
    "first-time-renters",
  ];

  const cityCategoryPages: MetadataRoute.Sitemap = cities.flatMap((city) =>
    categories.map((category) => ({
      url: `${SITE_URL}/${city}/${category}`,
      lastModified: now,
    }))
  );

  /* ===============================
     APARTMENT LISTINGS
  =============================== */

  const { data: listings } = await supabase
    .from("properties_import")
    .select("slug, city_slug, updated_at");

  const listingPages: MetadataRoute.Sitemap =
    listings?.map((listing) => ({
      url: `${SITE_URL}/${listing.city_slug}/apartments/${listing.slug}`,
      lastModified: listing.updated_at
        ? new Date(listing.updated_at)
        : now,
    })) ?? [];

  /* ===============================
     PROPERTY REVIEWS
  =============================== */

  const { data: reviews } = await supabase
    .from("property_reviews")
    .select("slug, city_slug, review_type, updated_at, published_at")
    .not("published_at", "is", null);

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
  =============================== */

  const { data: blogs } = await supabase
    .from("blogs_import")
    .select("slug, city_slug, updated_at");

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
