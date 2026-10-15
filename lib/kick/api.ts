import { isNotFound, kickGet } from "@/lib/kick/http";
import {
  cursorOf,
  listOf,
  normalizeCategories,
  normalizeChannel,
  normalizeChannelHit,
  normalizeClip,
  normalizeClips,
  unwrap,
} from "@/lib/kick/normalize";
import {
  CLIP_ID_RE,
  SLUG_RE,
  type Category,
  type Channel,
  type ChannelSearchHit,
  type Clip,
  type ClipSort,
  type ClipsPage,
  type ClipTime,
} from "@/lib/kick/types";

// Narrows the global clip feed to one channel or one category. Kick exposes
// the same listing shape under /channels/{slug}/clips and
// /categories/{slug}/clips.
export interface ClipScope {
  channel?: string;
  category?: string;
}

export interface GetClipsOptions extends ClipScope {
  cursor?: string;
  sort?: ClipSort;
  time?: ClipTime;
}

function clipsPath({ channel, category }: ClipScope): string {
  if (channel) return `/api/v2/channels/${channel}/clips`;
  if (category) return `/api/v2/categories/${category}/clips`;
  return "/api/v2/clips";
}

export async function getClips({
  cursor = "0",
  sort = "view",
  time = "day",
  channel,
  category,
}: GetClipsOptions = {}): Promise<ClipsPage> {
  if (channel && !SLUG_RE.test(channel)) throw new Error("Invalid channel");
  if (category && !SLUG_RE.test(category)) throw new Error("Invalid category");
  const qs = new URLSearchParams({ cursor, sort, time });
  return kickGet(
    `${clipsPath({ channel, category })}?${qs}`,
    (body) => ({
      clips: normalizeClips(listOf(body, "clips", "data")),
      nextCursor: cursorOf(body),
    }),
    { group: "clips" },
  );
}

export async function getClip(id: string): Promise<Clip | null> {
  if (!CLIP_ID_RE.test(id)) return null;
  try {
    return await kickGet(`/api/v2/clips/${id}`, (body) => normalizeClip(unwrap(body, "clip")), {
      group: "clip",
    });
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function getChannel(slug: string): Promise<Channel | null> {
  if (!SLUG_RE.test(slug)) return null;
  try {
    return await kickGet(`/api/v2/channels/${slug.toLowerCase()}`, normalizeChannel, {
      group: "channel",
    });
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

// Live viewer counts move slowly enough that a 5 min TTL is plenty, and it
// keeps the category listing (a heavy payload) off Kick's back.
const CATEGORY_TTL_MS = 5 * 60_000;

export async function getTopCategories(): Promise<Category[]> {
  try {
    const cats = await kickGet(
      "/api/v1/subcategories?page=1&limit=60",
      (body) => normalizeCategories(listOf(body, "data", "subcategories")),
      { group: "categories", ttlMs: CATEGORY_TTL_MS },
    );
    if (cats.length > 0) return cats;
  } catch {
    // fall through to the older endpoint
  }
  return kickGet(
    "/api/v1/categories/top",
    (body) => normalizeCategories(listOf(body, "data", "categories")),
    { group: "categories", ttlMs: CATEGORY_TTL_MS },
  );
}

const SEARCH_TTL_MS = 5 * 60_000;

// Kick's own search endpoint is undocumented and less stable than the clip
// listings, so callers treat its results as a bonus on top of HighKick's
// local index (see lib/feeds.ts) and never depend on it.
export async function searchKickDirectory(
  query: string,
): Promise<{ channels: ChannelSearchHit[]; categories: Category[] }> {
  const qs = new URLSearchParams({ searchterm: query });
  return kickGet(
    `/api/search?${qs}`,
    (body) => ({
      channels: listOf(body, "channels")
        .map(normalizeChannelHit)
        .filter((c): c is ChannelSearchHit => c !== null)
        .slice(0, 10),
      categories: normalizeCategories(listOf(body, "categories")).slice(0, 10),
    }),
    { group: "search", ttlMs: SEARCH_TTL_MS },
  );
}
