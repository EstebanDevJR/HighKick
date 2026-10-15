import { getClips } from "@/lib/kick";
import type { Clip, ClipSort, ClipTime } from "@/lib/kick/types";

// The four global clip pools that both the MIX deck and the Explore page are
// built from. They're plain cached Kick listings, so every visitor in the
// same minute shares the same handful of upstream requests.

export interface Pools {
  day: Clip[];
  week: Clip[];
  month: Clip[];
  fresh: Clip[];
}

async function fetchPool(
  sort: ClipSort,
  time: ClipTime,
  pages: number,
): Promise<Clip[]> {
  const out: Clip[] = [];
  let cursor = "0";
  for (let i = 0; i < pages; i++) {
    try {
      const page = await getClips({ sort, time, cursor });
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
  const [day, week, month, fresh] = await Promise.all([
    fetchPool("view", "day", 2),
    fetchPool("view", "week", 2),
    fetchPool("view", "month", 1),
    fetchPool("date", "day", 2),
  ]);
  if (day.length + week.length + month.length + fresh.length === 0) {
    throw new Error("Kick returned no clips");
  }
  return { day, week, month, fresh };
}

export function allPoolClips(pools: Pools): Clip[] {
  const seen = new Set<string>();
  const out: Clip[] = [];
  for (const clip of [...pools.day, ...pools.week, ...pools.month, ...pools.fresh]) {
    if (!seen.has(clip.id)) {
      seen.add(clip.id);
      out.push(clip);
    }
  }
  return out;
}
