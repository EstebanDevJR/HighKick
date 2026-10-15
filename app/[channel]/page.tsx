import { notFound, redirect } from "next/navigation";
import { SLUG_RE } from "@/lib/kick/types";

// kick.com/{channel} → HighKick's channel feed, so domain-swapped channel
// links work too. Static routes (/explore, /search…) take precedence.
export default async function ChannelMirror({ params }: PageProps<"/[channel]">) {
  const { channel } = await params;
  const slug = channel.toLowerCase();
  if (!SLUG_RE.test(slug)) notFound();
  redirect(`/c/${slug}`);
}
