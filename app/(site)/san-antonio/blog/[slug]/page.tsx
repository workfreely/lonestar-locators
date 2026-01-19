import { notFound } from "next/navigation";
import { supabase } from "@/app/lib/supabaseClient";
import BlogLayout from "@/app/components/BlogLayout";
import ComparisonLayout from "@/app/components/ComparisonLayout";

/* ============================
   HELPERS
============================ */

const normalizeArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value;
  return [];
};

export default async function BlogPostPage({
  params,
}: {
  params: { slug: string };
}) {
  /* ============================
     BASE BLOG (CANONICAL GATE)
  ============================ */

  const { data: post, error } = await supabase
    .from("blogs")
    .select("*")
    .eq("slug", params.slug)
    .eq("status", "published")
    .single();

  if (error || !post) notFound();

  /* ============================
     COMPARISON BLOGS (VS)
  ============================ */

  if (post.blog_type === "comparison") {
    const { data: cmp, error: cmpErr } = await supabase
      .from("blogs_import")
      .select("*")
      .eq("slug", params.slug)
      .single();

    if (cmpErr || !cmp) notFound();

    const leftSlug = cmp.comparison_left_property_slug;
    const rightSlug = cmp.comparison_right_property_slug;

    const [{ data: leftProp }, { data: rightProp }] = await Promise.all([
      leftSlug
        ? supabase.from("properties").select("*").eq("slug", leftSlug).single()
        : Promise.resolve({ data: null }),
      rightSlug
        ? supabase.from("properties").select("*").eq("slug", rightSlug).single()
        : Promise.resolve({ data: null }),
    ]);

    const cityName =
      (post.city || "")
        .split("-")
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ") || "San Antonio";

    return (
      <ComparisonLayout
        title={post.title}
        subtitle={post.meta_description || ""}
        cityName={cityName}
        left={{
          name: leftProp?.name || leftSlug || "Left Property",
          image: post.comparison_image_1 || leftProp?.image || "",
          imageCaption: post.comparison_caption_1 || "",
          address: leftProp?.full_address || leftProp?.street_address || "",
          rent: leftProp?.rent || "",
          bedrooms: leftProp?.beds || "",
          neighborhood: leftProp?.neighborhood || "",
          propertyType: leftProp?.property_type || "",
          tags: leftProp?.tags || [],
          good: normalizeArray(cmp.left_good),
          bad: normalizeArray(cmp.left_bad),
          ugly: normalizeArray(cmp.left_ugly),
          verdict: cmp.left_verdict || "",
        }}
        right={{
          name: rightProp?.name || rightSlug || "Right Property",
          image: post.comparison_image_2 || rightProp?.image || "",
          imageCaption: post.comparison_caption_2 || "",
          address: rightProp?.full_address || rightProp?.street_address || "",
          rent: rightProp?.rent || "",
          bedrooms: rightProp?.beds || "",
          neighborhood: rightProp?.neighborhood || "",
          propertyType: rightProp?.property_type || "",
          tags: rightProp?.tags || [],
          good: normalizeArray(cmp.right_good),
          bad: normalizeArray(cmp.right_bad),
          ugly: normalizeArray(cmp.right_ugly),
          verdict: cmp.right_verdict || "",
        }}
      />
    );
  }

  /* ============================
     NORMAL BLOGS
  ============================ */

  const fallbackBodyParts = [
    post.meta_description,
    post.faq1_q ? `\n\n## ${post.faq1_q}\n${post.faq1_a || ""}` : "",
    post.faq2_q ? `\n\n## ${post.faq2_q}\n${post.faq2_a || ""}` : "",
    post.faq3_q ? `\n\n## ${post.faq3_q}\n${post.faq3_a || ""}` : "",
    post.faq4_q ? `\n\n## ${post.faq4_q}\n${post.faq4_a || ""}` : "",
    post.faq5_q ? `\n\n## ${post.faq5_q}\n${post.faq5_a || ""}` : "",
  ]
    .filter(Boolean)
    .join("");

  return <BlogLayout {...post} content={post.content || fallbackBodyParts} />;
}
