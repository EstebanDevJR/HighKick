import type { Clip, ClipsPage } from "@/lib/kick/types";
import type { Pools } from "@/lib/pools";

// The "MIX" feed. Kick's API only offers deterministic sorts, so refreshing
// always returned the same clips in the same order. This builds a
// recommendation deck instead: several pools are fetched (trending today,
// this week, this month, and the freshest uploads), each pool is shuffled
// with a seeded RNG, and the deck is assembled by weighted round-robin
// sampling across pools. A new seed on every page load means a new order,
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

export function buildDeck(pools: Pools, seed: string): Clip[] {
  const rand = mulberry32(hashSeed(seed));

  // Weights decide how often each pool gets the next slot: mostly what's hot
  // today, with steady doses of weekly/monthly hits and brand-new clips so
  // small streamers surface too.
  const weighted: WeightedPool[] = [
    { clips: shuffle(pools.day, rand), weight: 0.4 },
    { clips: shuffle(pools.week, rand), weight: 0.25 },
    { clips: shuffle(pools.month, rand), weight: 0.15 },
    { clips: shuffle(pools.fresh, rand), weight: 0.2 },
  ];

  const seen = new Set<string>();
  const deck: Clip[] = [];

  while (weighted.some((p) => p.clips.length > 0)) {
    const total = weighted.reduce(
      (sum, p) => sum + (p.clips.length > 0 ? p.weight : 0),
      0,
    );
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

    const clip = chosen.clips.pop()!;
    if (!seen.has(clip.id)) {
      seen.add(clip.id);
      deck.push(clip);
    }
  }

  return deck;
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

// MIX inside one channel or category: there's a single pool, so the deck is
// just its clips in seeded random order. Sorting by id first makes the deck
// depend only on which clips exist, not on the order Kick listed them in.
export function shuffledScopePage(clips: Clip[], seed: string, page: number): ClipsPage {
  const unique = [...new Map(clips.map((c) => [c.id, c])).values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  return pageOfDeck(shuffle(unique, mulberry32(hashSeed(seed))), page);
}

export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}
