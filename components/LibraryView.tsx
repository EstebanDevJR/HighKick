"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import ClipTile from "@/components/ClipTile";
import Feed from "@/components/Feed";
import { useI18n } from "@/components/I18nProvider";
import { PlayIcon, SettingsIcon, TrashIcon, UsersIcon } from "@/components/icons";
import { historyStore, likedClips, likesStore, followsStore, toggleFollow, watchedIdsStore } from "@/lib/library";
import type { Clip } from "@/lib/kick/types";
import type { MessageKey } from "@/lib/i18n/messages";
import { foldText } from "@/lib/text";

type Tab = "liked" | "history" | "following";

const TABS: { value: Tab; label: MessageKey }[] = [
  { value: "liked", label: "library.liked" },
  { value: "history", label: "library.history" },
  { value: "following", label: "library.following" },
];

function matches(clip: Clip, q: string): boolean {
  if (!q) return true;
  const hay = foldText(`${clip.title} ${clip.channel.username} ${clip.category?.name ?? ""}`);
  return hay.includes(foldText(q));
}

export default function LibraryView() {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<Tab>("liked");
  const [filter, setFilter] = useState("");
  const [player, setPlayer] = useState<{ clips: Clip[]; index: number } | null>(null);

  const likes = useSyncExternalStore(likesStore.subscribe, likesStore.get, likesStore.serverSnapshot);
  const history = useSyncExternalStore(historyStore.subscribe, historyStore.get, historyStore.serverSnapshot);
  const follows = useSyncExternalStore(followsStore.subscribe, followsStore.get, followsStore.serverSnapshot);

  const liked = useMemo(() => likedClips(likes), [likes]);
  const list = useMemo(
    () => (tab === "liked" ? liked : tab === "history" ? history : []),
    [tab, liked, history],
  );
  const visible = useMemo(() => list.filter((c) => matches(c, filter)), [list, filter]);

  const emptyKey: MessageKey =
    tab === "liked" ? "library.emptyLiked" : tab === "history" ? "library.emptyHistory" : "library.emptyFollowing";

  if (player) {
    return (
      <Feed
        source={{ kind: "static", clips: player.clips }}
        startIndex={player.index}
        variant="overlay"
        onClose={() => setPlayer(null)}
      />
    );
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex rounded-full border border-white/10 bg-smoke p-1">
          {TABS.map((item) => (
            <button
              key={item.value}
              role="tab"
              aria-selected={tab === item.value}
              onClick={() => setTab(item.value)}
              className={`rounded-full px-3.5 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider transition-colors ${
                tab === item.value ? "bg-kick text-ink" : "text-fog/60 hover:text-fog"
              }`}
            >
              {t(item.label)}
              <span className="ml-1.5 opacity-60">
                {item.value === "liked" ? liked.length : item.value === "history" ? history.length : follows.length}
              </span>
            </button>
          ))}
        </div>
        {tab !== "following" && list.length > 0 && (
          <>
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("library.filter")}
              aria-label={t("library.filter")}
              className="min-w-0 flex-1 rounded-full border border-white/10 bg-smoke px-4 py-2 text-sm text-fog outline-none placeholder:text-fog/35 focus:border-kick/60 focus-visible:outline-none sm:max-w-xs [&::-webkit-search-cancel-button]:hidden"
            />
            <button
              onClick={() => visible.length > 0 && setPlayer({ clips: visible, index: 0 })}
              className="flex items-center gap-1.5 rounded-full bg-kick px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-ink transition-colors hover:bg-kick-dim"
            >
              <PlayIcon width={12} height={12} />
              {t("library.playAll")}
            </button>
          </>
        )}
        {tab === "history" && history.length > 0 && (
          <button
            onClick={() => {
              historyStore.set([]);
              watchedIdsStore.set([]);
            }}
            className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-2 font-mono text-xs uppercase tracking-wider text-fog/60 transition-colors hover:border-red-500/60 hover:text-red-400"
          >
            <TrashIcon width={12} height={12} />
            {t("library.clearHistory")}
          </button>
        )}
      </div>

      {tab === "following" ? (
        follows.length === 0 ? (
          <EmptyState text={t(emptyKey)} />
        ) : (
          <>
            <Link
              href="/?feed=following"
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-kick bg-kick/10 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-kick transition-colors hover:bg-kick hover:text-ink"
            >
              <UsersIcon width={14} height={14} />
              {t("mode.followingTitle")}
            </Link>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {follows.map((f) => (
                <li
                  key={f.slug}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-smoke px-3 py-2.5"
                >
                  <Link href={`/c/${f.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-kick/50">
                      {f.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.avatar} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center bg-ink font-display font-extrabold text-kick">
                          {f.username.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-fog">{f.username}</span>
                      <span className="block truncate font-mono text-[11px] text-fog/45">@{f.slug}</span>
                    </span>
                  </Link>
                  <button
                    onClick={() => toggleFollow(f)}
                    className="shrink-0 rounded-full border border-white/15 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-fog/70 transition-colors hover:border-red-500/60 hover:text-red-400"
                  >
                    {t("clip.unfollow")}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )
      ) : list.length === 0 ? (
        <EmptyState text={t(emptyKey)} />
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((clip, i) => (
            <li key={clip.id}>
              <ClipTile clip={clip} locale={locale} onClick={() => setPlayer({ clips: visible, index: i })} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 px-6 py-16 text-center">
      <p className="max-w-sm text-sm text-fog/55">{text}</p>
    </div>
  );
}

export function LibrarySettingsLink({ label }: { label: string }) {
  return (
    <Link
      href="/settings"
      aria-label={label}
      title={label}
      className="rounded-full border border-white/10 bg-smoke p-2.5 text-fog/70 transition-colors hover:border-kick/40 hover:text-kick md:hidden"
    >
      <SettingsIcon width={18} height={18} />
    </Link>
  );
}
