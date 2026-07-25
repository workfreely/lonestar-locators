import type { MetadataRoute } from "next";
import { SITE_URL } from "./_lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  // /privacy and /terms are excluded (marked noindex in their own metadata).
  const routes = ["", "/features", "/pricing", "/contact"];

  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: route === "" ? 1 : 0.8,
  }));
}
