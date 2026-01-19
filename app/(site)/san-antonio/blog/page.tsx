import { supabase } from "@/app/lib/supabaseClient";
import CityBlogLayout from "@/app/components/CityBlogLayout";
import { resolveBlogTags } from "@/app/lib/seo/blogKeywords";

export default async function SanAntonioBlogPage() {
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
.order("publish_date", { ascending: false });

  if (error) {
    console.error("San Antonio blog fetch error:", error);
  }

const posts =
  data?.map((post) => ({
    title: post.title,
    excerpt: post.meta_description, // ✅ correct column
    imageUrl: post.comparison_image_1 || null, // ✅ fallback handled in UI
    postUrl: `/san-antonio/blog/${post.slug}`,
    date: post.publish_date || post.created_at, // ✅ safe fallback
    tags: resolveBlogTags({
      title: post.title,
      keywords: post.keywords,
      city: "San Antonio",
      }),
    })) ?? [];

  return <CityBlogLayout cityName="San Antonio" posts={posts} />;
}
