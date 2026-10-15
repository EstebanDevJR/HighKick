import {
  getChannel,
  getClip,
  getClips,
  getTopCategories,
  searchKickDirectory,
} from "@/lib/kick";
import {
  SLUG_RE,
  type Category,
  type ChannelSearchHit,
  type Clip,
  type ClipsPage,
  type SearchResults,
  type TrendingCategory,
  type TrendingChannel,
} from "@/lib/kick/types";
import { allPoolClips, getPools } from "@/lib/pools";
import { mixedFeedPage, PAGE_SIZE } from "@/lib/recommend";
import {
  mergeBySlug,
  searchCategoriesLocal,
  searchChannelsLocal,
  searchClipsLocal,
  trendingCategories,
  trendingChannels,
} from "@/lib/trending";

// Server-side feed builders that combine several cached Kick listings into
// one response. Route handlers and server components both call these.

export async function getMixedFeed(
  seed: string,
  page: number,
  favCategories: string[] = [],
  favChannels: string[] = [],
): Promise<ClipsPage> {
  return mixedFeedPage(await getPools(), seed, page, favCategories, favChannels);
}

export const MAX_FOLLOWED = 30;

// "Following" without accounts: the client sends the slugs it follows and
// the server merges each channel's newest clips into one chronological feed.
export async function getFollowingFeed(
  channels: string[],
  page: number,
): Promise<ClipsPage> {
  const slugs = channels.filter((s) => SLUG_RE.test(s)).slice(0, MAX_FOLLOWED);
  if (slugs.length === 0) return { clips: [], nextCursor: null };

  const results = await Promise.allSettled(
    slugs.map((channel) => getClips({ channel, sort: "date", time: "all" })),
  );
  const fulfilled = results.filter(
    (r): r is PromiseFulfilledResult<ClipsPage> => r.status === "fulfilled",
  );
  if (fulfilled.length === 0) throw new Error("Kick is unavailable");

  const byId = new Map<string, Clip>();
  for (const r of fulfilled) {
    for (const clip of r.value.clips) byId.set(clip.id, clip);
  }
  const merged = [...byId.values()].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );

  const start = page * PAGE_SIZE;
  return {
    clips: merged.slice(start, start + PAGE_SIZE),
    nextCursor: start + PAGE_SIZE < merged.length ? String(page + 1) : null,
  };
}

export interface ExploreData {
  categories: Category[];
  trendingChannels: TrendingChannel[];
  trendingCategories: TrendingCategory[];
  freshClips: Clip[];
}

export async function getExploreData(): Promise<ExploreData> {
  const [pools, categories] = await Promise.all([
    getPools().catch(() => null),
    getTopCategories().catch(() => [] as Category[]),
  ]);
  const today = pools ? [...pools.day, ...pools.fresh] : [];
  return {
    categories,
    trendingChannels: trendingChannels(today, 12),
    trendingCategories: trendingCategories(today, 12),
    freshClips: pools ? pools.fresh.slice(0, 12) : [],
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function asChannelSlug(query: string): string | null {
  const candidate = query.trim().replace(/^@/, "").replace(/\s+/g, "").toLowerCase();
  return SLUG_RE.test(candidate) ? candidate : null;
}

// Search merges four sources, best first: an exact channel lookup (typing a
// streamer's handle always works), Kick's own directory search when it
// answers, and a local index over the trending pools and category list.
// Only the local index is guaranteed; the rest are raced against a short
// budget so a slow Kick never makes the search box feel stuck.
export async function searchEverything(query: string): Promise<SearchResults> {
  const q = query.trim().slice(0, 64);
  if (q.length < 2) return { query: q, channels: [], categories: [], clips: [] };

  // Exact handle lookups cost a Kick request each, so only for queries long
  // enough to plausibly be a handle.
  const slug = q.length >= 3 ? asChannelSlug(q) : null;
  const [pools, categories, exact, directory] = await Promise.all([
    withTimeout(getPools(), 6000, null),
    withTimeout(getTopCategories(), 4000, [] as Category[]),
    slug ? withTimeout(getChannel(slug), 4000, null) : Promise.resolve(null),
    withTimeout(searchKickDirectory(q), 3500, { channels: [], categories: [] }),
  ]);

  const poolClips = pools ? allPoolClips(pools) : [];
  const exactHit: ChannelSearchHit[] = exact
    ? [
        {
          slug: exact.slug,
          username: exact.username,
          avatar: exact.avatar,
          followers: exact.followers,
          verified: exact.verified,
          isLive: exact.live !== null,
        },
      ]
    : [];

  return {
    query: q,
    channels: mergeBySlug(
      exactHit,
      directory.channels,
      searchChannelsLocal(q, poolClips),
    ).slice(0, 10),
    categories: mergeBySlug(
      directory.categories,
      searchCategoriesLocal(q, mergeBySlug(categories, poolCategories(poolClips))),
    ).slice(0, 10),
    clips: searchClipsLocal(q, poolClips),
  };
}

function poolCategories(clips: Clip[]): Category[] {
  return trendingCategories(clips, Number.MAX_SAFE_INTEGER).map((c) => ({
    slug: c.slug,
    name: c.name,
    viewers: null,
    banner: c.thumbnail || null,
    parent: null,
    tags: [],
  }));
}

export interface ClipContext {
  clip: Clip | null;
  related: ClipsPage | null;
}

// Deep links (/{channel}/clips/{id}) open on the requested clip followed by
// more from the same channel. If Kick's single-clip endpoint fails, the
// channel's own listings usually contain the clip anyway.
export async function getClipWithContext(
  channel: string,
  id: string,
): Promise<ClipContext> {
  const [direct, related, recent] = await Promise.all([
    getClip(id).catch(() => null),
    getClips({ channel, sort: "view", time: "all" }).catch(() => null),
    getClips({ channel, sort: "date", time: "all" }).catch(() => null),
  ]);
  const clip =
    direct ??
    related?.clips.find((c) => c.id === id) ??
    recent?.clips.find((c) => c.id === id) ??
    null;
  return { clip, related };
}
