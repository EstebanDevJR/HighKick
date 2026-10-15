// HighKick's own data model. Kick's undocumented payloads are snake_case,
// drift between API versions and sometimes omit fields, so everything is
// normalized into these shapes at the server boundary (see normalize.ts) and
// the UI never touches a raw Kick object. Kept free of runtime imports so
// client components can import it without pulling in the server client.

export type ClipSort = "view" | "date";
export type ClipTime = "day" | "week" | "month" | "all";

export interface CategoryRef {
  slug: string;
  name: string;
}

export interface ChannelRef {
  slug: string;
  username: string;
  avatar: string | null;
}

export interface Clip {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string;
  duration: number;
  createdAt: string;
  views: number;
  likes: number;
  mature: boolean;
  channel: ChannelRef;
  category: CategoryRef | null;
}

export interface ClipsPage {
  clips: Clip[];
  nextCursor: string | null;
}

export interface LiveInfo {
  title: string;
  viewers: number;
  startedAt: string | null;
  category: CategoryRef | null;
  thumbnail: string | null;
  mature: boolean;
  language: string | null;
}

export interface Channel extends ChannelRef {
  bio: string | null;
  banner: string | null;
  followers: number | null;
  verified: boolean;
  live: LiveInfo | null;
}

export interface Category extends CategoryRef {
  viewers: number | null;
  banner: string | null;
  parent: string | null;
  tags: string[];
}

export interface ChannelSearchHit extends ChannelRef {
  followers: number | null;
  verified: boolean;
  isLive: boolean;
}

export interface SearchResults {
  query: string;
  channels: ChannelSearchHit[];
  categories: Category[];
  clips: Clip[];
}

export interface TrendingChannel extends ChannelRef {
  clipCount: number;
  views: number;
  topClip: Clip;
}

export interface TrendingCategory extends CategoryRef {
  clipCount: number;
  views: number;
  thumbnail: string;
}

export const SLUG_RE = /^[a-z0-9_-]{1,64}$/i;
export const CLIP_ID_RE = /^[a-z0-9_-]{1,64}$/i;

export function kickClipUrl(clip: Pick<Clip, "id" | "channel">): string {
  return `https://kick.com/${clip.channel.slug}/clips/${clip.id}`;
}

export function kickChannelUrl(slug: string): string {
  return `https://kick.com/${slug}`;
}

// Mirrors kick.com's own URL layout, so swapping the domain of any Kick clip
// link for HighKick's opens that clip here.
export function clipPath(clip: Pick<Clip, "id" | "channel">): string {
  return `/${clip.channel.slug}/clips/${clip.id}`;
}
