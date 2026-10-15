import { test } from "node:test";
import assert from "node:assert/strict";
import { foldText, matchScore } from "@/lib/text";
import {
  mergeBySlug,
  searchCategoriesLocal,
  searchChannelsLocal,
  searchClipsLocal,
  trendingCategories,
  trendingChannels,
} from "@/lib/trending";
import type { Category } from "@/lib/kick/types";
import { makeClip, range } from "./helpers";

test("folding ignores case and accents", () => {
  assert.equal(foldText("  Pokémon ÉLITE "), "pokemon elite");
});

test("match quality is ordered exact > prefix > word > substring > fuzzy", () => {
  const exact = matchScore("xqc", "xQc");
  const prefix = matchScore("xq", "xQc");
  const word = matchScore("chat", "Just Chatting");
  const substring = matchScore("hatt", "Just Chatting");
  const fuzzy = matchScore("jsc", "Just Chatting");
  assert.ok(exact > prefix && prefix > word && word > substring && substring > fuzzy && fuzzy > 0);
  assert.equal(matchScore("zzz", "Just Chatting"), 0);
  assert.equal(matchScore("", "anything"), 0);
});

test("handles typed with spaces or separators still match", () => {
  assert.ok(matchScore("adin ross", "adinross") > 0);
  assert.ok(matchScore("gta v", "gta-v") > 0);
});

test("popularity never turns a non-match into a channel result", () => {
  const clips = range(20).map((i) => makeClip(i, { views: 1_000_000 }));
  assert.deepEqual(searchChannelsLocal("pok", clips), []);
  const hits = searchChannelsLocal("west", clips);
  assert.deepEqual(
    hits.map((h) => h.slug),
    ["westcol"],
  );
});

test("category search matches names, slugs and tags, accent-insensitively", () => {
  const categories: Category[] = [
    { slug: "pokemon", name: "Pokémon", viewers: 10, banner: null, parent: null, tags: [] },
    { slug: "slots", name: "Slots & Casino", viewers: 900_000, banner: null, parent: null, tags: ["gambling"] },
    { slug: "fortnite", name: "Fortnite", viewers: 50, banner: null, parent: null, tags: ["shooter"] },
  ];
  assert.deepEqual(searchCategoriesLocal("pokemon", categories).map((c) => c.slug), ["pokemon"]);
  assert.deepEqual(searchCategoriesLocal("gambl", categories).map((c) => c.slug), ["slots"]);
  assert.deepEqual(searchCategoriesLocal("minecraft", categories), []);
});

test("clip search only returns substring matches on titles", () => {
  const clips = [makeClip(1, { title: "INSANE clutch in ranked" }), makeClip(2, { title: "chat goes wild" })];
  assert.deepEqual(searchClipsLocal("clutch", clips).map((c) => c.id), ["clip_1"]);
  assert.deepEqual(searchClipsLocal("cgw", clips), []);
});

test("trending aggregates views and clip counts per channel and category", () => {
  const clips = [
    makeClip(0, { views: 100 }), // xqc, just-chatting
    makeClip(4, { views: 300 }), // xqc, slots
    makeClip(1, { views: 50 }), // adinross, slots
  ];
  const channels = trendingChannels(clips);
  assert.equal(channels[0].slug, "xqc");
  assert.equal(channels[0].clipCount, 2);
  assert.equal(channels[0].views, 400);
  assert.equal(channels[0].topClip.id, "clip_4");

  const categories = trendingCategories(clips);
  assert.equal(categories[0].slug, "slots");
  assert.equal(categories[0].views, 350);
  assert.equal(categories[0].thumbnail, makeClip(4).thumbnailUrl);
});

test("mergeBySlug keeps the first occurrence in priority order", () => {
  const merged = mergeBySlug([{ slug: "a", v: 1 }], [{ slug: "a", v: 2 }, { slug: "b", v: 3 }]);
  assert.deepEqual(merged, [
    { slug: "a", v: 1 },
    { slug: "b", v: 3 },
  ]);
});
