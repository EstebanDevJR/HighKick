import type { Clip, ClipsPage } from "@/lib/kick/types";
import type { Pools } from "@/lib/pools";

// The "MIX" feed. Kick's API only offers deterministic sorts, so refreshing
// always returned the same clips in the same order. This builds a
// recommendation deck instead: several listings are fetched (trending today,
// this week, this month, all-time classics and the freshest uploads), their
// clips are grouped by actual age and shuffled with a seeded RNG, and the
// deck is assembled by weighted sampling across ages. A new seed on every
// page load means a new order,
// while the same seed keeps pagination stable within one session.
//
// Everything in this module is pure (pools in, deck out) so it can be unit
// tested and reasoned about without Kick.

export const PAGE_SIZE = 20;

interface WeightedPool {
  clips: Clip[];
  weight: number;
}

// FNV-1a — turns the client's seed string into a uint32 for the RNG.
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32 — tiny deterministic PRNG, plenty for shuffling a feed.
export function mulberry32(state: number): () => number {
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Kick's listings are labelled by window ("top this week"), not by age: the
// week and month tops are dominated by the biggest clips of the last few
// days, and a channel's all-time top is mostly years old. So the deck is
// built from each clip's actual age instead — today, this week, this month,
// this year, older — and the weights decide how often each age gets the
// next slot.
export type AgeBucket = "day" | "week" | "month" | "year" | "older";

const DAY_MS = 86_400_000;
const AGE_LIMITS: [AgeBucket, number][] = [
  ["day", DAY_MS],
  ["week", 7 * DAY_MS],
  ["month", 30 * DAY_MS],
  ["year", 365 * DAY_MS],
];

export function ageBucket(createdAt: string, anchor: number): AgeBucket {
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return "older";
  const age = anchor - t;
  for (const [bucket, limit] of AGE_LIMITS) if (age < limit) return bucket;
  return "older";
}

// The home deck stays mostly fresh but keeps reaching back; a channel's
// own MIX is evenly spread, since its whole history is the point.
export const HOME_WEIGHTS: Record<AgeBucket, number> = {
  day: 0.35,
  week: 0.27,
  month: 0.22,
  year: 0.1,
  older: 0.06,
};
export const SCOPE_WEIGHTS: Record<AgeBucket, number> = {
  day: 0.2,
  week: 0.2,
  month: 0.2,
  year: 0.2,
  older: 0.2,
};

export function ageBalancedDeck(
  clips: Clip[],
  seed: string,
  weights: Record<AgeBucket, number>,
): Clip[] {
  const rand = mulberry32(hashSeed(seed));
  // Sorting by id makes the deck depend only on which clips exist, not on
  // the order Kick listed them in.
  const unique = [...new Map(clips.map((c) => [c.id, c])).values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  // Ages are measured from the newest clip rather than the clock, so a
  // deck doesn't reshuffle itself between pages as time passes.
  const anchor = Math.max(0, ...unique.map((c) => Date.parse(c.createdAt) || 0));

  const byAge = new Map<AgeBucket, Clip[]>();
  for (const clip of unique) {
    const bucket = ageBucket(clip.createdAt, anchor);
    byAge.set(bucket, [...(byAge.get(bucket) ?? []), clip]);
  }

  const weighted: WeightedPool[] = (Object.keys(weights) as AgeBucket[]).map((bucket) => ({
    clips: shuffle(byAge.get(bucket) ?? [], rand),
    weight: weights[bucket],
  }));

  const deck: Clip[] = [];
  while (weighted.some((p) => p.clips.length > 0)) {
    const total = weighted.reduce((sum, p) => sum + (p.clips.length > 0 ? p.weight : 0), 0);
    let pick = rand() * total;
    let chosen: WeightedPool | null = null;
    for (const pool of weighted) {
      if (pool.clips.length === 0) continue;
      pick -= pool.weight;
      if (pick <= 0) {
        chosen = pool;
        break;
      }
    }
    chosen ??= weighted.find((p) => p.clips.length > 0)!;
    deck.push(chosen.clips.pop()!);
  }
  return deck;
}

export function buildDeck(pools: Pools, seed: string): Clip[] {
  return ageBalancedDeck(
    [...pools.day, ...pools.week, ...pools.month, ...pools.fresh, ...pools.all],
    seed,
    HOME_WEIGHTS,
  );
}

// Taste-based promotion: clips matching the client's favorite channels or
// categories keep their deck position but with a shrunken sort key, so they
// surface earlier without displacing variety. Purely a function of the deck
// and the favorites, so pagination stays deterministic within a session.
export function promoteFavorites(
  deck: Clip[],
  favCategories: string[],
  favChannels: string[],
): Clip[] {
  if (favCategories.length === 0 && favChannels.length === 0) return deck;
  const cats = new Set(favCategories);
  const chans = new Set(favChannels);
  return deck
    .map((clip, i) => {
      const factor = chans.has(clip.channel.slug)
        ? 0.55
        : clip.category && cats.has(clip.category.slug)
          ? 0.7
          : 1;
      return { clip, score: i * factor };
    })
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.clip);
}

export function pageOfDeck(deck: Clip[], page: number): ClipsPage {
  const start = page * PAGE_SIZE;
  const clips = deck.slice(start, start + PAGE_SIZE);
  const hasMore = start + PAGE_SIZE < deck.length;
  return { clips, nextCursor: hasMore ? String(page + 1) : null };
}

export function mixedFeedPage(
  pools: Pools,
  seed: string,
  page: number,
  favCategories: string[] = [],
  favChannels: string[] = [],
): ClipsPage {
  const deck = promoteFavorites(buildDeck(pools, seed), favCategories, favChannels);
  return pageOfDeck(deck, page);
}

// MIX inside one channel or category: the same age-balanced deck, spread
// evenly across the scope's history.
export function scopedMixPage(clips: Clip[], seed: string, page: number): ClipsPage {
  return pageOfDeck(ageBalancedDeck(clips, seed, SCOPE_WEIGHTS), page);
}

export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}
