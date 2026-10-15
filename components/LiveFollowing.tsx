"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/components/I18nProvider";
import { SectionTitle } from "@/components/PageShell";
import { formatCount } from "@/lib/format";
import { kickChannelUrl, type Channel } from "@/lib/kick/types";
import { followsStore } from "@/lib/library";
import { fetchChannels } from "@/lib/live-client";

const MAX_CHECKED = 12;

// "Who's live right now" across the channels this browser follows. Clicking
// goes straight to the stream on Kick: the clip feed is the hook, the live
// stream is where viewers should end up.
export default function LiveFollowing() {
  const { t, locale } = useI18n();
  const follows = useSyncExternalStore(followsStore.subscribe, followsStore.get, followsStore.serverSnapshot);
  const [live, setLive] = useState<Channel[]>([]);
  const key = follows
    .slice(0, MAX_CHECKED)
    .map((f) => f.slug)
    .join(",");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void fetchChannels(key.split(",")).then((res) => {
      if (cancelled) return;
      setLive(
        Object.values(res)
          .filter((c): c is Channel => c !== null && c.live !== null)
          .sort((a, b) => (b.live?.viewers ?? 0) - (a.live?.viewers ?? 0)),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (!key || live.length === 0) return null;

  return (
    <section className="mb-10">
      <SectionTitle>{t("explore.liveFollowing")}</SectionTitle>
      <ul className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
        {live.map((c) => (
          <li key={c.slug} className="w-36 shrink-0">
            <a
              href={kickChannelUrl(c.slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/5 p-3 text-center transition-colors hover:border-red-500/70"
            >
              <span className="animate-live-ring relative h-16 w-16 overflow-hidden rounded-full ring-2 ring-red-500">
                {c.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-smoke font-display text-xl font-extrabold text-kick">
                    {c.username.charAt(0).toUpperCase()}
                  </span>
                )}
              </span>
              <span className="w-full truncate text-sm font-semibold text-fog">{c.username}</span>
              <span className="flex items-center gap-1 rounded-sm bg-red-600 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                {formatCount(c.live?.viewers ?? 0, locale)}
              </span>
              {c.live?.title && (
                <span className="line-clamp-2 text-[11px] leading-snug text-fog/50">{c.live.title}</span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
