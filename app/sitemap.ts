import type { MetadataRoute } from "next";
import { getExploreData } from "@/lib/feeds";
import { siteOrigin } from "@/lib/site";

export const dynamic = "force-dynamic";

// Home + Explore plus whatever is hot right now: live categories and the
// day's trending streamers, so search engines find fresh channel feeds.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [origin, data] = await Promise.all([
    siteOrigin(),
    getExploreData().catch(() => null),
  ]);
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${origin}/`, lastModified: now, changeFrequency: "always", priority: 1 },
    { url: `${origin}/explore`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
  ];
  for (const c of data?.categories ?? []) {
    entries.push({ url: `${origin}/g/${c.slug}`, lastModified: now, changeFrequency: "daily", priority: 0.6 });
  }
  for (const c of data?.trendingChannels ?? []) {
    entries.push({ url: `${origin}/c/${c.slug}`, lastModified: now, changeFrequency: "daily", priority: 0.6 });
  }
  return entries;
}
