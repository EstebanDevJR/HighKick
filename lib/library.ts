import { createStore } from "@/lib/store";
import type { CategoryRef, ChannelRef, Clip } from "@/lib/kick/types";

// Likes, watch history, follows and "not interested" lists. Liked and
// watched clips keep a small snapshot of the clip so the Library page can
// render and replay them without asking Kick for anything.

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isHttps(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("https://");
}

export function reviveClip(v: unknown): Clip | null {
  if (!isObj(v) || typeof v.id !== "string" || !isHttps(v.videoUrl)) return null;
  const ch = v.channel;
  if (!isObj(ch) || typeof ch.slug !== "string" || typeof ch.username !== "string") {
    return null;
  }
  const cat = isObj(v.category) ? v.category : null;
  return {
    id: v.id,
    title: typeof v.title === "string" ? v.title : "",
    videoUrl: v.videoUrl,
    thumbnailUrl: isHttps(v.thumbnailUrl) ? v.thumbnailUrl : "",
    duration: typeof v.duration === "number" ? v.duration : 0,
    createdAt: typeof v.createdAt === "string" ? v.createdAt : new Date(0).toISOString(),
    views: typeof v.views === "number" ? v.views : 0,
    likes: typeof v.likes === "number" ? v.likes : 0,
    mature: v.mature === true,
    channel: {
      slug: ch.slug,
      username: ch.username,
      avatar: isHttps(ch.avatar) ? ch.avatar : null,
    },
    category:
      cat && typeof cat.slug === "string" && typeof cat.name === "string"
        ? { slug: cat.slug, name: cat.name }
        : null,
  };
}

// ---------------------------------------------------------------- likes

export interface LikeEntry {
  at: number;
  clip: Clip | null;
}

type Likes = Record<string, LikeEntry>;

const MAX_LIKES = 500;

export const likesStore = createStore<Likes>({
  key: "likes",
  fallback: {},
  parse(raw) {
    if (!isObj(raw)) return {};
    const out: Likes = {};
    for (const [id, entry] of Object.entries(raw)) {
      if (!isObj(entry)) continue;
      out[id] = {
        at: typeof entry.at === "number" ? entry.at : 0,
        clip: reviveClip(entry.clip),
      };
    }
    return out;
  },
});

export function isLiked(id: string): boolean {
  return id in likesStore.get();
}

export function setLiked(clip: Clip, liked: boolean): void {
  likesStore.set((prev) => {
    const next = { ...prev };
    if (liked) next[clip.id] = { at: Date.now(), clip };
    else delete next[clip.id];
    const ids = Object.keys(next);
    if (ids.length > MAX_LIKES) {
      ids
        .sort((a, b) => next[a].at - next[b].at)
        .slice(0, ids.length - MAX_LIKES)
        .forEach((id) => delete next[id]);
    }
    return next;
  });
}

export function likedClips(likes: Likes): Clip[] {
  return Object.values(likes)
    .filter((e): e is LikeEntry & { clip: Clip } => e.clip !== null)
    .sort((a, b) => b.at - a.at)
    .map((e) => e.clip);
}

// ---------------------------------------------------------------- history

// Ids are what MIX filters on, so they're kept deep; full snapshots are only
// needed for the Library page and are kept shallow.
const MAX_WATCHED_IDS = 1000;
const MAX_HISTORY = 150;

export const watchedIdsStore = createStore<string[]>({
  key: "watched",
  fallback: [],
  parse: (raw) =>
    Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [],
});

export const historyStore = createStore<Clip[]>({
  key: "history",
  fallback: [],
  parse: (raw) =>
    Array.isArray(raw) ? raw.map(reviveClip).filter((c): c is Clip => c !== null) : [],
});

export function getWatchedSet(): Set<string> {
  return new Set(watchedIdsStore.get());
}

export function markWatched(clip: Clip): void {
  const ids = watchedIdsStore.get();
  if (ids[ids.length - 1] !== clip.id) {
    const next = ids.filter((x) => x !== clip.id);
    next.push(clip.id);
    if (next.length > MAX_WATCHED_IDS) next.splice(0, next.length - MAX_WATCHED_IDS);
    watchedIdsStore.set(next);
  }
  const history = historyStore.get();
  if (history[0]?.id !== clip.id) {
    historyStore.set([clip, ...history.filter((c) => c.id !== clip.id)].slice(0, MAX_HISTORY));
  }
}

// ---------------------------------------------------------------- follows

export interface Follow extends ChannelRef {
  at: number;
}

export const MAX_FOLLOWS = 30;

export const followsStore = createStore<Follow[]>({
  key: "follows",
  fallback: [],
  parse: (raw) =>
    Array.isArray(raw)
      ? raw
          .filter(
            (f): f is Follow =>
              isObj(f) && typeof f.slug === "string" && typeof f.username === "string",
          )
          .map((f) => ({
            slug: f.slug,
            username: f.username,
            avatar: isHttps(f.avatar) ? f.avatar : null,
            at: typeof f.at === "number" ? f.at : 0,
          }))
          .slice(0, MAX_FOLLOWS)
      : [],
});

export function isFollowing(follows: Follow[], slug: string): boolean {
  return follows.some((f) => f.slug === slug);
}

// Returns false when the follow list is full.
export function toggleFollow(channel: ChannelRef): boolean {
  const follows = followsStore.get();
  if (isFollowing(follows, channel.slug)) {
    followsStore.set(follows.filter((f) => f.slug !== channel.slug));
    return true;
  }
  if (follows.length >= MAX_FOLLOWS) return false;
  followsStore.set([
    { slug: channel.slug, username: channel.username, avatar: channel.avatar, at: Date.now() },
    ...follows,
  ]);
  return true;
}

// ---------------------------------------------------------------- not interested

export interface Hidden {
  channels: Record<string, string>;
  categories: Record<string, string>;
}

function stringMap(v: unknown): Record<string, string> {
  if (!isObj(v)) return {};
  return Object.fromEntries(
    Object.entries(v).filter((e): e is [string, string] => typeof e[1] === "string"),
  );
}

export const hiddenStore = createStore<Hidden>({
  key: "hidden",
  fallback: { channels: {}, categories: {} },
  parse: (raw) =>
    isObj(raw)
      ? { channels: stringMap(raw.channels), categories: stringMap(raw.categories) }
      : { channels: {}, categories: {} },
});

export function hideChannel(channel: ChannelRef, hidden = true): void {
  hiddenStore.set((prev) => {
    const channels = { ...prev.channels };
    if (hidden) channels[channel.slug] = channel.username;
    else delete channels[channel.slug];
    return { ...prev, channels };
  });
}

export function hideCategory(category: CategoryRef, hidden = true): void {
  hiddenStore.set((prev) => {
    const categories = { ...prev.categories };
    if (hidden) categories[category.slug] = category.name;
    else delete categories[category.slug];
    return { ...prev, categories };
  });
}

export function isHiddenClip(hidden: Hidden, clip: Clip): boolean {
  return (
    clip.channel.slug in hidden.channels ||
    (clip.category !== null && clip.category.slug in hidden.categories)
  );
}
