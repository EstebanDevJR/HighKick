"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { preconnect } from "react-dom";
import type { Clip, ClipsPage, ClipTime } from "@/lib/kick/types";
import { getTopCategories, getTopChannels } from "@/lib/affinity";
import { isTypingTarget, sendClipCommand } from "@/lib/commands";
import {
  followsStore,
  getWatchedSet,
  hiddenStore,
  isHiddenClip,
  markWatched,
  type Hidden,
} from "@/lib/library";
import { isUnplayable, markUnplayable, probeClip } from "@/lib/playable";
import { prefsStore, setPref } from "@/lib/prefs";
import { toast } from "@/lib/toast";
import ClipCard from "@/components/ClipCard";
import TopBar, { type FeedMode } from "@/components/TopBar";
import { useI18n } from "@/components/I18nProvider";
import { ChevronLeftIcon, CompassIcon, KickBoltIcon, ShuffleIcon } from "@/components/icons";

export interface FeedScope {
  channel?: string;
  category?: string;
  label: string;
}

export type FeedSource =
  | { kind: "home" }
  | { kind: "scope"; scope: FeedScope }
  | { kind: "static"; clips: Clip[] };

interface FeedProps {
  source: FeedSource;
  initial?: ClipsPage | null;
  initialSeed?: string;
  initialMode?: FeedMode;
  initialTime?: ClipTime;
  startIndex?: number;
  variant?: "app" | "embed" | "overlay";
  embedHref?: string;
  // Rendered under the top bar, e.g. the channel profile strip.
  header?: React.ReactNode;
  // Shown once as a toast when the feed mounts.
  notice?: string;
  onClose?: () => void;
}

const MAX_RESHUFFLES = 5;
// How many clips from the current one onwards get their video probed, so a
// dead clip is usually gone before the viewer reaches it.
const PROBE_AHEAD = 4;

function newSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface Favorites {
  categories: string[];
  channels: string[];
}

function pageUrl(
  mode: FeedMode,
  cursor: string,
  time: ClipTime,
  seed: string,
  favs: Favorites,
  followed: string[],
  scope?: FeedScope,
): string {
  if (mode === "mix" && scope) {
    const qs = new URLSearchParams({ seed, page: cursor });
    if (scope.channel) qs.set("channel", scope.channel);
    if (scope.category) qs.set("category", scope.category);
    return `/api/feed?${qs}`;
  }
  if (mode === "mix") {
    const qs = new URLSearchParams({ seed, page: cursor });
    if (favs.categories.length > 0) qs.set("fc", favs.categories.join(","));
    if (favs.channels.length > 0) qs.set("fh", favs.channels.join(","));
    return `/api/feed?${qs}`;
  }
  if (mode === "following") {
    return `/api/following?${new URLSearchParams({ ch: followed.join(","), page: cursor })}`;
  }
  const qs = new URLSearchParams({ cursor, sort: mode, time });
  if (scope?.channel) qs.set("channel", scope.channel);
  if (scope?.category) qs.set("category", scope.category);
  return `/api/clips?${qs}`;
}

async function fetchPage(url: string): Promise<ClipsPage> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

function appendUnique(existing: Clip[], incoming: Clip[]): Clip[] {
  const seen = new Set(existing.map((c) => c.id));
  return [...existing, ...incoming.filter((c) => !seen.has(c.id))];
}

function isFilteredOut(clip: Clip, hideMature: boolean, hidden: Hidden): boolean {
  return (hideMature && clip.mature) || isHiddenClip(hidden, clip) || isUnplayable(clip.id);
}

