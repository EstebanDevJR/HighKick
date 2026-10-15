"use client";

import { useEffect, useState } from "react";
import type { Channel } from "@/lib/kick/types";

// Client-side cache of channel lookups (live status, followers). Cards only
// ask once the viewer has lingered on a clip, and answers are reused for a
// couple of minutes, so scrolling fast never fans out into Kick requests.

const TTL_MS = 2 * 60_000;
const cache = new Map<string, { at: number; channel: Channel | null }>();
const pending = new Map<string, Promise<Record<string, Channel | null>>>();

export async function fetchChannels(slugs: string[]): Promise<Record<string, Channel | null>> {
  const now = Date.now();
  const out: Record<string, Channel | null> = {};
  const missing: string[] = [];
  for (const slug of slugs) {
    const hit = cache.get(slug);
    if (hit && now - hit.at < TTL_MS) out[slug] = hit.channel;
    else missing.push(slug);
  }
  if (missing.length === 0) return out;

  const key = missing.slice().sort().join(",");
  let request = pending.get(key);
  if (!request) {
    request = fetch(`/api/channels?slugs=${encodeURIComponent(key)}`)
      .then((res) => (res.ok ? res.json() : { channels: {} }))
      .then((body: { channels?: Record<string, Channel | null> }) => {
        const channels = body.channels ?? {};
        for (const slug of missing) {
          if (slug in channels) cache.set(slug, { at: Date.now(), channel: channels[slug] });
        }
        return channels;
      })
      .catch(() => ({}) as Record<string, Channel | null>)
      .finally(() => pending.delete(key));
    pending.set(key, request);
  }
  return { ...out, ...(await request) };
}

export function useChannelInfo(slug: string | null, enabled: boolean, delayMs = 900): Channel | null {
  const [channel, setChannel] = useState<Channel | null>(() => {
    if (!slug) return null;
    return cache.get(slug)?.channel ?? null;
  });

  useEffect(() => {
    if (!slug || !enabled) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetchChannels([slug]).then((res) => {
        if (!cancelled && slug in res) setChannel(res[slug]);
      });
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slug, enabled, delayMs]);

  return channel;
}
