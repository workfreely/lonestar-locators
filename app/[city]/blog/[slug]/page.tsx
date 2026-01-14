import { notFound } from "next/navigation";
import { supabase } from "@/app/lib/supabaseClient";
import BlogLayout from "@/app/components/BlogLayout";

export default async function BlogPage({
  params,
}: {
  params: { city: string; slug: string };
}) {
  const { city, slug } = params;

  const { data: blog, error } = await supabase
    .from("blogs")
    .select("*")
    .eq("city_slug", city)
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (error || !blog) {
    return notFound();
  }

  // ✅ Normalize keywords (handles array, string, or null)
  const keywords: string[] = Array.isArray(blog.keywords)
    ? blog.keywords
    : typeof blog.keywords === "string"
    ? blog.keywords.split(",").map((k: string) => k.trim())
    : [];

  return (
    <BlogLayout
      title={blog.title}
      publishDate={blog.publish_date || undefined}
      keywords={keywords}
      content={
        <div
          dangerouslySetInnerHTML={{
            __html: blog.body_html || blog.body_markdown,
          }}
        />
      }
      faqs={blog.faqs || []}
    />
  );
}
