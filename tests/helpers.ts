import type { Clip } from "@/lib/kick/types";

export function makeClip(i: number, overrides: Partial<Clip> = {}): Clip {
  const channels = ["xqc", "adinross", "westcol", "spreen"];
  const categories = ["just-chatting", "slots", "gta-v"];
  const channel = channels[i % channels.length];
  const category = categories[i % categories.length];
  return {
    id: `clip_${i}`,
    title: `clip number ${i}`,
    videoUrl: `https://clips.kick.com/${i}/playlist.m3u8`,
    thumbnailUrl: `https://clips.kick.com/${i}/thumb.webp`,
    duration: 30,
    createdAt: new Date(Date.UTC(2026, 9, 15) - i * 3_600_000).toISOString(),
    views: 1000 + i,
    likes: i,
    mature: false,
    channel: { slug: channel, username: channel.toUpperCase(), avatar: null },
    category: { slug: category, name: category.replace("-", " ") },
    ...overrides,
  };
}

export function range(n: number, offset = 0): number[] {
  return Array.from({ length: n }, (_, i) => i + offset);
}
