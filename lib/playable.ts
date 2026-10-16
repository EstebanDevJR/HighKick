import { createStore } from "@/lib/store";
import type { Clip } from "@/lib/kick/types";

// Kick keeps listing clips whose video is gone from its CDN — mostly old
// ones — and their cards just spin forever. Feeds probe the clips just ahead
// of the viewer (master playlist, first variant, first segment) and drop the
// ones the CDN rejects. Only a 4xx or a body that isn't a playlist counts as
// broken: being offline, a timeout or a 5xx must never hide a clip that may
// be fine a minute later.

const MAX_REMEMBERED = 1000;
const PROBE_TIMEOUT_MS = 10_000;

export const unplayableStore = createStore<string[]>({
  key: "unplayable",
  fallback: [],
  parse: (raw) =>
    Array.isArray(raw)
      ? raw.filter((id): id is string => typeof id === "string").slice(-MAX_REMEMBERED)
      : [],
});

let knownList: string[] | null = null;
let known = new Set<string>();

export function isUnplayable(id: string): boolean {
  const list = unplayableStore.get();
  if (list !== knownList) {
    knownList = list;
    known = new Set(list);
  }
  return known.has(id);
}

export function markUnplayable(id: string): void {
  if (isUnplayable(id)) return;
  unplayableStore.set((prev) => [...prev, id].slice(-MAX_REMEMBERED));
}

// Progressive files play natively; everything else is treated as HLS, which
// is what Kick serves today.
export function isProgressiveUrl(url: string): boolean {
  try {
    return /\.(mp4|webm|mov)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

class Unplayable extends Error {}

async function request(url: string, signal: AbortSignal): Promise<Response> {
  const res = await fetch(url, { signal, credentials: "omit" });
  const gone = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
  if (gone) throw new Unplayable(`${res.status} for ${url}`);
  if (!res.ok) throw new Error(`transient ${res.status}`);
  return res;
}

async function playlist(url: string, signal: AbortSignal): Promise<{ text: string; base: string }> {
  const res = await request(url, signal);
  const text = await res.text();
  if (!text.trimStart().startsWith("#EXTM3U")) throw new Unplayable(`not a playlist: ${url}`);
  return { text, base: res.url || url };
}

function firstUri(text: string, base: string): string {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) return new URL(trimmed, base).toString();
  }
  throw new Unplayable("empty playlist");
}

async function check(videoUrl: string, signal: AbortSignal): Promise<void> {
  let target = videoUrl;
  if (!isProgressiveUrl(videoUrl)) {
    let list = await playlist(videoUrl, signal);
    if (list.text.includes("#EXT-X-STREAM-INF")) list = await playlist(firstUri(list.text, list.base), signal);
    target = firstUri(list.text, list.base);
  }
  // Only the status matters, so the media body is dropped as soon as the
  // headers are in.
  const res = await request(target, signal);
  await res.body?.cancel().catch(() => {});
}

const verdicts = new Map<string, Promise<boolean>>();

// Resolves false only when the clip is definitely unplayable (and remembers
// that); anything inconclusive resolves true. `fresh` skips the memo, for
// when a player hits an error on a clip that probed fine earlier.
export function probeClip(clip: Pick<Clip, "id" | "videoUrl">, fresh = false): Promise<boolean> {
  if (isUnplayable(clip.id)) return Promise.resolve(false);
  const memo = verdicts.get(clip.id);
  if (memo && !fresh) return memo;
  if (typeof navigator !== "undefined" && !navigator.onLine) return Promise.resolve(true);

  const verdict = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      await check(clip.videoUrl, controller.signal);
      return true;
    } catch (err) {
      if (!(err instanceof Unplayable)) return true;
      markUnplayable(clip.id);
      return false;
    } finally {
      clearTimeout(timer);
    }
  })();
  verdicts.set(clip.id, verdict);
  return verdict;
}
