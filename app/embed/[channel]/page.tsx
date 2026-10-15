import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Feed from "@/components/Feed";
import { getClips } from "@/lib/kick";
import { getClipWithContext } from "@/lib/feeds";
import { CLIP_ID_RE, SLUG_RE, type ClipsPage, type ClipSort } from "@/lib/kick/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false } };

// Embeddable vertical player for a streamer's clips:
//   <iframe src="https://<highkick>/embed/<channel>?clip=<id>&sort=view|date">
// Streamers can drop their best moments on their own site; every card
// still links back to the clip and the channel on Kick.
export default async function EmbedPage({ params, searchParams }: PageProps<"/embed/[channel]">) {
  const [{ channel: raw }, query] = await Promise.all([params, searchParams]);
  const channel = raw.toLowerCase();
  if (!SLUG_RE.test(channel)) notFound();

  const sort: ClipSort = query.sort === "date" ? "date" : "view";
  const clipId = typeof query.clip === "string" && CLIP_ID_RE.test(query.clip) ? query.clip : null;

  let initial: ClipsPage | null = null;
  if (clipId && sort === "view") {
    const { clip, related } = await getClipWithContext(channel, clipId);
    const rest = related?.clips.filter((c) => c.id !== clip?.id) ?? [];
    if (clip || related) {
      initial = { clips: clip ? [clip, ...rest] : rest, nextCursor: related?.nextCursor ?? null };
    }
  } else {
    initial = await getClips({ channel, sort, time: "all" }).catch(() => null);
  }
  const username = initial?.clips[0]?.channel.username ?? channel;

  return (
    <Feed
      source={{ kind: "scope", scope: { channel, label: `@${username}` } }}
      initial={initial}
      initialMode={sort}
      initialTime="all"
      variant="embed"
      embedHref={`/c/${channel}`}
    />
  );
}
