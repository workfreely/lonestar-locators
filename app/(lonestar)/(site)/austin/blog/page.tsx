import { supabase } from "@/app/lib/supabaseClient";
import CityBlogLayout from "@/app/components/CityBlogLayout";
import { resolveBlogTags } from "@/app/lib/seo/blogKeywords";

export default async function AustinBlogPage() {
  const { data } = await supabase
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
    .eq("city", "austin")
    .order("publish_date", { ascending: false });

  const posts =
    data?.map((post) => ({
      title: post.title,
      excerpt: post.meta_description,
      imageUrl: post.comparison_image_1 || null,
      postUrl: `/austin/blog/${post.slug}`,
      date: post.publish_date || post.created_at,
      tags: resolveBlogTags({
        title: post.title,
        keywords: post.keywords,
        city: "Austin",
      }),
    })) ?? [];

  return <CityBlogLayout cityName="Austin" posts={posts} />;
}