// 18+, "not interested" and known-dead clips are removed outright. Watched
// clips are only dropped in the home MIX — unless that would empty the page,
// in which case repeats beat a blank feed. A channel's own MIX keeps them:
// there it's the shuffle people asked for, not discovery.
function filterClips(
  clips: Clip[],
  dropWatched: boolean,
  hideMature: boolean,
  hidden: Hidden,
): Clip[] {
  const pool = clips.filter((c) => !isFilteredOut(c, hideMature, hidden));
  if (!dropWatched) return pool;
  const watched = getWatchedSet();
  const unseen = pool.filter((c) => !watched.has(c.id));
  return unseen.length > 0 ? unseen : pool;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function Feed({
  source,
  initial = null,
  initialSeed,
  initialMode,
  initialTime,
  startIndex = 0,
  variant = "app",
  embedHref,
  header,
  notice,
  onClose,
}: FeedProps) {
  const { t } = useI18n();
  const scope = source.kind === "scope" ? source.scope : undefined;
  const isStatic = source.kind === "static";
  const isEmbed = variant === "embed";

  // Scoped feeds (one channel / one category) start on most-viewed of all
  // time, the natural "best of" view; their MIX shuffles just that scope.
  const defaultMode: FeedMode = initialMode ?? (source.kind === "home" ? "mix" : "view");
  const defaultTime: ClipTime = initialTime ?? (scope ? "all" : "day");
  const startClips = isStatic ? source.clips : (initial?.clips ?? []);

  const prefs = useSyncExternalStore(prefsStore.subscribe, prefsStore.get, prefsStore.serverSnapshot);
  const hidden = useSyncExternalStore(hiddenStore.subscribe, hiddenStore.get, hiddenStore.serverSnapshot);
  const follows = useSyncExternalStore(followsStore.subscribe, followsStore.get, followsStore.serverSnapshot);

  const [clips, setClips] = useState<Clip[]>(startClips);
  const [mode, setMode] = useState<FeedMode>(defaultMode);
  const [time, setTime] = useState<ClipTime>(defaultTime);
  // Browsers block unmuted autoplay until the first gesture, so every visit
  // starts muted; a saved "sound on" preference is restored on first input.
  const [muted, setMuted] = useState(true);
  const [activeIndex, setActiveIndex] = useState(
    Math.max(0, Math.min(startIndex, startClips.length - 1)),
  );
  const [loading, setLoading] = useState(!isStatic && !initial);
  const [error, setError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(
    isStatic || (initial !== null && !initial.nextCursor && defaultMode !== "mix"),
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const clipsRef = useRef<Clip[]>(startClips);
  const cursorRef = useRef<string | null>(isStatic ? null : (initial?.nextCursor ?? null));
  const seedRef = useRef(initialSeed ?? "");
  const reshufflesRef = useRef(0);
  const fetchingRef = useRef(false);
  const generationRef = useRef(0);
  const favsRef = useRef<Favorites>({ categories: [], channels: [] });
  const followedRef = useRef<string[]>([]);
  const filterRef = useRef({ hideMature: prefs.hideMature, hidden });
  const volumeRef = useRef(prefs.volume);

  const modes: FeedMode[] =
    source.kind === "home"
      ? ["mix", ...(follows.length > 0 || mode === "following" ? (["following"] as const) : []), "view", "date"]
      : source.kind === "scope"
        ? ["mix", "view", "date"]
        : [];

  preconnect("https://clips.kick.com");

  useEffect(() => {
    filterRef.current = { hideMature: prefs.hideMature, hidden };
    volumeRef.current = prefs.volume;
  }, [prefs.hideMature, prefs.volume, hidden]);

  useEffect(() => {
    if (prefs.muted) return;
    const unmute = () => setMuted(false);
    window.addEventListener("pointerdown", unmute, { once: true });
    window.addEventListener("keydown", unmute, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unmute);
      window.removeEventListener("keydown", unmute);
    };
  }, [prefs.muted]);

  useEffect(() => {
    if (notice) toast(notice);
  }, [notice]);

  // Deep links into a list (the Library player) open on the chosen clip.
  const startIndexRef = useRef(startIndex);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container && startIndexRef.current > 0) {
      container.scrollTop = startIndexRef.current * container.clientHeight;
    }
  }, []);

  // Favorites and follows are snapshotted alongside the seed: refreshing
  // them only when the deck changes keeps pagination deterministic.
  const snapshotPersonalization = useCallback(() => {
    favsRef.current = { categories: getTopCategories(4), channels: getTopChannels(4) };
    followedRef.current = followsStore.get().map((f) => f.slug);
  }, []);

  const replaceClips = useCallback((next: Clip[]) => {
    clipsRef.current = next;
    setClips(next);
  }, []);

  const loadFirstPage = useCallback(
    async (nextMode: FeedMode, nextTime: ClipTime) => {
      const generation = ++generationRef.current;
      cursorRef.current = null;
      reshufflesRef.current = 0;
      if (nextMode === "mix" && !seedRef.current) seedRef.current = newSeed();
      snapshotPersonalization();

      if (nextMode === "following" && followedRef.current.length === 0) {
        setLoading(false);
        setExhausted(true);
        return;
      }

      setError(null);
      setLoading(true);
      setExhausted(false);
      try {
        const page = await fetchPage(
          pageUrl(nextMode, "0", nextTime, seedRef.current, favsRef.current, followedRef.current, scope),
        );
        if (generation !== generationRef.current) return;
        const { hideMature, hidden: hiddenNow } = filterRef.current;
        replaceClips(filterClips(page.clips, nextMode === "mix" && !scope, hideMature, hiddenNow));
        cursorRef.current = page.nextCursor;
        // Only the home MIX deals a fresh deck when one runs out.
        if (!page.nextCursor && (nextMode !== "mix" || scope)) setExhausted(true);
      } catch {
        if (generation !== generationRef.current) return;
        setError(t("feed.error"));
      } finally {
        if (generation === generationRef.current) setLoading(false);
      }
    },
    [replaceClips, snapshotPersonalization, scope, t],
  );

  const resetFeed = useCallback(
    (nextMode: FeedMode, nextTime: ClipTime) => {
      replaceClips([]);
      setActiveIndex(0);
      if (nextMode === "mix") seedRef.current = newSeed();
      containerRef.current?.scrollTo({ top: 0 });
      void loadFirstPage(nextMode, nextTime);
    },
    [loadFirstPage, replaceClips],
  );

  const loadMore = useCallback(async () => {
    const cursor = cursorRef.current;
    if (!cursor || fetchingRef.current || isStatic) return;
    fetchingRef.current = true;
    const generation = generationRef.current;
    try {
      const page = await fetchPage(
        pageUrl(mode, cursor, time, seedRef.current, favsRef.current, followedRef.current, scope),
      );
      if (generation !== generationRef.current) return;
      const { hideMature, hidden: hiddenNow } = filterRef.current;
      const fresh = filterClips(page.clips, mode === "mix" && !scope, hideMature, hiddenNow);
      replaceClips(appendUnique(clipsRef.current, fresh));

      if (page.nextCursor) {
        cursorRef.current = page.nextCursor;
      } else if (
        mode === "mix" &&
        !scope &&
        page.clips.length > 0 &&
        reshufflesRef.current < MAX_RESHUFFLES
      ) {
        // Deck exhausted: deal a fresh one. The seed changes so the order
        // differs, and dedupe + watch history drop anything already shown.
        reshufflesRef.current += 1;
        seedRef.current = newSeed();
        snapshotPersonalization();
        cursorRef.current = "0";
      } else {
        cursorRef.current = null;
        setExhausted(true);
      }
    } catch {
      // transient — the next scroll near the end retries
    } finally {
      fetchingRef.current = false;
    }
  }, [mode, time, scope, isStatic, replaceClips, snapshotPersonalization]);

  // First load when the server couldn't prefetch (Kick hiccup, or a feed
  // like Following that depends on what's in this browser). Mount-only:
  // later mode/time changes go through resetFeed.
  const mountRef = useRef({ isStatic, hasInitial: initial !== null, defaultMode, defaultTime });
  useEffect(() => {
    const { isStatic: staticList, hasInitial, defaultMode: m, defaultTime: tm } = mountRef.current;
    if (staticList || hasInitial) {
      snapshotPersonalization();
      return;
    }
    void loadFirstPage(m, tm);
  }, [loadFirstPage, snapshotPersonalization]);

  // Turning a filter on also scrubs clips that are already loaded; turning
  // it off only affects pages fetched from then on.
  const activeIndexRef = useRef(activeIndex);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    const current = clipsRef.current;
    const filtered = current.filter((c) => !isFilteredOut(c, prefs.hideMature, hidden));
    if (filtered.length === current.length) return;
    const index = activeIndexRef.current;
    const activeId = current[index]?.id;
    replaceClips(filtered);
    const kept = filtered.findIndex((c) => c.id === activeId);
    setActiveIndex(kept >= 0 ? kept : Math.max(0, Math.min(index, filtered.length - 1)));
  }, [prefs.hideMature, hidden, replaceClips]);

  // Dead clips ahead of the viewer are dropped; ones already scrolled past
  // stay, since removing them would yank the feed out from under the user.
  const dropUnplayable = useCallback(
    (id: string) => {
      markUnplayable(id);
      const current = clipsRef.current;
      const index = current.findIndex((c) => c.id === id);
      if (index < 0 || index < activeIndexRef.current) return;
      const next = current.filter((c) => c.id !== id);
      replaceClips(next);
      setActiveIndex((i) => Math.max(0, Math.min(i, next.length - 1)));
    },
    [replaceClips],
  );

  useEffect(() => {
    for (const clip of clips.slice(activeIndex, activeIndex + PROBE_AHEAD)) {
      void probeClip(clip).then((ok) => {
        if (!ok) dropUnplayable(clip.id);
      });
    }
  }, [clips, activeIndex, dropUnplayable]);

  // Track which card owns the viewport.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.index);
            if (!Number.isNaN(idx)) setActiveIndex(idx);
          }
        }
      },
      { root: container, threshold: 0.6 },
    );
    container.querySelectorAll("[data-index]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [clips.length]);

  // Record history and pull the next page a few cards before the end.
  useEffect(() => {
    const clip = clipsRef.current[activeIndex];
    if (clip && !isEmbed) markWatched(clip);
    if (clips.length > 0 && activeIndex >= clips.length - 3) void loadMore();
  }, [activeIndex, clips.length, loadMore, isEmbed]);

  const scrollByCard = useCallback((dir: 1 | -1) => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollBy({
      top: dir * container.clientHeight,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, []);

  const autoplayNext = prefs.autoplayNext;
  const handleClipEnded = useCallback(
    (index: number): boolean => {
      if (!autoplayNext || index >= clipsRef.current.length - 1) return false;
      scrollByCard(1);
      return true;
    },
    [autoplayNext, scrollByCard],
  );

  const handleVolumeChange = useCallback((v: number) => {
    const next = Math.max(0, Math.min(1, Math.round(v * 20) / 20));
    volumeRef.current = next;
    setPref("volume", next);
    setPref("muted", next === 0);
    setMuted(next === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    setPref("muted", next);
  }, [muted]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (document.querySelector("[role='dialog'][aria-modal='true']")) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      switch (key) {
        case "ArrowDown":
        case "j":
          e.preventDefault();
          scrollByCard(1);
          break;
        case "ArrowUp":
        case "k":
          e.preventDefault();
          scrollByCard(-1);
          break;
        case " ":
          e.preventDefault();
          sendClipCommand({ type: "toggle-play" });
          break;
        case "ArrowLeft":
        case "ArrowRight":
          e.preventDefault();
          sendClipCommand({ type: "seek", by: key === "ArrowLeft" ? -5 : 5 });
          break;
        case "l":
          sendClipCommand({ type: "like" });
          break;
        case "s":
          if (!isEmbed) sendClipCommand({ type: "share" });
          break;
        case "m":
          toggleMute();
          break;
        case "[":
          handleVolumeChange(volumeRef.current - 0.1);
          break;
        case "]":
          handleVolumeChange(volumeRef.current + 0.1);
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleVolumeChange, scrollByCard, toggleMute, isEmbed]);

  function handleModeChange(next: FeedMode) {
    // Re-tapping MIX deals a new shuffle on purpose.
    if (next === mode && next !== "mix") return;
    setMode(next);
    resetFeed(next, time);
  }

  function handleTimeChange(next: ClipTime) {
    if (next === time) return;
    setTime(next);
    resetFeed(mode, next);
  }

  const rootClass =
    variant === "overlay"
      ? "fixed inset-0 z-[60] h-dvh bg-ink"
      : variant === "embed"
        ? "relative h-dvh bg-ink"
        : "relative h-[calc(100dvh-var(--nav-h))] bg-ink";

  const followingEmpty = mode === "following" && !loading && clips.length === 0 && follows.length === 0;
  const showEnd = exhausted && !loading && clips.length > 0 && !isStatic;

  return (
    <main className={rootClass}>
      <TopBar
        mode={mode}
        modes={modes}
        time={time}
        muted={muted}
        volume={prefs.volume}
        hideMature={prefs.hideMature}
        scopeLabel={scope?.label}
        embedHref={embedHref}
        onModeChange={handleModeChange}
        onTimeChange={handleTimeChange}
        onToggleMute={toggleMute}
        onVolumeChange={handleVolumeChange}
        onToggleMature={() => setPref("hideMature", !prefs.hideMature)}
      />

      {onClose && (
        <button
          onClick={onClose}
          className="absolute left-3 top-3 z-50 flex items-center gap-1 rounded-full border border-white/10 bg-smoke/90 py-1.5 pl-2 pr-3 font-mono text-xs font-semibold text-fog backdrop-blur-md transition-colors hover:border-kick/40 hover:text-kick"
        >
          <ChevronLeftIcon width={16} height={16} />
          {t("nav.back")}
        </button>
      )}

      {header && <div className="pointer-events-none absolute inset-x-0 top-14 z-30">{header}</div>}

      <div ref={containerRef} className="no-scrollbar h-full snap-y snap-mandatory overflow-y-scroll">
        {clips.map((clip, i) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            index={i}
            active={i === activeIndex}
            preload={!prefs.dataSaver && Math.abs(i - activeIndex) === 1}
            muted={muted}
            volume={prefs.volume}
            dataSaver={prefs.dataSaver}
            embed={isEmbed}
            onToggleMute={toggleMute}
            onVolumeChange={handleVolumeChange}
            onEnded={() => handleClipEnded(i)}
            onUnplayable={() => dropUnplayable(clip.id)}
          />
        ))}

        {showEnd && (
          <section className="flex h-full snap-start flex-col items-center justify-center gap-5 px-8 text-center">
            <KickBoltIcon width={42} height={42} className="text-glow text-kick" />
            <p className="font-display text-xl font-extrabold text-fog">{t("feed.end")}</p>
            <div className="flex flex-wrap justify-center gap-3">
              {modes.includes("mix") && (
                <button
                  onClick={() => handleModeChange("mix")}
                  className="flex items-center gap-2 border border-kick bg-kick/10 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-widest text-kick transition-colors hover:bg-kick hover:text-ink"
                >
                  <ShuffleIcon width={14} height={14} />
                  {t("mode.mix")}
                </button>
              )}
              {!isEmbed && (
                <Link
                  href="/explore"
                  className="flex items-center gap-2 border border-white/15 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-widest text-fog/80 transition-colors hover:border-kick hover:text-kick"
                >
                  <CompassIcon width={14} height={14} />
                  {t("nav.explore")}
                </Link>
              )}
            </div>
          </section>
        )}

        {loading && clips.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <KickBoltIcon width={42} height={42} className="text-glow animate-pulse text-kick" />
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-fog/50">{t("feed.loading")}</p>
          </div>
        )}

        {followingEmpty && (
          <div className="flex h-full flex-col items-center justify-center gap-5 px-8 text-center">
            <KickBoltIcon width={42} height={42} className="text-fog/20" />
            <p className="max-w-sm text-sm text-fog/70">{t("feed.followingEmpty")}</p>
            <Link
              href="/explore"
              className="border border-kick bg-kick/10 px-5 py-2 font-mono text-xs font-semibold uppercase tracking-widest text-kick transition-colors hover:bg-kick hover:text-ink"
            >
              {t("feed.followingCta")}
            </Link>
          </div>
        )}

        {!loading && !error && !followingEmpty && clips.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
            <KickBoltIcon width={42} height={42} className="text-fog/20" />
            <p className="max-w-sm text-sm text-fog/70">
              {scope ? t("feed.emptyScoped", { label: scope.label }) : t("feed.empty")}
            </p>
          </div>
        )}

        {error && clips.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-5 px-8 text-center">
            <KickBoltIcon width={42} height={42} className="text-fog/20" />
            <p className="max-w-sm text-sm text-fog/70">{error}</p>
            <button
              onClick={() => resetFeed(mode, time)}
              className="border border-kick bg-kick/10 px-5 py-2 font-mono text-xs font-semibold uppercase tracking-widest text-kick transition-colors hover:bg-kick hover:text-ink"
            >
              {t("feed.retry")}
            </button>
          </div>
        )}
      </div>

      {!isEmbed && (
        <p
          data-ui="kbd-hint"
          className="pointer-events-none absolute bottom-2 left-1/2 z-30 hidden -translate-x-1/2 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.25em] text-fog/30 lg:block"
        >
          {t("feed.kbdHint")}
        </p>
      )}
    </main>
  );
}
