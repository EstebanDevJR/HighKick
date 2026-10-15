"use client";

import { useSyncExternalStore } from "react";
import { useI18n } from "@/components/I18nProvider";
import { CheckIcon, ExternalIcon, PlusIcon, VerifiedIcon } from "@/components/icons";
import { formatCount } from "@/lib/format";
import { kickChannelUrl, type Channel } from "@/lib/kick/types";
import { followsStore, isFollowing, MAX_FOLLOWS, toggleFollow } from "@/lib/library";
import { useChannelInfo } from "@/lib/live-client";
import { toast } from "@/lib/toast";

// Server-rendered when Kick answered during SSR; otherwise fetched once the
// page is interactive, so a slow Kick never blocks the feed itself.
export default function ChannelHeader({ slug, initial }: { slug: string; initial: Channel | null }) {
  const fetched = useChannelInfo(slug, initial === null, 0);
  const channel = initial ?? fetched;
  return channel ? <ChannelBar channel={channel} /> : null;
}

// Compact profile strip shown over a channel's feed: who this is, whether
// they're live right now (with a one-tap jump into the stream on Kick), and
// a follow toggle that feeds the Following tab.
function ChannelBar({ channel }: { channel: Channel }) {
  const { t, locale } = useI18n();
  const follows = useSyncExternalStore(followsStore.subscribe, followsStore.get, followsStore.serverSnapshot);
  const following = isFollowing(follows, channel.slug);

  function onFollow() {
    if (!toggleFollow(channel)) {
      toast(t("clip.followLimit", { n: MAX_FOLLOWS }));
      return;
    }
    toast(t(following ? "clip.unfollowed" : "clip.followed", { name: channel.username }));
  }

  return (
    <div className="pointer-events-auto mx-auto flex max-w-5xl px-3 sm:px-4">
      <div className="animate-rise-in flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-ink/70 py-2 pl-2 pr-2 backdrop-blur-md">
        <span
          className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ${
            channel.live ? "animate-live-ring ring-red-500" : "ring-kick"
          }`}
        >
          {channel.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={channel.avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-smoke font-display font-extrabold text-kick">
              {channel.username.charAt(0).toUpperCase()}
            </span>
          )}
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate font-display font-extrabold leading-tight text-fog">
            {channel.username}
            {channel.verified && (
              <VerifiedIcon width={14} height={14} className="shrink-0 text-kick" aria-label={t("channel.verified")} />
            )}
          </p>
          <p className="truncate font-mono text-[11px] text-fog/50">
            {channel.live
              ? t("channel.liveViewers", { n: formatCount(channel.live.viewers, locale) })
              : channel.followers !== null
                ? t("channel.followers", { n: formatCount(channel.followers, locale) })
                : `@${channel.slug}`}
          </p>
        </div>
        <div className="ml-1 flex shrink-0 items-center gap-1.5">
          {channel.live ? (
            <a
              href={kickChannelUrl(channel.slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-white transition-transform hover:scale-105"
              title={channel.live.title}
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              <span className="sm:hidden">{t("clip.live")}</span>
              <span className="hidden sm:inline">{t("channel.watchLive")}</span>
            </a>
          ) : (
            <a
              href={kickChannelUrl(channel.slug)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("channel.openOnKick")}
              title={t("channel.openOnKick")}
              className="rounded-full border border-kick/40 p-1.5 text-kick transition-colors hover:bg-kick hover:text-ink"
            >
              <ExternalIcon width={14} height={14} />
            </a>
          )}
          <button
            onClick={onFollow}
            aria-pressed={following}
            className={`flex items-center gap-1 rounded-full px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors ${
              following ? "border border-white/15 text-fog/80 hover:border-fog/40" : "bg-kick text-ink hover:bg-kick-dim"
            }`}
          >
            {following ? <CheckIcon width={12} height={12} /> : <PlusIcon width={12} height={12} />}
            {t(following ? "clip.following" : "clip.follow")}
          </button>
        </div>
      </div>
    </div>
  );
}
