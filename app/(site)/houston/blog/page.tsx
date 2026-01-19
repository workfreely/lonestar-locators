import { supabase } from "@/app/lib/supabaseClient";
import CityBlogLayout from "@/app/components/CityBlogLayout";
import { resolveBlogTags } from "@/app/lib/seo/blogKeywords";

export default async function HoustonBlogPage() {
  const { data, error } = await supabase
    .from("blogs")
    .select(`
      title,
      slug,
      meta_description,
      comparison_image_1,
      keywords,
      publish_date,
      created_at
    `)
    .eq("city", "houston")
    .order("publish_date", { ascending: false });

  if (error) {
    console.error("Houston blog fetch error:", error);
  }

  const posts =
    data?.map((post) => ({
      title: post.title,
      excerpt: post.meta_description,
      imageUrl: post.comparison_image_1 || null,
      postUrl: `/houston/blog/${post.slug}`,
      date: post.publish_date || post.created_at,
      tags: resolveBlogTags({
        title: post.title,
        keywords: post.keywords,
        city: "Houston",
      }),
    })) ?? [];

  return <CityBlogLayout cityName="Houston" posts={posts} />;
}
