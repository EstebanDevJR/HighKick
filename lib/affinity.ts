// Taste profile for the MIX feed: per-category and per-channel scores built
// from how clips are actually watched, kept in localStorage. The top slugs
// are sent to /api/feed once per deck so the server can promote matching
// clips without any server-side state.
//
// Signals, short-video style: finishing a clip counts more than opening
// it, a like counts most, and swiping away within a second or two is a mild
// negative. Scores decay on every write so tastes can drift over time.

import { createStore } from "@/lib/store";
import type { Clip } from "@/lib/kick/types";

const MAX_ENTRIES = 200;
const DECAY = 0.995;
const FLOOR = -6;

interface AffinityData {
  categories: Record<string, number>;
  channels: Record<string, number>;
}

function scores(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object") return {};
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).filter(
      (e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1]),
    ),
  );
}

const store = createStore<AffinityData>({
  key: "affinity",
  fallback: { categories: {}, channels: {} },
  parse: (raw) => {
    const o = (raw ?? {}) as Partial<AffinityData>;
    return { categories: scores(o.categories), channels: scores(o.channels) };
  },
});

// Drops the weakest entries once a map outgrows the cap, so one long-lived
// profile can't bloat localStorage.
function update(map: Record<string, number>, key: string, weight: number) {
  const next: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) {
    const decayed = v * DECAY;
    if (Math.abs(decayed) > 0.05) next[k] = decayed;
  }
  next[key] = Math.max(FLOOR, (next[key] ?? 0) + weight);
  const entries = Object.entries(next);
  if (entries.length <= MAX_ENTRIES) return next;
  entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return Object.fromEntries(entries.slice(0, MAX_ENTRIES));
}

export function recordAffinity(clip: Clip, weight: number): void {
  if (weight === 0) return;
  store.set((prev) => ({
    categories: clip.category
      ? update(prev.categories, clip.category.slug, weight)
      : prev.categories,
    channels: update(prev.channels, clip.channel.slug, weight),
  }));
}

// Maps how a clip was watched to a taste signal. `fraction` is the share of
// the clip that played, `dwellMs` how long the card was on screen.
export function watchSignal(fraction: number, dwellMs: number): number {
  if (fraction >= 0.9) return 2;
  if (fraction >= 0.5) return 1;
  if (fraction >= 0.25) return 0.5;
  if (dwellMs < 1500) return -0.5;
  return 0;
}

function top(map: Record<string, number>, n: number): string[] {
  return Object.entries(map)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([slug]) => slug);
}

export function getTopCategories(n: number): string[] {
  return top(store.get().categories, n);
}

export function getTopChannels(n: number): string[] {
  return top(store.get().channels, n);
}
