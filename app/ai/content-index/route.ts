// app/ai/content-index/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  // ---------------------------------------------
  // Guard: Ensure env vars exist (prevents build crash)
  // ---------------------------------------------
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json(
      {
        error: "Supabase environment variables not configured",
      },
      { status: 500 }
    );
  }

  // ---------------------------------------------
  // Create Supabase client lazily (runtime-safe)
  // ---------------------------------------------
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Apartments
    const { data: apartments } = await supabase
      .from("properties_import")
      .select("slug, city_slug, updated_at");

    // Property reviews + comparisons
    const { data: reviews } = await supabase
      .from("property_reviews")
      .select("slug, city_slug, review_type, updated_at");

    // Blogs
    const { data: blogs } = await supabase
      .from("blogs")
      .select("slug, city_slug, updated_at");

    const baseUrl = "https://www.lonestarlocators.app";

    return NextResponse.json({
      site: "Lone Star Locators",
      purpose: "AI-readable index of all authoritative rental content",
      generated_at: new Date().toISOString(),

      entities: {
        cities: ["san-antonio", "austin", "dallas", "houston"],

        apartments:
          apartments?.map((p) => ({
            type: "apartment",
            city: p.city_slug,
            url: `${baseUrl}/${p.city_slug}/apartments/${p.slug}`,
            updated_at: p.updated_at,
          })) ?? [],

        reviews:
          reviews?.map((r) => ({
            type:
              r.review_type === "comparison"
                ? "comparison"
                : "property-review",
            city: r.city_slug,
            url: `${baseUrl}/${r.city_slug}/blog/${r.slug}`,
            updated_at: r.updated_at,
          })) ?? [],

        blogs:
          blogs?.map((b) => ({
            type: "blog",
            city: b.city_slug,
            url: `${baseUrl}/${b.city_slug}/blog/${b.slug}`,
            updated_at: b.updated_at,
          })) ?? [],
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "AI content index failed",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 }
    );
  }
}
