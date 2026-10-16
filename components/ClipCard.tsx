"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import Hls from "hls.js";
import { kickChannelUrl, kickClipUrl, type Clip } from "@/lib/kick/types";
import { recordAffinity, watchSignal } from "@/lib/affinity";
import { onClipCommand, type ClipCommand } from "@/lib/commands";
import { isProgressiveUrl, markUnplayable, probeClip } from "@/lib/playable";
import { formatCount, formatDuration, timeAgo } from "@/lib/format";
import {
  followsStore,
  hideCategory,
  hideChannel,
  isFollowing,
  likesStore,
  MAX_FOLLOWS,
  setLiked,
  toggleFollow,
} from "@/lib/library";
import { useChannelInfo } from "@/lib/live-client";
import { toast } from "@/lib/toast";
import { useI18n } from "@/components/I18nProvider";
import ShareSheet from "@/components/ShareSheet";
import Sheet, { SheetAction } from "@/components/Sheet";
import {
  CheckIcon,
  ExternalIcon,
  EyeIcon,
  EyeOffIcon,
  HeartIcon,
  KickBoltIcon,
  MoreIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  ShareIcon,
  VolumeOffIcon,
  VolumeOnIcon,
} from "@/components/icons";

interface ClipCardProps {
  clip: Clip;
  index: number;
  active: boolean;
  preload: boolean;
  muted: boolean;
  volume: number;
  dataSaver: boolean;
  embed?: boolean;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  // Returns true when the feed advanced to the next clip; false means the
  // clip should replay in place (last card, or auto-advance is off).
  onEnded: () => boolean;
  // The video is gone from Kick's CDN; the feed drops the card.
  onUnplayable?: () => void;
}

interface Burst {
  key: number;
  x: number;
  y: number;
}

// Data saver caps playback at 480p, which keeps a clip around a few MB.
const DATA_SAVER_MAX_HEIGHT = 480;
// Below this, leaving the card is a strict-mode remount or a scroll
// overshoot, not a real "skip" signal.
const MIN_DWELL_FOR_SIGNAL_MS = 400;

