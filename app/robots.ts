import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await siteOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Personal, per-browser pages and the JSON API aren't worth crawling.
        disallow: ["/api/", "/library", "/settings", "/search", "/embed/"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
