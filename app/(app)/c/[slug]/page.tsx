import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ChannelHeader from "@/components/ChannelBar";
import Feed from "@/components/Feed";
import { getChannel, getClips } from "@/lib/kick";
import { SLUG_RE, type Channel, type ClipsPage } from "@/lib/kick/types";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  const [initial, channel] = await Promise.all([
    getClips({ channel: slug, sort: "view", time: "all" }).catch(() => null as ClipsPage | null),
    getChannel(slug).catch(() => null as Channel | null),
  ]);
  return { initial, channel };
}

export async function generateMetadata({ params }: PageProps<"/c/[slug]">): Promise<Metadata> {
  const { slug: raw } = await params;
  const slug = raw.toLowerCase();
  if (!SLUG_RE.test(slug)) return {};
  // Both calls hit the 60 s cache that the page render shares.
  const { initial, channel } = await load(slug);
  const name = channel?.username ?? initial?.clips[0]?.channel.username ?? slug;
  const image = initial?.clips[0]?.thumbnailUrl || channel?.banner || channel?.avatar || undefined;
  return {
    title: `@${name}`,
    description: `The best clips from ${name} on Kick, in a vertical feed.`,
    alternates: { canonical: `/c/${slug}` },
    openGraph: { title: `@${name} clips`, images: image ? [image] : undefined },
  };
}

export default async function ChannelPage({ params }: PageProps<"/c/[slug]">) {
  const { slug: raw } = await params;
  const slug = raw.toLowerCase();
  if (!SLUG_RE.test(slug)) notFound();

  const { initial, channel } = await load(slug);
  const username = channel?.username ?? initial?.clips[0]?.channel.username ?? slug;

  return (
    <Feed
      source={{ kind: "scope", scope: { channel: slug, label: `@${username}` } }}
      initial={initial}
      header={<ChannelHeader slug={slug} initial={channel} />}
    />
  );
}
