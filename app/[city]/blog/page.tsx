// app/[city]/blog/page.tsx

import { notFound } from "next/navigation";
import { sanAntonioBlogRegistry } from "@/app/content/blog/san-antonio";

interface PageProps {
  params: Promise<{
    city: string;
    slug: string;
  }>;
}

export default async function CityBlogPostPage({ params }: PageProps) {
  const { city, slug } = await params;

  if (city !== "san-antonio") {
    return notFound();
  }

  const BlogComponent = sanAntonioBlogRegistry[slug];

  if (!BlogComponent) {
    return notFound();
  }

  return <BlogComponent />;
}
