import {
  CLIP_ID_RE,
  SLUG_RE,
  type Category,
  type CategoryRef,
  type Channel,
  type ChannelSearchHit,
  type Clip,
  type LiveInfo,
} from "@/lib/kick/types";

// Kick's payloads are undocumented and have changed shape between API
// versions (followers_count vs followersCount, banner.url vs banner.src,
// verified as a boolean or an object...). Every reader here is total: bad or
// missing fields degrade to null/defaults, and a record only gets dropped
// when it can't be rendered at all (no id, no playable video).

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Obj)
    : null;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function bool(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || v === "true";
}

function first<T>(...values: (T | null | undefined)[]): T | null {
  for (const v of values) if (v !== null && v !== undefined) return v;
  return null;
}

// Only absolute https URLs reach the DOM; anything else (relative paths,
// other schemes) is treated as missing.
export function safeUrl(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  try {
    const url = new URL(s);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function slug(v: unknown): string | null {
  const s = str(v)?.toLowerCase() ?? null;
  return s && SLUG_RE.test(s) ? s : null;
}

function isoDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  // Kick mixes ISO strings with "YYYY-MM-DD HH:mm:ss" (UTC, no zone).
  const candidate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)
    ? `${s.replace(" ", "T")}Z`
    : s;
  const t = Date.parse(candidate);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// Banners come as {url}, {src}, {responsive: "srcset"} or a bare string.
function imageUrl(v: unknown): string | null {
  if (typeof v === "string") return safeUrl(v);
  const o = obj(v);
  if (!o) return null;
  const direct = first(safeUrl(o.url), safeUrl(o.src));
  if (direct) return direct;
  const srcset = str(o.srcset) ?? str(o.responsive);
  if (!srcset) return null;
  // Largest candidate is listed last in Kick's srcsets.
  const candidates = srcset
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
  for (let i = candidates.length - 1; i >= 0; i--) {
    const url = safeUrl(candidates[i]);
    if (url) return url;
  }
  return null;
}

export function normalizeCategoryRef(v: unknown): CategoryRef | null {
  const o = obj(v);
  if (!o) return null;
  const s = slug(o.slug);
  const name = str(o.name);
  if (!s || !name) return null;
  return { slug: s, name };
}

export function normalizeClip(v: unknown): Clip | null {
  const o = obj(v);
  if (!o) return null;

  const id = str(o.id);
  const videoUrl = safeUrl(o.video_url) ?? safeUrl(o.videoUrl);
  // Ids end up in HighKick and Kick URLs, so anything unexpected is dropped.
  if (!id || !CLIP_ID_RE.test(id) || !videoUrl) return null;

  const privacy = str(o.privacy);
  if (privacy && privacy.toLowerCase() !== "public") return null;

  const channelObj = obj(o.channel) ?? obj(o.creator);
  const channelSlug = slug(channelObj?.slug);
  if (!channelObj || !channelSlug) return null;

  const thumbnailUrl =
    safeUrl(o.thumbnail_url) ?? safeUrl(o.thumbnailUrl) ?? imageUrl(o.thumbnail);

  return {
    id,
    title: str(o.title) ?? "",
    videoUrl,
    thumbnailUrl: thumbnailUrl ?? "",
    duration: Math.max(0, num(o.duration) ?? 0),
    createdAt: isoDate(o.created_at) ?? isoDate(o.createdAt) ?? new Date(0).toISOString(),
    views: Math.max(0, first(num(o.view_count), num(o.views), num(o.viewCount)) ?? 0),
    likes: Math.max(0, first(num(o.likes_count), num(o.likes), num(o.likesCount)) ?? 0),
    mature: bool(o.is_mature) || bool(o.isMature),
    channel: {
      slug: channelSlug,
      username: str(channelObj.username) ?? channelSlug,
      avatar:
        safeUrl(channelObj.profile_picture) ??
        safeUrl(channelObj.profile_pic) ??
        safeUrl(channelObj.profilepic),
    },
    category: normalizeCategoryRef(o.category),
  };
}

export function normalizeClips(v: unknown): Clip[] {
  const seen = new Set<string>();
  const out: Clip[] = [];
  for (const raw of arr(v)) {
    const clip = normalizeClip(raw);
    if (clip && !seen.has(clip.id)) {
      seen.add(clip.id);
      out.push(clip);
    }
  }
  return out;
}

function normalizeLive(v: unknown): LiveInfo | null {
  const o = obj(v);
  if (!o) return null;
  // Some payloads keep an ended livestream around with is_live: false.
  if ("is_live" in o && !bool(o.is_live)) return null;
  const categories = arr(o.categories);
  return {
    title: str(o.session_title) ?? str(o.title) ?? "",
    viewers: Math.max(0, first(num(o.viewer_count), num(o.viewers)) ?? 0),
    startedAt: isoDate(o.start_time) ?? isoDate(o.created_at),
    category: normalizeCategoryRef(categories[0]) ?? normalizeCategoryRef(o.category),
    thumbnail: imageUrl(o.thumbnail),
    mature: bool(o.is_mature),
    language: str(o.language),
  };
}

function isVerified(v: unknown): boolean {
  // Older payloads use an object (present = verified); newer ones a boolean.
  return obj(v) !== null || bool(v);
}

export function normalizeChannel(v: unknown): Channel | null {
  const o = obj(v);
  if (!o) return null;
  const s = slug(o.slug);
  if (!s) return null;
  const user = obj(o.user);
  return {
    slug: s,
    username: str(user?.username) ?? str(o.username) ?? s,
    avatar:
      safeUrl(user?.profile_pic) ??
      safeUrl(user?.profilepic) ??
      safeUrl(o.profile_pic) ??
      safeUrl(o.profile_picture),
    bio: str(user?.bio) ?? str(o.bio),
    banner: imageUrl(o.banner_image) ?? imageUrl(o.offline_banner_image),
    followers: first(
      num(o.followers_count),
      num(o.followersCount),
      num(o.followers),
    ),
    verified: isVerified(o.verified),
    live: normalizeLive(o.livestream),
  };
}

export function normalizeCategory(v: unknown): Category | null {
  const o = obj(v);
  if (!o) return null;
  const ref = normalizeCategoryRef(o);
  if (!ref) return null;
  const parent = obj(o.category);
  return {
    ...ref,
    viewers: first(num(o.viewers), num(o.viewer_count)),
    banner: imageUrl(o.banner) ?? imageUrl(o.thumbnail),
    parent: str(parent?.name),
    tags: arr(o.tags)
      .map((t) => str(t))
      .filter((t): t is string => t !== null)
      .slice(0, 6),
  };
}

export function normalizeCategories(v: unknown): Category[] {
  const seen = new Set<string>();
  const out: Category[] = [];
  for (const raw of arr(v)) {
    const cat = normalizeCategory(raw);
    if (cat && !seen.has(cat.slug)) {
      seen.add(cat.slug);
      out.push(cat);
    }
  }
  return out;
}

export function normalizeChannelHit(v: unknown): ChannelSearchHit | null {
  const o = obj(v);
  if (!o) return null;
  const channel = normalizeChannel(o);
  if (!channel) return null;
  return {
    slug: channel.slug,
    username: channel.username,
    avatar: channel.avatar,
    followers: channel.followers,
    verified: channel.verified,
    isLive: channel.live !== null || bool(o.isLive) || bool(o.is_live),
  };
}

// Paginated listings come back either bare or wrapped Laravel-style
// ({ data: [...] }); this unwraps both.
export function listOf(body: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(body)) return body;
  const o = obj(body);
  if (!o) return [];
  for (const key of keys) {
    if (Array.isArray(o[key])) return o[key] as unknown[];
    const nested = obj(o[key]);
    if (nested && Array.isArray(nested.data)) return nested.data as unknown[];
  }
  return [];
}

export function cursorOf(body: unknown): string | null {
  const o = obj(body);
  if (!o) return null;
  const c = str(o.nextCursor) ?? str(o.next_cursor);
  return c && c.length <= 64 ? c : null;
}

export function unwrap(body: unknown, key: string): unknown {
  const o = obj(body);
  return o && key in o ? o[key] : body;
}
