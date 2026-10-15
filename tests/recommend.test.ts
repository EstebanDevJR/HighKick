import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDeck,
  hashSeed,
  mixedFeedPage,
  mulberry32,
  PAGE_SIZE,
  promoteFavorites,
  shuffle,
} from "@/lib/recommend";
import type { Pools } from "@/lib/pools";
import { makeClip, range } from "./helpers";

function pools(): Pools {
  return {
    day: range(25).map((i) => makeClip(i)),
    week: range(25, 20).map((i) => makeClip(i)), // overlaps with day on purpose
    month: range(15, 60).map((i) => makeClip(i)),
    fresh: range(15, 80).map((i) => makeClip(i)),
  };
}

test("the PRNG is deterministic per seed", () => {
  const a = mulberry32(hashSeed("seed-1"));
  const b = mulberry32(hashSeed("seed-1"));
  const c = mulberry32(hashSeed("seed-2"));
  const seqA = range(5).map(() => a());
  assert.deepEqual(seqA, range(5).map(() => b()));
  assert.notDeepEqual(seqA, range(5).map(() => c()));
  for (const x of seqA) assert.ok(x >= 0 && x < 1);
});

test("shuffle keeps every item and doesn't mutate its input", () => {
  const input = range(50);
  const out = shuffle(input, mulberry32(1));
  assert.deepEqual(input, range(50));
  assert.deepEqual([...out].sort((x, y) => x - y), input);
});

test("a deck is the same for the same seed and different across seeds", () => {
  const ids = (seed: string) => buildDeck(pools(), seed).map((c) => c.id);
  assert.deepEqual(ids("abc"), ids("abc"));
  assert.notDeepEqual(ids("abc"), ids("xyz"));
});

test("a deck never repeats a clip and contains every unique clip", () => {
  const p = pools();
  const deck = buildDeck(p, "abc");
  const unique = new Set([...p.day, ...p.week, ...p.month, ...p.fresh].map((c) => c.id));
  assert.equal(new Set(deck.map((c) => c.id)).size, deck.length);
  assert.equal(deck.length, unique.size);
});

test("pages tile the deck with no gaps or overlaps", () => {
  const p = pools();
  const seen: string[] = [];
  let page = 0;
  for (;;) {
    const result = mixedFeedPage(p, "page-test", page);
    assert.ok(result.clips.length <= PAGE_SIZE);
    seen.push(...result.clips.map((c) => c.id));
    if (!result.nextCursor) break;
    assert.equal(result.nextCursor, String(page + 1));
    page++;
  }
  assert.equal(new Set(seen).size, seen.length);
  assert.equal(seen.length, buildDeck(p, "page-test").length);
});

test("favorites surface earlier without dropping anything", () => {
  const deck = buildDeck(pools(), "fav");
  const promoted = promoteFavorites(deck, [], ["westcol"]);
  assert.equal(promoted.length, deck.length);
  const avgIndex = (list: typeof deck) => {
    const idx = list.flatMap((c, i) => (c.channel.slug === "westcol" ? [i] : []));
    return idx.reduce((a, b) => a + b, 0) / idx.length;
  };
  assert.ok(avgIndex(promoted) < avgIndex(deck));
  assert.deepEqual(promoteFavorites(deck, [], []), deck);
});

test("an empty pool set yields an empty last page", () => {
  const empty: Pools = { day: [], week: [], month: [], fresh: [] };
  assert.deepEqual(mixedFeedPage(empty, "x", 0), { clips: [], nextCursor: null });
});
