import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cursorOf,
  listOf,
  normalizeCategory,
  normalizeChannel,
  normalizeChannelHit,
  normalizeClip,
  normalizeClips,
  safeUrl,
} from "@/lib/kick/normalize";

// A clip as Kick's /api/v2/clips returns it.
function rawClip(overrides: Record<string, unknown> = {}) {
  return {
    id: "clip_01ABC",
    livestream_id: "123",
    category_id: "15",
    channel_id: 1,
    user_id: 2,
    title: "  huge play  ",
    clip_url: "https://clips.kick.com/clips/x/playlist.m3u8",
    thumbnail_url: "https://clips.kick.com/clips/x/thumbnail.webp",
    privacy: "public",
    duration: 31.4,
    created_at: "2026-10-14T20:11:02.000000Z",
    is_mature: false,
    video_url: "https://clips.kick.com/clips/x/playlist.m3u8",
    view_count: 1234,
    likes_count: 56,
    category: { id: 15, name: "Just Chatting", slug: "just-chatting", parent_category: "irl" },
    creator: { id: 2, username: "Clipper", slug: "clipper" },
    channel: { id: 1, username: "xQc", slug: "xqc", profile_picture: "https://files.kick.com/avatar.webp" },
    ...overrides,
  };
}

test("normalizes a Kick clip into HighKick's model", () => {
  const clip = normalizeClip(rawClip());
  assert.deepEqual(clip, {
    id: "clip_01ABC",
    title: "huge play",
    videoUrl: "https://clips.kick.com/clips/x/playlist.m3u8",
    thumbnailUrl: "https://clips.kick.com/clips/x/thumbnail.webp",
    duration: 31.4,
    createdAt: "2026-10-14T20:11:02.000Z",
    views: 1234,
    likes: 56,
    mature: false,
    channel: { slug: "xqc", username: "xQc", avatar: "https://files.kick.com/avatar.webp" },
    category: { slug: "just-chatting", name: "Just Chatting" },
  });
});

test("drops clips that can't be played or aren't public", () => {
  assert.equal(normalizeClip(rawClip({ video_url: null })), null);
  assert.equal(normalizeClip(rawClip({ privacy: "private" })), null);
  assert.equal(normalizeClip(rawClip({ id: undefined })), null);
  assert.equal(normalizeClip(rawClip({ id: "../../admin?x=1" })), null, "ids end up in URLs");
  assert.equal(normalizeClip(rawClip({ channel: null, creator: null })), null);
  assert.equal(normalizeClip("nope"), null);
});

test("only https URLs reach the UI", () => {
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl("http://insecure.example/x.png"), null);
  assert.equal(safeUrl("/relative.png"), null);
  assert.equal(safeUrl("https://ok.example/x.png"), "https://ok.example/x.png");
  const clip = normalizeClip(rawClip({ thumbnail_url: "javascript:alert(1)" }));
  assert.equal(clip?.thumbnailUrl, "");
});

test("tolerates drifting field names and types", () => {
  const clip = normalizeClip(
    rawClip({
      view_count: undefined,
      views: "999",
      likes_count: null,
      created_at: "2026-10-14 20:11:02",
      category: null,
      channel: { username: "Some One", slug: "Some_One", profile_picture: null },
    }),
  );
  assert.equal(clip?.views, 999);
  assert.equal(clip?.likes, 0);
  assert.equal(clip?.createdAt, "2026-10-14T20:11:02.000Z");
  assert.equal(clip?.category, null);
  assert.equal(clip?.channel.slug, "some_one");
  assert.equal(clip?.channel.avatar, null);
});

test("normalizeClips dedupes and skips junk", () => {
  const clips = normalizeClips([rawClip(), rawClip(), { bad: true }, null, rawClip({ id: "clip_2" })]);
  assert.deepEqual(
    clips.map((c) => c.id),
    ["clip_01ABC", "clip_2"],
  );
});

test("normalizes channels across API versions", () => {
  const v2 = normalizeChannel({
    slug: "westcol",
    followers_count: 5_000_000,
    verified: true,
    user: { username: "Westcol", profile_pic: "https://files.kick.com/w.webp", bio: "hola" },
    banner_image: { url: "https://files.kick.com/banner.webp" },
    livestream: {
      session_title: "LIVE",
      is_live: true,
      viewer_count: 42_000,
      start_time: "2026-10-15 10:00:00",
      categories: [{ name: "Slots & Casino", slug: "slots" }],
      thumbnail: { url: "https://files.kick.com/t.webp" },
    },
  });
  assert.equal(v2?.username, "Westcol");
  assert.equal(v2?.followers, 5_000_000);
  assert.equal(v2?.verified, true);
  assert.equal(v2?.banner, "https://files.kick.com/banner.webp");
  assert.equal(v2?.live?.viewers, 42_000);
  assert.equal(v2?.live?.startedAt, "2026-10-15T10:00:00.000Z");
  assert.deepEqual(v2?.live?.category, { slug: "slots", name: "Slots & Casino" });

  const v1 = normalizeChannel({
    slug: "xqc",
    followersCount: 10,
    verified: { id: 1 },
    user: { username: "xQc" },
    livestream: { is_live: false, viewer_count: 5 },
  });
  assert.equal(v1?.followers, 10);
  assert.equal(v1?.verified, true);
  assert.equal(v1?.live, null, "an ended livestream is not live");

  assert.equal(normalizeChannel({ slug: "../etc" }), null);
});

test("category banners accept url, src and srcset shapes", () => {
  const fromSrcset = normalizeCategory({
    name: "Fortnite",
    slug: "fortnite",
    viewers: "1200",
    banner: { responsive: "https://a.example/s.webp 285w, https://a.example/l.webp 570w" },
    category: { name: "Games" },
    tags: ["Shooter", 3, "Battle Royale"],
  });
  assert.equal(fromSrcset?.banner, "https://a.example/l.webp");
  assert.equal(fromSrcset?.viewers, 1200);
  assert.equal(fromSrcset?.parent, "Games");
  assert.deepEqual(fromSrcset?.tags, ["Shooter", "3", "Battle Royale"]);

  const fromSrc = normalizeCategory({ name: "GTA V", slug: "gta-v", banner: { src: "https://a.example/g.webp" } });
  assert.equal(fromSrc?.banner, "https://a.example/g.webp");
  assert.equal(fromSrc?.viewers, null);
});

test("search hits read live state from either shape", () => {
  const hit = normalizeChannelHit({ slug: "adinross", isLive: true, user: { username: "AdinRoss" } });
  assert.equal(hit?.isLive, true);
  assert.equal(hit?.username, "AdinRoss");
});

test("listOf unwraps bare and Laravel-style listings", () => {
  assert.deepEqual(listOf([1, 2]), [1, 2]);
  assert.deepEqual(listOf({ clips: [1] }, "clips"), [1]);
  assert.deepEqual(listOf({ data: [1, 2, 3] }, "clips", "data"), [1, 2, 3]);
  assert.deepEqual(listOf({ categories: { data: [9] } }, "categories"), [9]);
  assert.deepEqual(listOf(null, "clips"), []);
});

test("cursorOf accepts strings and numbers, rejects oversized cursors", () => {
  assert.equal(cursorOf({ nextCursor: "abc" }), "abc");
  assert.equal(cursorOf({ next_cursor: 40 }), "40");
  assert.equal(cursorOf({ nextCursor: null }), null);
  assert.equal(cursorOf({ nextCursor: "x".repeat(65) }), null);
});
