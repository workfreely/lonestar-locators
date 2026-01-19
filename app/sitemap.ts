import { supabase } from "@/app/lib/supabaseClient";

export default async function sitemap() {
  const baseUrl = "https://lonestarlocators.app";

  // Fetch only published blogs
  const { data: blogs } = await supabase
    .from("blogs")
    .select("slug, updated_at")
    .eq("status", "published");

  const blogUrls =
    blogs?.map((post) => ({
      url: `${baseUrl}/san-antonio/blog/${post.slug}`,
      lastModified: post.updated_at || new Date().toISOString(),
    })) ?? [];

  return [
    // Core
    { url: baseUrl },
    { url: `${baseUrl}/san-antonio` },
    { url: `${baseUrl}/san-antonio/apartments` },
    { url: `${baseUrl}/san-antonio/neighborhoods` },
    { url: `${baseUrl}/san-antonio/blog` },

    // Blogs
    ...blogUrls,
  ];
}
