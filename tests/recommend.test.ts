import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ageBalancedDeck,
  ageBucket,
  buildDeck,
  hashSeed,
  mixedFeedPage,
  mulberry32,
  PAGE_SIZE,
  promoteFavorites,
  shuffle,
  scopedMixPage,
  SCOPE_WEIGHTS,
} from "@/lib/recommend";
import type { Pools } from "@/lib/pools";
import { makeClip, range } from "./helpers";

const NOW = Date.UTC(2026, 9, 15);
function daysAgo(days: number): string {
  return new Date(NOW - days * 86_400_000).toISOString();
}

function pools(): Pools {
  return {
    day: range(25).map((i) => makeClip(i)),
    week: range(25, 20).map((i) => makeClip(i)), // overlaps with day on purpose
    month: range(15, 60).map((i) => makeClip(i)),
    fresh: range(15, 80).map((i) => makeClip(i)),
    all: range(10, 95).map((i) => makeClip(i, { createdAt: daysAgo(400 + i) })),
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
  const unique = new Set([...p.day, ...p.week, ...p.month, ...p.fresh, ...p.all].map((c) => c.id));
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
  const empty: Pools = { day: [], week: [], month: [], fresh: [], all: [] };
  assert.deepEqual(mixedFeedPage(empty, "x", 0), { clips: [], nextCursor: null });
});

test("scoped MIX pages through every clip once, in a seed-stable order", () => {
  const clips = range(45).map((i) => makeClip(i));
  const withDupes = [...clips, ...clips.slice(0, 10)];

  const ids: string[] = [];
  for (let page = 0; ; page++) {
    const { clips: chunk, nextCursor } = scopedMixPage(withDupes, "abc", page);
    ids.push(...chunk.map((c) => c.id));
    if (!nextCursor) break;
    assert.equal(nextCursor, String(page + 1));
  }
  assert.equal(ids.length, 45);
  assert.equal(new Set(ids).size, 45);

  // Kick listing order doesn't matter, the seed does.
  const reversed = scopedMixPage([...clips].reverse(), "abc", 0).clips.map((c) => c.id);
  assert.deepEqual(reversed, ids.slice(0, PAGE_SIZE));
  const other = scopedMixPage(clips, "xyz", 0).clips.map((c) => c.id);
  assert.notDeepEqual(other, ids.slice(0, PAGE_SIZE));
});

test("age buckets are measured from the anchor", () => {
  const anchor = NOW;
  assert.equal(ageBucket(daysAgo(0.5), anchor), "day");
  assert.equal(ageBucket(daysAgo(3), anchor), "week");
  assert.equal(ageBucket(daysAgo(20), anchor), "month");
  assert.equal(ageBucket(daysAgo(200), anchor), "year");
  assert.equal(ageBucket(daysAgo(800), anchor), "older");
  assert.equal(ageBucket("not a date", anchor), "older");
});

// A channel's listings in practice: a big pile of today's clips and of
// years-old hits, and only a few from in between.
function lopsidedChannel() {
  return [
    ...range(40).map((i) => makeClip(i, { createdAt: daysAgo(i / 100) })),
    ...range(5, 100).map((i) => makeClip(i, { createdAt: daysAgo(2 + (i % 4)) })),
    ...range(5, 200).map((i) => makeClip(i, { createdAt: daysAgo(10 + i % 15) })),
    ...range(5, 300).map((i) => makeClip(i, { createdAt: daysAgo(90 + i) })),
    ...range(40, 400).map((i) => makeClip(i, { createdAt: daysAgo(500 + i) })),
  ];
}

test("the first page of a scoped MIX spans every age, not just today and years ago", () => {
  for (const seed of ["a", "b", "c", "d", "e"]) {
    const page = scopedMixPage(lopsidedChannel(), seed, 0).clips;
    const anchor = Math.max(...page.map((c) => Date.parse(c.createdAt)));
    const ages = new Set(page.map((c) => ageBucket(c.createdAt, Math.max(anchor, NOW))));
    assert.ok(ages.size >= 4, `seed ${seed}: only ${[...ages].join(", ")}`);
  }
});

test("age weights shape the deck, whatever the pool sizes", () => {
  const deck = ageBalancedDeck(lopsidedChannel(), "weights", SCOPE_WEIGHTS);
  const firstTwenty = deck.slice(0, 20).map((c) => ageBucket(c.createdAt, NOW));
  const today = firstTwenty.filter((b) => b === "day").length;
  const ancient = firstTwenty.filter((b) => b === "older").length;
  // With 40 + 40 of 110 clips in those two buckets, an unweighted shuffle
  // would put ~15 of the first 20 there.
  assert.ok(today + ancient <= 12, `today ${today}, older ${ancient}`);
});

test("the home deck reaches past today even when the week top repeats it", () => {
  const today = range(40).map((i) => makeClip(i, { createdAt: daysAgo(i / 100) }));
  const p: Pools = {
    day: today,
    // Kick's week/month tops are mostly the same big clips as today's.
    week: [...today.slice(0, 15), ...range(5, 100).map((i) => makeClip(i, { createdAt: daysAgo(3) }))],
    month: [...today.slice(0, 10), ...range(5, 200).map((i) => makeClip(i, { createdAt: daysAgo(15) }))],
    fresh: range(20, 300).map((i) => makeClip(i, { createdAt: daysAgo(0.1) })),
    all: range(5, 400).map((i) => makeClip(i, { createdAt: daysAgo(700) })),
  };
  // Weighting by listing gave ~2 of 20; by age it's ~10.
  const seeds = ["a", "b", "c", "d", "e", "f"];
  const notToday = seeds
    .flatMap((seed) => mixedFeedPage(p, seed, 0).clips)
    .filter((c) => ageBucket(c.createdAt, NOW) !== "day").length;
  assert.ok(notToday / seeds.length >= 6, `avg ${notToday / seeds.length} of 20 older than a day`);
});
