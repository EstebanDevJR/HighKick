import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ChannelHeader from "@/components/ChannelBar";
import Feed from "@/components/Feed";
import { getClipWithContext } from "@/lib/feeds";
import { formatDuration } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { CLIP_ID_RE, SLUG_RE, type ClipsPage } from "@/lib/kick/types";

export const dynamic = "force-dynamic";

// Same path shape as kick.com/{channel}/clips/{id}: replacing "kick.com"
// with HighKick's domain in any clip link opens that clip here, followed by
// more from the same streamer.

async function resolve(params: PageProps<"/[channel]/clips/[id]">["params"]) {
  const { channel: rawChannel, id } = await params;
  const channel = rawChannel.toLowerCase();
  if (!SLUG_RE.test(channel) || !CLIP_ID_RE.test(id)) return null;
  return { channel, id, ...(await getClipWithContext(channel, id)) };
}

export async function generateMetadata({ params }: PageProps<"/[channel]/clips/[id]">): Promise<Metadata> {
  const data = await resolve(params);
  if (!data) return {};
  const { clip, channel, id } = data;
  if (!clip) return { title: `@${channel}`, alternates: { canonical: `/${channel}/clips/${id}` } };
  const title = clip.title || `@${clip.channel.username}`;
  const description = [
    `@${clip.channel.username}`,
    clip.category?.name,
    formatDuration(clip.duration),
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    title,
    description,
    alternates: { canonical: `/${channel}/clips/${id}` },
    openGraph: {
      type: "video.other",
      title,
      description,
      images: clip.thumbnailUrl ? [{ url: clip.thumbnailUrl, width: 1280, height: 720 }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ClipPage({ params }: PageProps<"/[channel]/clips/[id]">) {
  const data = await resolve(params);
  if (!data) notFound();
  const { clip, related, channel } = data;
  const { t } = await getT();

  const rest = related?.clips.filter((c) => c.id !== clip?.id) ?? [];
  const initial: ClipsPage | null =
    clip || related
      ? { clips: clip ? [clip, ...rest] : rest, nextCursor: related?.nextCursor ?? null }
      : null;
  const username = clip?.channel.username ?? related?.clips[0]?.channel.username ?? channel;

  return (
    <Feed
      source={{ kind: "scope", scope: { channel, label: `@${username}` } }}
      initial={initial}
      header={<ChannelHeader slug={channel} initial={null} />}
      notice={clip ? undefined : t("feed.deepLinkMissing", { name: `@${username}` })}
    />
  );
}
