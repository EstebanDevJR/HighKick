import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Feed from "@/components/Feed";
import { getClips } from "@/lib/kick";
import { SLUG_RE, type ClipsPage } from "@/lib/kick/types";

export const dynamic = "force-dynamic";

async function load(slug: string): Promise<ClipsPage | null> {
  return getClips({ category: slug, sort: "view", time: "all" }).catch(() => null);
}

export async function generateMetadata({ params }: PageProps<"/g/[slug]">): Promise<Metadata> {
  const { slug: raw } = await params;
  const slug = raw.toLowerCase();
  if (!SLUG_RE.test(slug)) return {};
  const initial = await load(slug);
  const name = initial?.clips[0]?.category?.name ?? slug;
  const image = initial?.clips[0]?.thumbnailUrl || undefined;
  return {
    title: `${name} clips`,
    description: `The best ${name} clips on Kick, in a vertical feed.`,
    alternates: { canonical: `/g/${slug}` },
    openGraph: { title: `${name} clips`, images: image ? [image] : undefined },
  };
}

export default async function CategoryPage({ params }: PageProps<"/g/[slug]">) {
  const { slug: raw } = await params;
  const slug = raw.toLowerCase();
  if (!SLUG_RE.test(slug)) notFound();

  const initial = await load(slug);
  const label = initial?.clips[0]?.category?.name ?? slug;

  return <Feed source={{ kind: "scope", scope: { category: slug, label } }} initial={initial} />;
}
