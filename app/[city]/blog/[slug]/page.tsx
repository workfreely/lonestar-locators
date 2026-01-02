import { notFound } from "next/navigation";
import { sanAntonioBlogRegistry } from "@/app/content/blog/san-antonio";

export default function CityBlogPostPage({
  params,
}: {
  params: { city: string; slug: string };
}) {
  const { city, slug } = params;

  // For now, only San Antonio is wired
  if (city !== "san-antonio") return notFound();

  const BlogComponent = sanAntonioBlogRegistry[slug];
  if (!BlogComponent) return notFound();

  return <BlogComponent />;
}
