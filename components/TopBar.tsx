"use client";

import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import type { ClipSort, ClipTime } from "@/lib/kick/types";
import type { MessageKey } from "@/lib/i18n/messages";
import { openSearch } from "@/lib/commands";
import {
  ClockIcon,
  FlameIcon,
  KickBoltIcon,
  SearchIcon,
  ShuffleIcon,
  UsersIcon,
  VolumeOffIcon,
  VolumeOnIcon,
} from "@/components/icons";

export type FeedMode = "mix" | "following" | ClipSort;

const MODE_TABS: {
  value: FeedMode;
  label: MessageKey;
  title: MessageKey;
  icon: typeof FlameIcon;
}[] = [
  { value: "mix", label: "mode.mix", title: "mode.mixTitle", icon: ShuffleIcon },
  { value: "following", label: "mode.following", title: "mode.followingTitle", icon: UsersIcon },
  { value: "view", label: "mode.top", title: "mode.topTitle", icon: FlameIcon },
  { value: "date", label: "mode.new", title: "mode.newTitle", icon: ClockIcon },
];

export const TIME_OPTIONS: { value: ClipTime; label: MessageKey }[] = [
  { value: "day", label: "time.day" },
  { value: "week", label: "time.week" },
  { value: "month", label: "time.month" },
  { value: "all", label: "time.all" },
];

interface TopBarProps {
  mode: FeedMode;
  modes: FeedMode[];
  time: ClipTime;
  muted: boolean;
  volume: number;
  hideMature: boolean;
  scopeLabel?: string;
  scopeHref?: string;
  // Embedded players get a stripped-down bar that opens the full app.
  embedHref?: string;
  onModeChange: (mode: FeedMode) => void;
  onTimeChange: (time: ClipTime) => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleMature: () => void;
}

export default function TopBar({
  mode,
  modes,
  time,
  muted,
  volume,
  hideMature,
  scopeLabel,
  scopeHref = "/",
  embedHref,
  onModeChange,
  onTimeChange,
  onToggleMute,
  onVolumeChange,
  onToggleMature,
}: TopBarProps) {
  const { t } = useI18n();
  const tabs = MODE_TABS.filter((tab) => modes.includes(tab.value));
  const showTime = mode === "view" || mode === "date";

  function cycleTime() {
    const idx = TIME_OPTIONS.findIndex((o) => o.value === time);
    onTimeChange(TIME_OPTIONS[(idx + 1) % TIME_OPTIONS.length].value);
  }

  const logo = (
    <>
      <span className="flex items-center gap-1 bg-kick px-2 py-1 font-display text-lg font-extrabold leading-none text-ink">
        <KickBoltIcon width={14} height={14} />
        HIGH
      </span>
      <span className="font-display text-lg font-extrabold leading-none tracking-tight text-fog">KICK</span>
    </>
  );

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-40 bg-gradient-to-b from-ink/90 via-ink/50 to-transparent pb-8">
      <div className="pointer-events-auto mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4">
        {embedHref ? (
          <a
            href={embedHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1.5"
            title={t("embed.openFull")}
          >
            {logo}
          </a>
        ) : (
          <Link
            href="/"
            data-ui="logo"
            className={`shrink-0 items-center gap-1.5 md:invisible ${scopeLabel ? "hidden sm:flex" : "flex"}`}
            aria-label={t("nav.homeLabel")}
          >
            {logo}
          </Link>
        )}

        {scopeLabel && !embedHref && (
          <Link
            href={scopeHref}
            data-ui="scope-pill"
            title={t("nav.backToFeed")}
            className="group flex min-w-0 shrink items-center gap-1.5 rounded-full border border-kick/40 bg-kick/10 px-3 py-1 font-mono text-xs font-semibold text-kick backdrop-blur-md transition-colors hover:bg-kick hover:text-ink"
          >
            <span className="truncate">{scopeLabel}</span>
            <span aria-hidden className="shrink-0 opacity-60 group-hover:opacity-100">
              ✕
            </span>
          </Link>
        )}

        {tabs.length > 1 && (
          <nav
            data-ui="mode-nav"
            aria-label="Feed"
            className="flex min-w-0 shrink items-center gap-1 rounded-full border border-white/10 bg-smoke/80 p-1 backdrop-blur-md"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = mode === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => onModeChange(tab.value)}
                  aria-pressed={isActive}
                  aria-label={t(tab.label)}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-xs font-semibold transition-colors sm:px-3 ${
                    isActive ? "bg-kick text-ink" : "text-fog/60 hover:text-fog"
                  }`}
                  title={t(tab.title)}
                >
                  <Icon width={12} height={12} className="shrink-0" />
                  <span className={isActive ? "hidden min-[360px]:inline" : "hidden sm:inline"}>
                    {t(tab.label)}
                  </span>
                </button>
              );
            })}
          </nav>
        )}

        <div data-ui="top-controls" className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {showTime && (
            <button
              onClick={cycleTime}
              className="rounded-full border border-kick/40 bg-smoke/80 px-3 py-1.5 font-mono text-xs font-semibold text-kick backdrop-blur-md transition-colors hover:bg-kick hover:text-ink"
              title={t("time.title")}
            >
              {t(TIME_OPTIONS.find((o) => o.value === time)?.label ?? "time.day")}
            </button>
          )}

          {!embedHref && (
            <button
              onClick={onToggleMature}
              aria-pressed={hideMature}
              className={`rounded-full border px-2.5 py-1.5 font-mono text-xs font-semibold backdrop-blur-md transition-colors ${
                hideMature
                  ? "border-white/10 bg-smoke/80 text-fog/40 line-through"
                  : "border-red-500/40 bg-smoke/80 text-red-400 hover:border-red-500/70"
              }`}
              title={t(hideMature ? "mature.hiddenTitle" : "mature.shownTitle")}
            >
              18+
            </button>
          )}

          <div className={`group items-center ${embedHref ? "flex" : "hidden sm:flex"}`}>
            <button
              onClick={onToggleMute}
              className="rounded-full border border-white/10 bg-smoke/80 p-2 text-fog/80 backdrop-blur-md transition-colors hover:border-kick/40 hover:text-kick"
              aria-label={t(muted ? "volume.unmute" : "volume.mute")}
            >
              {muted ? <VolumeOffIcon width={16} height={16} /> : <VolumeOnIcon width={16} height={16} />}
            </button>
            <div className="max-w-0 overflow-hidden opacity-0 transition-all duration-200 group-focus-within:max-w-[5rem] group-focus-within:opacity-100 group-hover:max-w-[5rem] group-hover:opacity-100">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                className="ml-1.5 w-16 cursor-pointer accent-kick"
                aria-label={t("volume.label")}
              />
            </div>
          </div>

          {!embedHref && (
            <button
              onClick={() => openSearch()}
              className="hidden rounded-full border border-white/10 bg-smoke/80 p-2 text-fog/80 backdrop-blur-md transition-colors hover:border-kick/40 hover:text-kick md:block"
              aria-label={t("search.open")}
              title={t("search.open")}
            >
              <SearchIcon width={16} height={16} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