export default function ClipCard({
  clip,
  index,
  active,
  preload,
  muted,
  volume,
  dataSaver,
  embed = false,
  onToggleMute,
  onVolumeChange,
  onEnded,
  onUnplayable,
}: ClipCardProps) {
  const { t, locale } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const seekAreaRef = useRef<HTMLDivElement>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekingRef = useRef(false);
  const maxFractionRef = useRef(0);

  const liked = useSyncExternalStore(
    likesStore.subscribe,
    () => clip.id in likesStore.get(),
    () => false,
  );
  const follows = useSyncExternalStore(
    followsStore.subscribe,
    followsStore.get,
    followsStore.serverSnapshot,
  );
  const following = isFollowing(follows, clip.channel.slug);
  const channelInfo = useChannelInfo(clip.channel.slug, active && !embed);
  const live = channelInfo?.live ?? null;

  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [flash, setFlash] = useState<{ kind: "play" | "pause"; key: number } | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [scrubbing, setScrubbing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const shouldLoad = active || preload;
  const linkTarget = embed ? "_blank" : undefined;

  // A 4xx from the CDN settles it; any other fatal error (Safari only says
  // "network" or "unsupported") is double-checked with a probe first, so a
  // flaky connection or a codec quirk never hides a working clip.
  const reportPlaybackError = useEffectEvent((rejectedByCdn: boolean) => {
    if (!onUnplayable) return;
    if (rejectedByCdn) {
      markUnplayable(clip.id);
      onUnplayable();
      return;
    }
    void probeClip(clip, true).then((ok) => {
      if (!ok) onUnplayable();
    });
  });

  // Attach the HLS source only while the card is on (or next to) screen,
  // and tear it down when it scrolls far away to keep memory bounded.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldLoad) return;

    // Prefer hls.js over native playback: Chrome answers "maybe" to the HLS
    // MIME type but can't actually demux it. Safari takes the native branch.
    let hls: Hls | null = null;
    const onNativeError = () => reportPlaybackError(false);
    if (isProgressiveUrl(clip.videoUrl)) {
      video.addEventListener("error", onNativeError);
      video.src = clip.videoUrl;
    } else if (Hls.isSupported()) {
      const instance = new Hls({
        maxBufferLength: dataSaver ? 6 : 12,
        capLevelToPlayerSize: true,
        startLevel: dataSaver ? 0 : -1,
      });
      if (dataSaver) {
        instance.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
          let cap = 0;
          data.levels.forEach((level, i) => {
            if (level.height && level.height <= DATA_SAVER_MAX_HEIGHT) cap = i;
          });
          instance.autoLevelCapping = cap;
        });
      }
      instance.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        const status = data.response?.code ?? 0;
        reportPlaybackError(status >= 400 && status < 500 && status !== 408 && status !== 429);
      });
      instance.loadSource(clip.videoUrl);
      instance.attachMedia(video);
      hls = instance;
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.addEventListener("error", onNativeError);
      video.src = clip.videoUrl;
    }

    return () => {
      video.removeEventListener("error", onNativeError);
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [shouldLoad, clip.videoUrl, dataSaver]);

  // `paused` mirrors the element's play/pause events so the big play glyph
  // only shows when playback is actually stopped on the active card.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onPlaying);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("canplay", onPlaying);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      video.play().catch(() => {});
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [active, shouldLoad]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = muted;
      video.volume = volume;
    }
  }, [muted, volume, shouldLoad]);

  // Taste signal from how much of the clip was actually watched, recorded
  // when the card stops being the active one.
  const recordWatch = useEffectEvent((dwellMs: number) => {
    if (dwellMs < MIN_DWELL_FOR_SIGNAL_MS) return;
    recordAffinity(clip, watchSignal(maxFractionRef.current, dwellMs));
  });

  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    maxFractionRef.current = 0;
    return () => recordWatch(Date.now() - started);
  }, [active]);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setFlash({ kind: "play", key: Date.now() });
    } else {
      video.pause();
      setFlash({ kind: "pause", key: Date.now() });
    }
  }

  function like(at?: { x: number; y: number }) {
    if (!liked) {
      recordAffinity(clip, 3);
      setLiked(clip, true);
    }
    const section = videoRef.current?.closest("section");
    const point = at ?? {
      x: (section?.clientWidth ?? 0) / 2,
      y: (section?.clientHeight ?? 0) / 2,
    };
    const burst = { key: Date.now(), ...point };
    setBursts((b) => [...b.slice(-3), burst]);
    setTimeout(() => setBursts((b) => b.filter((x) => x.key !== burst.key)), 850);
  }

  function toggleLike() {
    if (!liked) recordAffinity(clip, 3);
    setLiked(clip, !liked);
  }

  function seekBy(seconds: number) {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    video.currentTime = Math.max(0, Math.min(video.duration - 0.1, video.currentTime + seconds));
  }

  const handleCommand = useEffectEvent((cmd: ClipCommand) => {
    if (cmd.type === "toggle-play") togglePlay();
    else if (cmd.type === "like") like();
    else if (cmd.type === "share") setShareOpen(true);
    else if (cmd.type === "seek") seekBy(cmd.by);
  });

  useEffect(() => {
    if (!active) return;
    return onClipCommand((cmd) => handleCommand(cmd));
  }, [active]);

  function handleFollow() {
    const wasFollowing = following;
    if (!toggleFollow(clip.channel)) {
      toast(t("clip.followLimit", { n: MAX_FOLLOWS }));
      return;
    }
    if (!wasFollowing) recordAffinity(clip, 2);
    toast(t(wasFollowing ? "clip.unfollowed" : "clip.followed", { name: clip.channel.username }));
  }

  function hide(kind: "channel" | "category") {
    setMenuOpen(false);
    recordAffinity(clip, -3);
    const category = clip.category;
    if (kind === "channel") hideChannel(clip.channel);
    else if (category) hideCategory(category);
    toast(t("clip.hiddenToast"), {
      label: t("clip.undo"),
      run: () => {
        if (kind === "channel") hideChannel(clip.channel, false);
        else if (category) hideCategory(category, false);
      },
    });
  }

  // Single tap toggles playback, double tap likes.
  function handleSurfaceClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const at = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      like(at);
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        togglePlay();
      }, 260);
    }
  }

  // The bar and its aria value update imperatively to avoid re-rendering
  // the card several times per second.
  function paintProgress(frac: number) {
    if (progressRef.current) progressRef.current.style.width = `${frac * 100}%`;
    seekAreaRef.current?.setAttribute("aria-valuenow", String(Math.round(frac * 100)));
  }

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    const frac = video.currentTime / video.duration;
    if (frac > maxFractionRef.current) maxFractionRef.current = frac;
    if (!seekingRef.current) paintProgress(frac);
  }

  function handleEnded() {
    maxFractionRef.current = 1;
    if (onEnded()) return;
    const video = videoRef.current;
    if (video && active) {
      video.currentTime = 0;
      video.play().catch(() => {});
    }
  }

  function seekTo(e: React.PointerEvent<HTMLDivElement>) {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    video.currentTime = frac * video.duration;
    paintProgress(frac);
  }

  function handleSeekDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    seekingRef.current = true;
    setScrubbing(true);
    seekTo(e);
  }

  function handleSeekMove(e: React.PointerEvent<HTMLDivElement>) {
    if (seekingRef.current) seekTo(e);
  }

  function handleSeekUp() {
    seekingRef.current = false;
    setScrubbing(false);
  }

  function handleSeekKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      seekBy(e.key === "ArrowLeft" ? -5 : 5);
    }
  }

  const likeTotal = clip.likes + (liked ? 1 : 0);
  const channelHref = `/c/${clip.channel.slug}`;

  return (
    <section
      data-index={index}
      aria-roledescription="clip"
      aria-label={`${clip.channel.username}: ${clip.title}`}
      className="relative h-full w-full snap-start snap-always overflow-hidden bg-ink"
    >
      {/* Blurred backdrop fills the letterbox around the 16:9 clip */}
      {clip.thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={clip.thumbnailUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-3xl"
        />
      )}

      <div
        className="absolute inset-0 flex cursor-pointer items-center justify-center"
        onClick={handleSurfaceClick}
      >
        <video
          ref={videoRef}
          poster={clip.thumbnailUrl || undefined}
          playsInline
          muted
          preload="metadata"
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          className="h-full w-full object-contain"
        />

        {flash && (
          <div
            key={flash.key}
            className="animate-play-flash pointer-events-none absolute rounded-full bg-ink/60 p-6 text-fog"
          >
            {flash.kind === "play" ? <PlayIcon width={36} height={36} /> : <PauseIcon width={36} height={36} />}
          </div>
        )}

        {active && paused && !flash && (
          <div
            className="pointer-events-none absolute rounded-full bg-ink/50 p-6 text-fog/90"
            aria-label={t("clip.paused")}
          >
            <PlayIcon width={36} height={36} />
          </div>
        )}

        {active && buffering && !paused && (
          <div
            aria-hidden
            className="pointer-events-none absolute h-12 w-12 animate-spin rounded-full border-2 border-kick/25 border-t-kick"
          />
        )}

        {bursts.map((b) => (
          <HeartIcon
            key={b.key}
            filled
            width={84}
            height={84}
            className="animate-heart-burst pointer-events-none absolute text-kick drop-shadow-[0_0_18px_rgba(83,252,24,0.7)]"
            style={{ left: b.x - 42, top: b.y - 42 }}
          />
        ))}
      </div>

      {/* Bottom gradient for legibility */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-ink/95 via-ink/50 to-transparent" />

      {/* Clip metadata */}
      <div
        data-ui="clip-meta"
        className="absolute bottom-6 left-4 right-20 z-10 flex flex-col gap-2 sm:bottom-9 sm:left-6"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={channelHref}
            target={linkTarget}
            className="w-fit font-display text-lg font-extrabold tracking-tight text-fog transition-colors hover:text-kick"
            title={t("clip.moreFrom", { name: clip.channel.username })}
          >
            @{clip.channel.username}
          </Link>
          {live && (
            <a
              href={kickChannelUrl(clip.channel.slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="animate-rise-in flex items-center gap-1.5 rounded-sm bg-red-600 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white shadow-[0_0_12px_rgba(220,38,38,0.6)] transition-transform hover:scale-105"
              title={t("clip.liveNow", { name: clip.channel.username })}
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              {t("clip.live")}
              <span className="font-medium normal-case tracking-normal opacity-90">
                · {formatCount(live.viewers, locale)}
              </span>
            </a>
          )}
        </div>
        {clip.title && <p className="line-clamp-2 max-w-xl text-sm text-fog/90">{clip.title}</p>}
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-fog/60">
          {clip.category && (
            <Link
              href={`/g/${clip.category.slug}`}
              target={linkTarget}
              className="border border-kick/40 bg-kick/10 px-2 py-0.5 uppercase tracking-wide text-kick transition-colors hover:bg-kick hover:text-ink"
              title={t("clip.moreCategory", { name: clip.category.name })}
            >
              {clip.category.name}
            </Link>
          )}
          <span className="flex items-center gap-1" title={t("clip.views")}>
            <EyeIcon width={12} height={12} />
            <span suppressHydrationWarning>{formatCount(clip.views, locale)}</span>
          </span>
          <span aria-hidden>·</span>
          <span>{formatDuration(clip.duration)}</span>
          <span aria-hidden>·</span>
          <span suppressHydrationWarning>{timeAgo(clip.createdAt, locale, t("time.justNow"))}</span>
          {clip.mature && (
            <span className="border border-red-500/50 bg-red-500/10 px-1.5 py-0.5 text-red-400">18+</span>
          )}
        </div>
      </div>

      {/* Action rail */}
      <aside
        data-ui="action-rail"
        className="absolute bottom-6 right-2 z-10 flex flex-col items-center gap-4 sm:bottom-9 sm:right-4"
      >
        <div className="relative mb-2">
          <Link
            href={channelHref}
            target={linkTarget}
            aria-label={t("clip.moreFrom", { name: clip.channel.username })}
            className={`block h-12 w-12 overflow-hidden rounded-full ring-2 transition-transform hover:scale-110 ${
              live ? "animate-live-ring ring-red-500" : "ring-kick"
            }`}
          >
            {clip.channel.avatar && !avatarBroken ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={clip.channel.avatar}
                alt={clip.channel.username}
                className="h-full w-full object-cover"
                onError={() => setAvatarBroken(true)}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-smoke font-display text-lg font-extrabold text-kick">
                {clip.channel.username.charAt(0).toUpperCase()}
              </span>
            )}
          </Link>
          {!embed && (
            <button
              onClick={handleFollow}
              aria-pressed={following}
              aria-label={t(following ? "clip.unfollow" : "clip.follow")}
              title={t(following ? "clip.unfollow" : "clip.follow")}
              className={`absolute -bottom-2 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full ring-2 ring-ink transition-transform hover:scale-110 ${
                following ? "bg-fog text-ink" : "bg-kick text-ink"
              }`}
            >
              {following ? (
                <CheckIcon width={12} height={12} strokeWidth={3} />
              ) : (
                <PlusIcon width={12} height={12} strokeWidth={3} />
              )}
            </button>
          )}
        </div>

        <button
          onClick={toggleLike}
          className="group flex flex-col items-center gap-1"
          aria-label={t(liked ? "clip.unlike" : "clip.like")}
          aria-pressed={liked}
        >
          <span
            className={`rounded-full bg-ink/50 p-2.5 backdrop-blur-sm transition-all group-hover:scale-110 ${
              liked ? "text-kick drop-shadow-[0_0_12px_rgba(83,252,24,0.6)]" : "text-fog"
            }`}
          >
            <HeartIcon filled={liked} width={26} height={26} />
          </span>
          <span className="font-mono text-[11px] text-fog/80" suppressHydrationWarning>
            {formatCount(likeTotal, locale)}
          </span>
        </button>

        <button
          onClick={() => setShareOpen(true)}
          className="group flex flex-col items-center gap-1"
          aria-label={t("clip.share")}
        >
          <span className="rounded-full bg-ink/50 p-2.5 text-fog backdrop-blur-sm transition-transform group-hover:scale-110">
            <ShareIcon width={26} height={26} />
          </span>
          <span className="font-mono text-[11px] text-fog/80">{t("clip.share")}</span>
        </button>

        <a
          href={kickClipUrl(clip)}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex flex-col items-center gap-1"
          aria-label={t("clip.watchOnKick")}
        >
          <span className="rounded-full border border-kick/50 bg-ink/50 p-2.5 text-kick backdrop-blur-sm transition-transform group-hover:scale-110">
            <ExternalIcon width={24} height={24} />
          </span>
          <span className="font-mono text-[11px] text-fog/80">{t("clip.kick")}</span>
        </a>

        {!embed && (
          <button
            onClick={() => setMenuOpen(true)}
            className="rounded-full bg-ink/50 p-2 text-fog/80 backdrop-blur-sm transition-transform hover:scale-110"
            aria-label={t("clip.more")}
          >
            <MoreIcon width={20} height={20} />
          </button>
        )}

        <div className="flex flex-col items-center gap-1 sm:hidden">
          <button
            onClick={() => onVolumeChange(Math.min(1, Math.round((volume + 0.1) * 10) / 10))}
            className="rounded-full bg-ink/50 px-2.5 py-1 font-mono text-sm font-bold text-fog backdrop-blur-sm"
            aria-label={t("volume.up")}
          >
            +
          </button>
          <button
            onClick={onToggleMute}
            className="rounded-full bg-ink/50 p-2 text-fog backdrop-blur-sm"
            aria-label={t(muted ? "volume.unmute" : "volume.mute")}
          >
            {muted ? <VolumeOffIcon width={20} height={20} /> : <VolumeOnIcon width={20} height={20} />}
          </button>
          <button
            onClick={() => onVolumeChange(Math.max(0, Math.round((volume - 0.1) * 10) / 10))}
            className="rounded-full bg-ink/50 px-2.5 py-1 font-mono text-sm font-bold text-fog backdrop-blur-sm"
            aria-label={t("volume.down")}
          >
            −
          </button>
        </div>
      </aside>

      {/* Playback progress — the thin bar sits inside a taller hit area so
          it stays draggable on touch screens without cluttering the UI. */}
      <div
        ref={seekAreaRef}
        className="absolute inset-x-0 bottom-0 z-20 flex h-6 cursor-pointer touch-none flex-col justify-end"
        onPointerDown={handleSeekDown}
        onPointerMove={handleSeekMove}
        onPointerUp={handleSeekUp}
        onPointerCancel={handleSeekUp}
        onKeyDown={handleSeekKey}
        tabIndex={active ? 0 : -1}
        role="slider"
        aria-label={t("clip.seek")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={0}
      >
        <div className={`w-full bg-white/10 transition-[height] duration-150 ${scrubbing ? "h-1.5" : "h-0.5"}`}>
          <div
            ref={progressRef}
            className="h-full bg-kick shadow-[0_0_8px_rgba(83,252,24,0.8)]"
            style={{ width: "0%" }}
          />
        </div>
      </div>

      <ShareSheet clip={clip} open={shareOpen} onClose={() => setShareOpen(false)} />

      <Sheet
        open={menuOpen}
        title={t("clip.more")}
        onClose={() => setMenuOpen(false)}
        closeLabel={t("share.close")}
      >
        <div className="flex flex-col">
          <SheetAction
            icon={<EyeOffIcon width={18} height={18} />}
            label={t("clip.notInterestedChannel", { name: `@${clip.channel.username}` })}
            onClick={() => hide("channel")}
          />
          {clip.category && (
            <SheetAction
              icon={<EyeOffIcon width={18} height={18} />}
              label={t("clip.notInterestedCategory", { name: clip.category.name })}
              onClick={() => hide("category")}
            />
          )}
          <SheetAction
            icon={following ? <CheckIcon width={18} height={18} /> : <PlusIcon width={18} height={18} />}
            label={t(following ? "clip.unfollow" : "clip.follow")}
            onClick={() => {
              setMenuOpen(false);
              handleFollow();
            }}
          />
          <SheetAction
            tone="kick"
            icon={<KickBoltIcon width={18} height={18} />}
            label={t("clip.watchOnKick")}
            href={kickClipUrl(clip)}
            external
            onClick={() => setMenuOpen(false)}
          />
        </div>
      </Sheet>
    </section>
  );
}
