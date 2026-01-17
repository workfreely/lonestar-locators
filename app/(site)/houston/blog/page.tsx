import { supabase } from "@/app/lib/supabaseClient";
import CityBlogLayout from "@/app/components/CityBlogLayout";
import { resolveBlogTags } from "@/app/lib/seo/blogKeywords";

export default async function HoustonBlogPage() {
  const { data, error } = await supabase
    .from("blogs")
    .select(`
      title,
      slug,
      excerpt,
      hero_image_url,
      keywords,
      published_at
    `)
    .eq("city", "houston")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (error) {
    console.error("Houston blog fetch error:", error);
  }

  const posts =
    data?.map((post) => ({
      title: post.title,
      excerpt: post.excerpt,
      imageUrl: post.hero_image_url,
      postUrl: `/houston/blog/${post.slug}`,
      date: post.published_at,
      tags: resolveBlogTags({
        title: post.title,
        keywords: post.keywords,
        city: "Houston",
      }),
    })) ?? [];

  return <CityBlogLayout cityName="Houston" posts={posts} />;
}
