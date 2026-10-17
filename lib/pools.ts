import { getClips, type ClipScope } from "@/lib/kick";
import type { Clip, ClipSort, ClipTime } from "@/lib/kick/types";

// The global clip pools that both the MIX deck and the Explore page are
// built from. They're plain cached Kick listings, so every visitor in the
// same minute shares the same handful of upstream requests.

export interface Pools {
  day: Clip[];
  week: Clip[];
  month: Clip[];
  fresh: Clip[];
  // All-time hits: the only source of clips older than a month.
  all: Clip[];
}

async function fetchPool(
  sort: ClipSort,
  time: ClipTime,
  pages: number,
  scope: ClipScope = {},
): Promise<Clip[]> {
  const out: Clip[] = [];
  let cursor = "0";
  for (let i = 0; i < pages; i++) {
    try {
      const page = await getClips({ ...scope, sort, time, cursor });
      out.push(...page.clips);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    } catch {
      // One pool (or one page of it) failing shouldn't kill the feed.
      break;
    }
  }
  return out;
}

export async function getPools(): Promise<Pools> {
  // Two pages deep for the fast-moving pools gives the deck enough depth
  // that a session doesn't run dry after a few minutes of scrolling.
  const [day, week, month, fresh, all] = await Promise.all([
    fetchPool("view", "day", 2),
    fetchPool("view", "week", 2),
    fetchPool("view", "month", 2),
    fetchPool("date", "day", 2),
    fetchPool("view", "all", 1),
  ]);
  if (day.length + week.length + month.length + fresh.length + all.length === 0) {
    throw new Error("Kick returned no clips");
  }
  return { day, week, month, fresh, all };
}

export function allPoolClips(pools: Pools): Clip[] {
  const seen = new Set<string>();
  const out: Clip[] = [];
  for (const clip of [...pools.day, ...pools.week, ...pools.month, ...pools.fresh, ...pools.all]) {
    if (!seen.has(clip.id)) {
      seen.add(clip.id);
      out.push(clip);
    }
  }
  return out;
}

// The clips a scoped MIX (one channel or one category) draws from. The
// all-time top alone is mostly years old and the newest listing mostly
// today, so the week and month tops fill in everything between.
export async function getScopePool(scope: ClipScope): Promise<Clip[]> {
  const pools = await Promise.all([
    fetchPool("view", "week", 1, scope),
    fetchPool("view", "month", 2, scope),
    fetchPool("view", "all", 2, scope),
    fetchPool("date", "all", 2, scope),
  ]);
  const clips = pools.flat();
  if (clips.length === 0) throw new Error("Kick returned no clips");
  return clips;
}
