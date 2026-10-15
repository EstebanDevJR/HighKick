import { matchScore } from "@/lib/text";
import type {
  Category,
  ChannelSearchHit,
  Clip,
  TrendingCategory,
  TrendingChannel,
} from "@/lib/kick/types";

// Pure aggregations over clip pools. Kick has no "trending streamers" or
// "hot categories right now" endpoint, but today's most-viewed clips are a
// strong proxy for both, and computing it locally costs zero extra requests.

export function trendingChannels(clips: Clip[], limit = 12): TrendingChannel[] {
  const byChannel = new Map<string, TrendingChannel>();
  for (const clip of clips) {
    const entry = byChannel.get(clip.channel.slug);
    if (entry) {
      entry.clipCount++;
      entry.views += clip.views;
      if (clip.views > entry.topClip.views) entry.topClip = clip;
      entry.avatar ??= clip.channel.avatar;
    } else {
      byChannel.set(clip.channel.slug, {
        ...clip.channel,
        clipCount: 1,
        views: clip.views,
        topClip: clip,
      });
    }
  }
  return [...byChannel.values()]
    .sort((a, b) => b.views - a.views || b.clipCount - a.clipCount)
    .slice(0, limit);
}

export function trendingCategories(clips: Clip[], limit = 12): TrendingCategory[] {
  const byCategory = new Map<string, TrendingCategory>();
  // Views of the clip currently used as each category's cover image.
  const coverViews = new Map<string, number>();
  for (const clip of clips) {
    if (!clip.category) continue;
    const slug = clip.category.slug;
    const entry = byCategory.get(slug);
    if (entry) {
      entry.clipCount++;
      entry.views += clip.views;
      if (clip.views > (coverViews.get(slug) ?? 0) && clip.thumbnailUrl) {
        coverViews.set(slug, clip.views);
        entry.thumbnail = clip.thumbnailUrl;
      }
    } else {
      coverViews.set(slug, clip.views);
      byCategory.set(slug, {
        ...clip.category,
        clipCount: 1,
        views: clip.views,
        thumbnail: clip.thumbnailUrl,
      });
    }
  }
  return [...byCategory.values()]
    .sort((a, b) => b.views - a.views || b.clipCount - a.clipCount)
    .slice(0, limit);
}

interface Ranked<T> {
  item: T;
  score: number;
}

// Popularity only breaks ties between real matches; it must never turn a
// non-match into a result.
function withPopularity(match: number, popularity: number): number {
  return match > 0 ? match + Math.min(5, Math.log10(1 + Math.max(0, popularity))) : 0;
}

function rank<T>(items: Ranked<T>[], limit: number): T[] {
  return items
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.item);
}

export function searchChannelsLocal(
  query: string,
  clips: Clip[],
  limit = 8,
): ChannelSearchHit[] {
  const channels = trendingChannels(clips, Number.MAX_SAFE_INTEGER);
  return rank(
    channels.map((c) => ({
      item: {
        slug: c.slug,
        username: c.username,
        avatar: c.avatar,
        followers: null,
        verified: false,
        isLive: false,
      },
      score: withPopularity(
        Math.max(matchScore(query, c.username), matchScore(query, c.slug)),
        c.views,
      ),
    })),
    limit,
  );
}

export function searchCategoriesLocal(
  query: string,
  categories: Category[],
  limit = 8,
): Category[] {
  return rank(
    categories.map((c) => ({
      item: c,
      score: withPopularity(
        Math.max(
          matchScore(query, c.name),
          matchScore(query, c.slug),
          ...c.tags.map((t) => matchScore(query, t) * 0.5),
        ),
        c.viewers ?? 0,
      ),
    })),
    limit,
  );
}

export function searchClipsLocal(query: string, clips: Clip[], limit = 12): Clip[] {
  return rank(
    clips.map((clip) => {
      const title = matchScore(query, clip.title);
      // Only substring-or-better title matches: fuzzy subsequences over long
      // titles match almost anything.
      return { item: clip, score: withPopularity(title >= 40 ? title : 0, clip.views) };
    }),
    limit,
  );
}

export function mergeBySlug<T extends { slug: string }>(...lists: T[][]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (!seen.has(item.slug)) {
        seen.add(item.slug);
        out.push(item);
      }
    }
  }
  return out;
}
