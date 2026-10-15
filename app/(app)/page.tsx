import Feed from "@/components/Feed";
import type { FeedMode } from "@/components/TopBar";
import { getMixedFeed } from "@/lib/feeds";
import type { ClipsPage } from "@/lib/kick/types";
import { randomSeed } from "@/lib/recommend";

export const dynamic = "force-dynamic";

const FEED_PARAM: Record<string, FeedMode> = {
  following: "following",
  top: "view",
  new: "date",
};

export default async function Home({ searchParams }: PageProps<"/">) {
  const { feed } = await searchParams;
  const mode = typeof feed === "string" ? FEED_PARAM[feed] : undefined;

  // A fresh seed per request: every refresh deals a different feed.
  const seed = randomSeed();
  let initial: ClipsPage | null = null;
  // Following depends on what this browser follows, so it can only load
  // client-side; TOP/NEW deep links also start client-side.
  if (!mode) {
    try {
      initial = await getMixedFeed(seed, 0);
    } catch {
      // Feed falls back to fetching client-side through /api/feed.
    }
  }
  return <Feed source={{ kind: "home" }} initial={initial} initialSeed={seed} initialMode={mode} />;
}
